const express = require("express")
const mongoose = require("mongoose")
const nodemailer = require("nodemailer")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const { Server } = require("socket.io")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const User = require("./models/User")
const Course = require("./models/Course")
const Payment = require("./models/Payment")
const Progress = require("./models/Progress")
const Review = require("./models/Review")
const Notification = require("./models/Notification")
const DatabaseService = require("./services/DatabaseService")
const { validatePayment, validateUser, validateCourse } = require("./middleware/validation")

dotenv.config()
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
  },
})

require("./config/database")

const dbService = new DatabaseService()

// মিডলওয়্যার
app.use(cors())
app.use(express.json())

// ======= Enhanced User Routes =======
app.get("/api/users/:email/courses", async (req, res) => {
  try {
    const userCourses = await dbService.getUserCourses(req.params.email)
    res.json({ courses: userCourses })
  } catch (error) {
    console.error("Error fetching user courses:", error)
    res.status(500).json({ message: "Error fetching user courses" })
  }
})

app.get("/api/users/:email/progress", async (req, res) => {
  try {
    const progress = await dbService.getUserProgress(req.params.email)
    res.json(progress)
  } catch (error) {
    console.error("Error fetching user progress:", error)
    res.status(500).json({ message: "অগ্রগতি লোড করতে সমস্যা হয়েছে" })
  }
})

app.post("/api/users/:email/progress", async (req, res) => {
  try {
    const { courseId, lessonId, completed, timeSpent } = req.body
    const progress = await dbService.updateProgress(req.params.email, courseId, lessonId, completed, timeSpent)
    res.json(progress)
  } catch (error) {
    console.error("Error updating progress:", error)
    res.status(500).json({ message: "অগ্রগতি আপডেট করতে সমস্যা হয়েছে" })
  }
})

// OTP রাউটস (Enhanced)
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body
    const otp = Math.floor(1000 + Math.random() * 9000).toString()

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "তালিমুল ইসলাম একাডেমি - OTP কোড",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; text-align: center;">তালিমুল ইসলাম একাডেমি</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center;">
            <h3 style="color: #1e293b;">আপনার OTP কোড</h3>
            <div style="font-size: 32px; font-weight: bold; color: #059669; letter-spacing: 4px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="color: #64748b;">এই কোডটি ৫ মিনিটের জন্য বৈধ</p>
          </div>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)

    await User.findOneAndUpdate(
      { email },
      {
        otp: otp,
        otpExpires: Date.now() + 300000,
        lastOtpSent: new Date(),
      },
      { upsert: true, new: true },
    )

    res.json({ success: true, message: "OTP সফলভাবে পাঠানো হয়েছে" })
  } catch (error) {
    console.error("Error sending OTP:", error)
    res.status(500).json({ success: false, message: "OTP পাঠাতে সমস্যা হয়েছে" })
  }
})

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    const user = await User.findOne({ email })

    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "অবৈধ OTP" })
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP এর মেয়াদ শেষ হয়ে গেছে" })
    }

    user.otp = undefined
    user.otpExpires = undefined
    user.emailVerified = true
    user.lastLogin = new Date()
    await user.save()

    res.json({ success: true })
  } catch (error) {
    console.error("Error verifying OTP:", error)
    res.status(500).json({ success: false, message: "OTP যাচাই করতে সমস্যা হয়েছে" })
  }
})

// Enhanced Payment Routes
app.post("/api/payments", validatePayment, async (req, res) => {
  try {
    const paymentData = {
      ...req.body,
      status: "pending",
      submittedAt: new Date(),
      ipAddress: req.ip,
    }

    const payment = await dbService.createPayment(paymentData)

    await dbService.createNotification({
      type: "new_payment",
      title: "নতুন পেমেন্ট রিকুয়েস্ট",
      message: `${payment.name} একটি নতুন পেমেন্ট জমা দিয়েছেন`,
      data: { paymentId: payment._id },
    })

    await notifyAdmin(payment._id)
    res.status(201).json(payment)
  } catch (error) {
    console.error("Error saving payment:", error)
    res.status(500).json({ message: "পেমেন্ট সেভ করতে সমস্যা হয়েছে" })
  }
})

app.get("/api/admin/payments", async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search = "" } = req.query
    const payments = await dbService.getPayments({ status, page, limit, search })
    res.json(payments)
  } catch (error) {
    console.error("Error fetching payments:", error)
    res.status(500).json({ message: "পেমেন্ট লোড করতে সমস্যা হয়েছে" })
  }
})

app.get("/api/admin/payments/:id", async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
    if (!payment) {
      return res.status(404).json({ message: "পেমেন্ট পাওয়া যায়নি" })
    }
    res.json(payment)
  } catch (error) {
    console.error("Error fetching payment:", error)
    res.status(500).json({ message: "পেমেন্ট ডিটেইলস লোড করতে সমস্যা হয়েছে" })
  }
})

// Enhanced Payment Approval
app.put("/api/admin/payments/:id", async (req, res) => {
  try {
    const { status, adminNote } = req.body

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Only approved, rejected or pending accepted",
      })
    }

    const result = await dbService.approvePayment(req.params.id, status, adminNote)

    if (!result.success) {
      return res.status(404).json(result)
    }

    const { payment } = result

    // If approved, handle course access and notifications
    if (status === "approved") {
      // Grant course access
      await dbService.grantCourseAccess(payment.email, payment.courseId)

      // Create progress tracking
      await dbService.createProgress({
        userId: payment.email,
        courseId: payment.courseId,
        enrolledAt: new Date(),
      })

      // Send real-time notification
      const notification = {
        type: "courseAccessUpdated",
        email: payment.email,
        courseId: payment.courseId,
        courseName: payment.courseName,
        paymentId: payment._id,
        userName: payment.name,
        timestamp: new Date().toISOString(),
      }

      io.emit("courseAccessUpdated", notification)

      // Send email notification
      try {
        await sendCourseAccessEmail(payment.email, payment.name, payment.courseName || payment.courseId)
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError)
      }
    }

    res.json({
      success: true,
      message: "Payment status updated successfully",
      payment,
    })
  } catch (error) {
    console.error("Error updating payment:", error)
    res.status(500).json({
      success: false,
      message: "Error updating payment",
      error: error.message,
    })
  }
})

// Enhanced Course Routes
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await dbService.getCourses()
    res.json(courses)
  } catch (error) {
    console.error("Error fetching courses:", error)
    res.status(500).json({ message: "কোর্স লোড করতে সমস্যা হয়েছে" })
  }
})

app.post("/api/admin/courses", validateCourse, async (req, res) => {
  try {
    const course = await dbService.createCourse(req.body)
    res.status(201).json(course)
  } catch (error) {
    console.error("Error creating course:", error)
    res.status(500).json({ message: "কোর্স তৈরি করতে সমস্যা হয়েছে" })
  }
})

app.get("/api/courses/:id/reviews", async (req, res) => {
  try {
    const reviews = await dbService.getCourseReviews(req.params.id)
    res.json(reviews)
  } catch (error) {
    console.error("Error fetching reviews:", error)
    res.status(500).json({ message: "রিভিউ লোড করতে সমস্যা হয়েছে" })
  }
})

app.post("/api/courses/:id/reviews", async (req, res) => {
  try {
    const { rating, comment, userEmail } = req.body
    const review = await dbService.createReview({
      courseId: req.params.id,
      userEmail,
      rating,
      comment,
    })
    res.status(201).json(review)
  } catch (error) {
    console.error("Error creating review:", error)
    res.status(500).json({ message: "রিভিউ জমা দিতে সমস্যা হয়েছে" })
  }
})

// Enhanced Authentication Routes
app.post("/api/register", validateUser, async (req, res) => {
  try {
    const { name, email, password } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = new User({
      name,
      email,
      password: hashedPassword,
      courses: [],
      registeredAt: new Date(),
      lastLogin: new Date(),
    })

    await user.save()

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" })

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Registration failed" })
  }
})

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    user.lastLogin = new Date()
    await user.save()

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" })

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Login failed" })
  }
})

app.get("/api/admin/notifications", async (req, res) => {
  try {
    const notifications = await dbService.getNotifications()
    res.json(notifications)
  } catch (error) {
    console.error("Error fetching notifications:", error)
    res.status(500).json({ message: "নোটিফিকেশন লোড করতে সমস্যা হয়েছে" })
  }
})

app.put("/api/admin/notifications/:id/read", async (req, res) => {
  try {
    await dbService.markNotificationAsRead(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error("Error marking notification as read:", error)
    res.status(500).json({ message: "নোটিফিকেশন আপডেট করতে সমস্যা হয়েছে" })
  }
})

// Enhanced helper functions
async function notifyAdmin(paymentId) {
  console.log(`New payment created: ${paymentId}`)
  io.emit("newPayment", { paymentId, timestamp: new Date() })
}

async function sendCourseAccessEmail(email, name, courseName) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "তালিমুল ইসলাম একাডেমি - কোর্স অনুমোদিত হয়েছে",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc;">
          <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">তালিমুল ইসলাম একাডেমি</h1>
              <div style="width: 50px; height: 3px; background: #10b981; margin: 10px auto;"></div>
            </div>
            
            <h2 style="color: #059669; text-align: center; margin-bottom: 20px;">🎉 অভিনন্দন!</h2>
            
            <p style="font-size: 16px; line-height: 1.6; color: #374151;">প্রিয় <strong>${name}</strong>,</p>
            
            <p style="font-size: 16px; line-height: 1.6; color: #374151;">
              আপনার পেমেন্ট সফলভাবে অনুমোদিত হয়েছে এবং <strong style="color: #2563eb;">"${courseName}"</strong> কোর্সে আপনার অ্যাক্সেস চালু করা হয়েছে।
            </p>
            
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p style="margin: 0; color: #1e40af; font-weight: 500;">এখন আপনি পাবেন:</p>
              <ul style="color: #374151; margin: 10px 0;">
                <li>সমস্ত ভিডিও লেকচার</li>
                <li>পিডিএফ নোট ও বই</li>
                <li>অনুশীলনী ও কুইজ</li>
                <li>সার্টিফিকেট (কোর্স সম্পূর্ণ করার পর)</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || "https://your-course-website.com"}/courses/${courseName.toLowerCase().replace(/\s+/g, "-")}" 
                 style="display: inline-block; background: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                কোর্স শুরু করুন
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
              <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0;">
                কোনো সমস্যা হলে আমাদের সাথে যোগাযোগ করুন: <a href="mailto:${process.env.EMAIL_USER}" style="color: #2563eb;">${process.env.EMAIL_USER}</a>
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #6b7280; margin: 0;">
                ধন্যবাদ,<br>
                <strong style="color: #374151;">তালিমুল ইসলাম একাডেমি টিম</strong>
              </p>
            </div>
          </div>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log(`Enhanced course access email sent to ${email}`)
  } catch (error) {
    console.error("Error sending course access email:", error)
    throw error
  }
}

// Enhanced WebSocket connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id)

  socket.on("joinAdminRoom", () => {
    socket.join("admin")
    console.log("Admin joined room")
  })

  socket.on("joinUserRoom", (email) => {
    socket.join(`user_${email}`)
    console.log(`User ${email} joined room`)
  })

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
  })
})

// সার্ভার শুরু করুন
const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Database: MongoDB Connected`)
  console.log(`🔌 WebSocket: Socket.IO Ready`)
})
