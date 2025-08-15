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

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err))

// User model with enhanced validation
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: { type: String, required: true, minlength: 6 },
  courses: [String],
  otp: String,
  otpExpires: Date,
  resetToken: String,
  resetTokenExpires: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

// Add pre-save hook for password hashing
UserSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
  this.updatedAt = Date.now()
  next()
})

const User = mongoose.model("User", UserSchema)

// Payment model
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
  })
)

// Course model
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
  })
)

// Middleware
app.use(cors())
app.use(express.json())

// JWT verification middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization
  
  if (authHeader) {
    const token = authHeader.split(' ')[1]
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403)
      }
      
      req.user = user
      next()
    })
  } else {
    res.sendStatus(401)
  }
}

// OTP routes
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" })
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString()
    const otpExpires = Date.now() + 300000 // 5 minutes

    // Check if user exists
    let user = await User.findOne({ email })
    
    if (user) {
      // Update existing user's OTP
      user.otp = otp
      user.otpExpires = otpExpires
      await user.save()
    } else {
      // Create new user with OTP (temporary until full registration)
      user = new User({ email, otp, otpExpires })
      await user.save()
    }

    // Send OTP via email
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
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2E7D32;">OTP Verification</h2>
          <p>আপনার OTP কোড: <strong>${otp}</strong></p>
          <p style="color: #666;">এই কোড ৫ মিনিটের জন্য বৈধ</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)

    res.json({ success: true, message: "OTP sent successfully" })
  } catch (error) {
    console.error("Error sending OTP:", error)
    res.status(500).json({ success: false, message: "Failed to send OTP" })
  }
})

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    const user = await User.findOne({ email })
    
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" })
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" })
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP has expired" })
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

// Registration route
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "All fields are required"
      })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser && existingUser.password) {
      return res.status(400).json({ 
        success: false,
        message: "Email already registered"
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create or update user
    let user
    if (existingUser) {
      // Update existing user (who only had email/OTP before)
      user = existingUser
      user.name = name
      user.password = hashedPassword
    } else {
      // Create new user
      user = new User({
        name,
        email,
        password: hashedPassword,
        courses: []
      })
    }

    await user.save()

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
      expiresIn: "1d" 
    })

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
      message: "Registration successful"
    })

  } catch (error) {
    console.error("Registration error:", error)
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      })
    }
    
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message
    })
  }
})

// Login route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
      expiresIn: "1d" 
    })

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
      message: "Login successful"
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Login failed" })
  }
})

// Password reset routes
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body
    
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Generate reset token
    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '15m' })
    const resetTokenExpires = Date.now() + 900000 // 15 minutes
    
    user.resetToken = resetToken
    user.resetTokenExpires = resetTokenExpires
    await user.save()
    
    // Send reset email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2E7D32;">Password Reset</h2>
          <p>Please click the link below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #2E7D32; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0;">Reset Password</a>
          <p style="color: #666;">This link will expire in 15 minutes.</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
    
    res.json({ success: true, message: 'Password reset email sent' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ message: 'Failed to process request' })
  }
})

app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' })
    }
    
    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
      return res.status(400).json({ message: 'Invalid or expired token' })
    }
    
    const user = await User.findOne({ 
      email: decoded.email,
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    })
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' })
    }
    
    // Update password
    user.password = await bcrypt.hash(newPassword, 10)
    user.resetToken = undefined
    user.resetTokenExpires = undefined
    await user.save()
    
    res.json({ success: true, message: 'Password reset successfully' })
  } catch (error) {
    console.error('Password reset error:', error)
    res.status(500).json({ message: 'Password reset failed' })
  }
})

// Protected user routes
app.get("/api/user", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      courses: user.courses
    })
  } catch (error) {
    console.error("Error fetching user:", error)
    res.status(500).json({ message: "Error fetching user data" })
  }
})

// User courses route
app.get("/api/user/courses", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('courses')
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    
    res.json({ courses: user.courses || [] })
  } catch (error) {
    console.error("Error fetching user courses:", error)
    res.status(500).json({ message: "Error fetching user courses" })
  }
})

// Other existing routes (payments, courses, etc.) remain the same
// ... [keep all the existing payment and course routes from your original code]

// Start server
const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))