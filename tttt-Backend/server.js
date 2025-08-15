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

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err))

// User Model with OTP fields
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
    createdAt: { type: Date, default: Date.now },
  })
)

// Other models (Payment, Course) remain the same...

// Middleware
app.use(cors())
app.use(express.json())

// ====================
// Authentication Routes
// ====================
const saltRounds = 10

// Send OTP
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body
    const otp = Math.floor(1000 + Math.random() * 9000).toString()

    // Save OTP to user in database
    await User.findOneAndUpdate(
      { email },
      { 
        otp,
        otpExpires: Date.now() + 300000 // 5 minutes
      },
      { upsert: true, new: true }
    )

    // In production, send OTP via email
    if (process.env.NODE_ENV === "production") {
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
        subject: "Your OTP Code",
        text: `Your OTP code is: ${otp}`,
      }

      await transporter.sendMail(mailOptions)
    }

    console.log(`OTP for ${email}: ${otp}`) // For development only
    res.json({ success: true, message: "OTP sent successfully" })
  } catch (error) {
    console.error("Error sending OTP:", error)
    res.status(500).json({ success: false, message: "Failed to send OTP" })
  }
})

// Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    const user = await User.findOne({ email })

    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" })
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" })
    }

    // Clear OTP after successful verification
    user.otp = undefined
    user.otpExpires = undefined
    await user.save()

    res.json({ success: true, message: "OTP verified successfully" })
  } catch (error) {
    console.error("Error verifying OTP:", error)
    res.status(500).json({ success: false, message: "Failed to verify OTP" })
  }
})

// Register User
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, otp } = req.body

    // Validate OTP first
    const user = await User.findOne({ email })
    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" })
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser && existingUser.password) {
      return res.status(400).json({ success: false, message: "User already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Create or update user
    const updatedUser = await User.findOneAndUpdate(
      { email },
      {
        name,
        password: hashedPassword,
        otp: undefined,
        otpExpires: undefined
      },
      { new: true }
    )

    // Generate JWT token
    const token = jwt.sign({ userId: updatedUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    })

    res.json({
      success: true,
      token,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email
      }
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ success: false, message: "Registration failed" })
  }
})

// Login User
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" })
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    })

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses || []
      }
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ success: false, message: "Login failed" })
  }
})

// Forgot Password - Send OTP
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString()

    // Save OTP to user
    user.otp = otp
    user.otpExpires = Date.now() + 300000 // 5 minutes
    await user.save()

    // In production, send OTP via email
    if (process.env.NODE_ENV === "production") {
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
        subject: "Password Reset OTP",
        text: `Your password reset OTP is: ${otp}`,
      }

      await transporter.sendMail(mailOptions)
    }

    console.log(`Password reset OTP for ${email}: ${otp}`) // For development only
    res.json({ success: true, message: "OTP sent successfully" })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ success: false, message: "Failed to process request" })
  }
})

// Reset Password
app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body

    const user = await User.findOne({ email })
    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" })
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds)

    // Update password and clear OTP
    user.password = hashedPassword
    user.otp = undefined
    user.otpExpires = undefined
    await user.save()

    res.json({ success: true, message: "Password reset successfully" })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ success: false, message: "Failed to reset password" })
  }
})

// Protected route example
app.get("/api/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password")
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    res.json(user)
  } catch (error) {
    console.error("Profile error:", error)
    res.status(500).json({ message: "Failed to fetch profile" })
  }
})

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Forbidden" })
    }
    req.user = user
    next()
  })
}

// Keep all other existing routes (payments, courses, etc.) unchanged...

// Start server
const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))