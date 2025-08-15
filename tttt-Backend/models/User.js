const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    // ব্যক্তিগত তথ্য
    name: {
      type: String,
      required: [true, "নাম প্রয়োজন"],
      trim: true,
      minlength: [2, "নাম কমপক্ষে ২ অক্ষরের হতে হবে"],
      maxlength: [50, "নাম সর্বোচ্চ ৫০ অক্ষরের হতে পারে"],
    },
    email: {
      type: String,
      required: [true, "ইমেইল প্রয়োজন"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "সঠিক ইমেইল প্রদান করুন"],
    },
    password: {
      type: String,
      required: [true, "পাসওয়ার্ড প্রয়োজন"],
      minlength: [6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^(\+88)?01[3-9]\d{8}$/, "সঠিক বাংলাদেশী মোবাইল নম্বর প্রদান করুন"],
    },

    // একাউন্ট স্ট্যাটাস
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["student", "instructor", "admin"],
      default: "student",
    },

    // কোর্স সম্পর্কিত
    enrolledCourses: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
        enrolledAt: {
          type: Date,
          default: Date.now,
        },
        progress: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },
        completedLessons: [
          {
            lessonId: String,
            completedAt: Date,
          },
        ],
        lastAccessedAt: Date,
      },
    ],

    // OTP এবং পাসওয়ার্ড রিসেট
    otp: {
      code: String,
      expiresAt: Date,
      purpose: {
        type: String,
        enum: ["email_verification", "password_reset", "login"],
      },
    },
    resetToken: String,
    resetTokenExpires: Date,

    // প্রোফাইল তথ্য
    profile: {
      avatar: String,
      bio: String,
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ["male", "female", "other"],
      },
      address: {
        street: String,
        city: String,
        district: String,
        country: {
          type: String,
          default: "Bangladesh",
        },
      },
      socialLinks: {
        facebook: String,
        twitter: String,
        linkedin: String,
      },
    },

    // সিস্টেম তথ্য
    lastLoginAt: Date,
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        loginAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    preferences: {
      language: {
        type: String,
        enum: ["bn", "en"],
        default: "bn",
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        sms: {
          type: Boolean,
          default: false,
        },
        push: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// ভার্চুয়াল ফিল্ড
userSchema.virtual("totalCourses").get(function () {
  return this.enrolledCourses.length
})

userSchema.virtual("completedCourses").get(function () {
  return this.enrolledCourses.filter((course) => course.progress === 100).length
})

// পাসওয়ার্ড হ্যাশ করার মিডলওয়্যার
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// পাসওয়ার্ড যাচাই করার মেথড
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// OTP জেনারেট করার মেথড
userSchema.methods.generateOTP = function (purpose = "email_verification") {
  const otp = Math.floor(1000 + Math.random() * 9000).toString()
  this.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // ১০ মিনিট
    purpose: purpose,
  }
  return otp
}

// OTP যাচাই করার মেথড
userSchema.methods.verifyOTP = function (candidateOTP, purpose) {
  if (!this.otp || this.otp.purpose !== purpose) {
    return false
  }

  if (this.otp.expiresAt < new Date()) {
    return false
  }

  return this.otp.code === candidateOTP
}

// ইনডেক্স
userSchema.index({ email: 1 })
userSchema.index({ "enrolledCourses.courseId": 1 })
userSchema.index({ createdAt: -1 })

module.exports = mongoose.model("User", userSchema)
