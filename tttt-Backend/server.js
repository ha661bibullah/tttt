const express = require("express")
const mongoose = require("mongoose")
const nodemailer = require("nodemailer")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const { Server } = require("socket.io")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

dotenv.config()
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
  },
})

// MongoDB কানেকশন
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err))

// মডেল ডিফাইন
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    courses: [String],
    otp: String,
    otpExpires: Date,
    resetToken: String,
    resetTokenExpires: Date,
  }),
)

const Payment = mongoose.model(
  "Payment",
  new mongoose.Schema({
    userId: String,
    name: String,
    email: String,
    phone: String,
    courseId: String,
    courseName: String,
    paymentMethod: String,
    txnId: String,
    amount: Number,
    status: { type: String, default: "pending" },
    date: { type: Date, default: Date.now },
  }),
)

const Course = mongoose.model(
  "Course",
  new mongoose.Schema({
    id: String,
    title: String,
    description: String,
    price: Number,
    duration: String,
    instructor: String,
    createdAt: { type: Date, default: Date.now },
  }),
)

// মিডলওয়্যার
app.use(cors())
app.use(express.json())

// ====== নতুন পেমেন্ট ভ্যালিডেশন মিডলওয়্যার ======
const validatePayment = (req, res, next) => {
  const { name, email, phone, courseId, paymentMethod, txnId, amount } = req.body

  if (!name || !email || !phone || !courseId || !paymentMethod || !txnId || !amount) {
    return res.status(400).json({ message: "সমস্ত প্রয়োজনীয় ফিল্ড পূরণ করুন" })
  }

  if (!["bkash", "nagad", "bank", "card"].includes(paymentMethod)) {
    return res.status(400).json({ message: "অবৈধ পেমেন্ট মাধ্যম" })
  }

  next()
}

// ======= নতুন রাউট =======

// Password reset request endpoint
app.post("/api/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body

    // Check if user exists in database
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "এই ইমেইলটি রেজিস্টার্ড নয়",
      })
    }

    // Generate OTP
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
      subject: "তালিমুল ইসলাম একাডেমি - পাসওয়ার্ড রিসেট OTP",
      text: `আপনার পাসওয়ার্ড রিসেট OTP কোড: ${otp}`,
    }

    await transporter.sendMail(mailOptions)

    // Store OTP in user document
    user.otp = otp
    user.otpExpires = Date.now() + 300000 // 5 minutes
    await user.save()

    res.json({
      success: true,
      message: "OTP সফলভাবে পাঠানো হয়েছে",
    })
  } catch (error) {
    console.error("Error in password reset request:", error)
    res.status(500).json({
      success: false,
      message: "পাসওয়ার্ড রিসেট করতে সমস্যা হয়েছে",
    })
  }
})

// Password reset endpoint
app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "ব্যবহারকারী পাওয়া যায়নি",
      })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password and clear OTP
    user.password = hashedPassword
    user.otp = undefined
    user.otpExpires = undefined
    await user.save()

    res.json({
      success: true,
      message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে",
    })
  } catch (error) {
    console.error("Error resetting password:", error)
    res.status(500).json({
      success: false,
      message: "পাসওয়ার্ড পরিবর্তনে সমস্যা হয়েছে",
    })
  }
})

app.get("/api/users/:email/courses", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email })
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    res.json({ courses: user.courses || [] })
  } catch (error) {
    console.error("Error fetching user courses:", error)
    res.status(500).json({ message: "Error fetching user courses" })
  }
})

// OTP রাউটস
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
      text: `আপনার OTP কোড: ${otp}`,
    }

    await transporter.sendMail(mailOptions)

    // শুধুমাত্র existing user-এর জন্য OTP update করা হবে
    const user = await User.findOne({ email })
    if (user) {
      user.otp = otp
      user.otpExpires = Date.now() + 300000
      await user.save()
    }
    // নতুন user-এর জন্য আলাদা OTP storage তৈরি করা হবে
    else {
      // Temporary OTP storage for new users (you can also use a separate collection)
      global.tempOTPs = global.tempOTPs || {}
      global.tempOTPs[email] = {
        otp,
        expires: Date.now() + 300000,
      }
    }

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
    let storedOTP, otpExpires

    if (user && user.otp) {
      // Existing user with OTP
      storedOTP = user.otp
      otpExpires = user.otpExpires
    } else if (global.tempOTPs && global.tempOTPs[email]) {
      // New user with temporary OTP
      storedOTP = global.tempOTPs[email].otp
      otpExpires = global.tempOTPs[email].expires
    } else {
      return res.status(400).json({ success: false, message: "OTP পাওয়া যায়নি" })
    }

    if (storedOTP !== otp) {
      return res.status(400).json({ success: false, message: "অবৈধ OTP" })
    }

    if (otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP এর মেয়াদ শেষ হয়ে গেছে" })
    }

    // Clear OTP after successful verification
    if (user) {
      user.otp = undefined
      user.otpExpires = undefined
      await user.save()
    } else if (global.tempOTPs && global.tempOTPs[email]) {
      delete global.tempOTPs[email]
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Error verifying OTP:", error)
    res.status(500).json({ success: false, message: "OTP যাচাই করতে সমস্যা হয়েছে" })
  }
})

// পেমেন্ট রাউটস (মিডলওয়্যার যুক্ত করা হয়েছে)
app.post("/api/payments", validatePayment, async (req, res) => {
  try {
    const payment = new Payment(req.body)
    await payment.save()

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

    const query = {}
    if (status) query.status = status

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { txnId: { $regex: search, $options: "i" } },
      ]
    }

    const payments = await Payment.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const count = await Payment.countDocuments(query)

    res.json({
      payments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    })
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

// ✅ আপডেটেড PUT রাউট
// Update the PUT route for payment approval
app.put("/api/admin/payments/:id", async (req, res) => {
  try {
    const { status } = req.body

    // Validation
    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Only approved, rejected or pending accepted",
      })
    }

    // Update payment
    const payment = await Payment.findByIdAndUpdate(req.params.id, { status }, { new: true })

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      })
    }

    console.log(`Payment ${payment._id} status updated to: ${status}`)

    // If approved
    if (status === "approved") {
      // Update user's course access
      const user = await User.findOneAndUpdate(
        { email: payment.email },
        { $addToSet: { courses: payment.courseId } },
        { new: true, upsert: true },
      )

      console.log(`User ${payment.email} granted access to course ${payment.courseId}`)

      // Send real-time notification to all connected clients
      const notification = {
        type: "courseAccessUpdated",
        email: payment.email,
        courseId: payment.courseId,
        courseName: payment.courseName,
        paymentId: payment._id,
        userName: payment.name,
        timestamp: new Date().toISOString(),
      }

      // Emit to all connected clients
      io.emit("courseAccessUpdated", notification)

      console.log("Course access notification broadcasted:", notification)

      // Optional: Send email notification to user
      try {
        await sendCourseAccessEmail(payment.email, payment.name, payment.courseName || payment.courseId)
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError)
        // Don't fail the request if email fails
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

// server.js-তে নোটিফিকেশন ইভেন্ট যোগ করুন
io.on("connection", (socket) => {
  console.log("A user connected")
  socket.on("disconnect", () => {
    console.log("A user disconnected")
  })
})

// কোর্স রাউটস
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await Course.find()
    res.json(courses)
  } catch (error) {
    console.error("Error fetching courses:", error)
    res.status(500).json({ message: "কোর্স লোড করতে সমস্যা হয়েছে" })
  }
})

// Authentication Routes
const saltRounds = 10

// Registration route
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    const user = new User({
      name,
      email,
      password: hashedPassword,
      courses: [],
    })

    await user.save()

    // Generate JWT token
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

// Login route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
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

// হেল্পার ফাংশন
async function notifyAdmin(paymentId) {
  console.log(`New payment created: ${paymentId}`)
}

async function notifyUser(email, courseId) {
  console.log(`User with email ${email} granted access to course ${courseId}`)
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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4caf50;">🎉 অভিনন্দন!</h2>
          <p>প্রিয় ${name},</p>
          <p>আপনার পেমেন্ট সফলভাবে অনুমোদিত হয়েছে এবং <strong>"${courseName}"</strong> কোর্সে আপনার অ্যাক্সেস চালু করা হয়েছে।</p>
          <p>এখন আপনি সমস্ত ভিডিও, নোট এবং অন্যান্য কন্টেন্ট দেখতে পারবেন।</p>
          <p style="margin-top: 20px;">
            <a href="https://your-course-website.com/practical-ibarat" 
               style="background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
              কোর্স শুরু করুন
            </a>
          </p>
          <p style="margin-top: 20px; color: #666;">
            ধন্যবাদ,<br>
            তালিমুল ইসলাম একাডেমি টিম
          </p>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log(`Course access email sent to ${email}`)
  } catch (error) {
    console.error("Error sending course access email:", error)
    throw error
  }
}

// WebSocket কানেকশন
// io.on("connection", (socket) => {
//   console.log("A user connected")
//   socket.on("disconnect", () => {
//     console.log("A user disconnected")
//   })
// })

// সার্ভার শুরু করুন
const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
