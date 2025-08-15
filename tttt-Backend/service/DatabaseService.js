const User = require('./models/User');
const Course = require("../models/Course")
const Payment = require("../models/Payment")
const Progress = require("../models/Progress")
const Review = require("../models/Review")
const Notification = require("../models/Notification")

class DatabaseService {
  // ===== USER OPERATIONS =====

  async createUser(userData) {
    try {
      const user = new User(userData)
      await user.save()

      // স্বাগতম নোটিফিকেশন পাঠান
      await this.createNotification({
        recipient: user._id,
        type: "welcome",
        title: "স্বাগতম!",
        message: "তালিমুল ইসলাম একাডেমিতে আপনাকে স্বাগতম। আপনার শিক্ষা যাত্রা শুরু করুন।",
      })

      return user
    } catch (error) {
      throw new Error(`User creation failed: ${error.message}`)
    }
  }

  async findUserByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() })
  }

  async updateUserProfile(userId, updateData) {
    return await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true, runValidators: true })
  }

  async enrollUserInCourse(userId, courseId) {
    try {
      const user = await User.findById(userId)
      const course = await Course.findById(courseId)

      if (!user || !course) {
        throw new Error("User or Course not found")
      }

      // Check if already enrolled
      const isEnrolled = user.enrolledCourses.some((enrollment) => enrollment.courseId.toString() === courseId)

      if (isEnrolled) {
        throw new Error("User already enrolled in this course")
      }

      // Add to user's enrolled courses
      user.enrolledCourses.push({
        courseId: courseId,
        enrolledAt: new Date(),
        progress: 0,
      })

      await user.save()

      // Update course enrollment count
      await Course.findByIdAndUpdate(courseId, {
        $inc: { enrollmentCount: 1 },
      })

      // Create progress tracking
      await this.createProgress(userId, courseId)

      // Send notification
      await this.createNotification({
        recipient: userId,
        type: "course_enrollment",
        title: "কোর্সে ভর্তি সফল!",
        message: `আপনি "${course.title}" কোর্সে সফলভাবে ভর্তি হয়েছেন।`,
        data: { courseId: courseId },
      })

      return user
    } catch (error) {
      throw new Error(`Enrollment failed: ${error.message}`)
    }
  }

  // ===== COURSE OPERATIONS =====

  async createCourse(courseData) {
    try {
      const course = new Course(courseData)
      await course.save()
      return course
    } catch (error) {
      throw new Error(`Course creation failed: ${error.message}`)
    }
  }

  async getCourses(filters = {}) {
    const {
      category,
      level,
      status = "published",
      minPrice,
      maxPrice,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = -1,
    } = filters

    const query = { status }

    if (category) query.category = category
    if (level) query.level = level
    if (minPrice !== undefined) query.price = { $gte: minPrice }
    if (maxPrice !== undefined) {
      query.price = query.price ? { ...query.price, $lte: maxPrice } : { $lte: maxPrice }
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ]
    }

    const skip = (page - 1) * limit
    const sort = { [sortBy]: sortOrder }

    const [courses, total] = await Promise.all([
      Course.find(query).populate("instructor.id", "name profile.avatar").sort(sort).skip(skip).limit(limit),
      Course.countDocuments(query),
    ])

    return {
      courses,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
      },
    }
  }

  // ===== PAYMENT OPERATIONS =====

  async createPayment(paymentData) {
    try {
      const payment = new Payment(paymentData)
      await payment.save()

      // Admin notification
      await this.createNotification({
        recipient: null, // Admin notification
        type: "system_announcement",
        title: "নতুন পেমেন্ট",
        message: `${payment.user.name} একটি নতুন পেমেন্ট জমা দিয়েছেন।`,
        data: { paymentId: payment._id },
      })

      return payment
    } catch (error) {
      throw new Error(`Payment creation failed: ${error.message}`)
    }
  }

  async approvePayment(paymentId, adminId, adminName, note) {
    try {
      const payment = await Payment.findById(paymentId)
      if (!payment) {
        throw new Error("Payment not found")
      }

      payment.approve(adminId, adminName, note)
      await payment.save()

      // Enroll user in course
      await this.enrollUserInCourse(payment.user.id, payment.course.id)

      // Send approval notification
      await this.createNotification({
        recipient: payment.user.id,
        type: "payment_approved",
        title: "পেমেন্ট অনুমোদিত!",
        message: `আপনার "${payment.course.title}" কোর্সের পেমেন্ট অনুমোদিত হয়েছে।`,
        data: {
          paymentId: paymentId,
          courseId: payment.course.id,
        },
        channels: { email: true },
      })

      return payment
    } catch (error) {
      throw new Error(`Payment approval failed: ${error.message}`)
    }
  }

  // ===== PROGRESS OPERATIONS =====

  async createProgress(userId, courseId) {
    try {
      const course = await Course.findById(courseId)
      if (!course) {
        throw new Error("Course not found")
      }

      const lessons = []
      course.curriculum.forEach((module, moduleIndex) => {
        module.lessons.forEach((lesson, lessonIndex) => {
          lessons.push({
            lessonId: lesson.lessonId,
            moduleIndex,
            lessonIndex,
            status: "not_started",
          })
        })
      })

      const progress = new Progress({
        user: userId,
        course: courseId,
        lessons: lessons,
      })

      await progress.save()
      return progress
    } catch (error) {
      throw new Error(`Progress creation failed: ${error.message}`)
    }
  }

  async updateLessonProgress(userId, courseId, lessonId, status, watchTime = 0) {
    try {
      const progress = await Progress.findOne({ user: userId, course: courseId })
      if (!progress) {
        throw new Error("Progress not found")
      }

      const lesson = progress.lessons.find((l) => l.lessonId === lessonId)
      if (!lesson) {
        throw new Error("Lesson not found in progress")
      }

      lesson.status = status
      lesson.lastPosition = watchTime

      if (status === "completed" && !lesson.completedAt) {
        lesson.completedAt = new Date()
      }

      progress.lastAccessedAt = new Date()
      progress.lastAccessedLesson = lessonId
      progress.updateProgress()

      await progress.save()
      return progress
    } catch (error) {
      throw new Error(`Progress update failed: ${error.message}`)
    }
  }

  // ===== NOTIFICATION OPERATIONS =====

  async createNotification(notificationData) {
    try {
      const notification = new Notification(notificationData)
      await notification.save()
      return notification
    } catch (error) {
      console.error("Notification creation failed:", error)
      // Don't throw error for notifications
    }
  }

  async getUserNotifications(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ])

    return { notifications, unreadCount }
  }

  async markNotificationAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    )
  }

  // ===== SEARCH OPERATIONS =====

  async searchAll(query, userId = null) {
    const searchRegex = new RegExp(query, "i")

    const [courses, users] = await Promise.all([
      Course.find({
        status: "published",
        $or: [{ title: searchRegex }, { description: searchRegex }, { tags: searchRegex }],
      }).limit(10),

      userId
        ? User.find({
            _id: { $ne: userId },
            $or: [{ name: searchRegex }, { email: searchRegex }],
          })
            .select("name email profile.avatar")
            .limit(5)
        : [],
    ])

    return { courses, users }
  }

  // ===== ANALYTICS OPERATIONS =====

  async getDashboardStats(userId = null) {
    if (userId) {
      // User dashboard
      const user = await User.findById(userId).populate("enrolledCourses.courseId")
      const progress = await Progress.find({ user: userId })

      return {
        totalCourses: user.enrolledCourses.length,
        completedCourses: progress.filter((p) => p.isCompleted).length,
        totalProgress: progress.reduce((sum, p) => sum + p.overallProgress, 0) / progress.length || 0,
        certificates: progress.filter((p) => p.certificate.isEarned).length,
      }
    } else {
      // Admin dashboard
      const [totalUsers, totalCourses, totalPayments, pendingPayments] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments(),
        Payment.countDocuments(),
        Payment.countDocuments({ status: "pending" }),
      ])

      return {
        totalUsers,
        totalCourses,
        totalPayments,
        pendingPayments,
      }
    }
  }
}

module.exports = new DatabaseService()
