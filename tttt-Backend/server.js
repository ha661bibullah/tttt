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
app.use(cors({
  origin: 'https://clever-froyo-c0908e.netlify.app',
  credentials: true
}));
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
        const { email } = req.body;
        
        // Generate 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        // Save OTP to user or create new user if not exists
        await User.findOneAndUpdate(
            { email },
            { otp, otpExpires },
            { upsert: true, new: true }
        );

        // In production, you would send this via email/SMS
        console.log(`OTP for ${email}: ${otp}`);

        res.json({
            success: true,
            message: "OTP সফলভাবে পাঠানো হয়েছে"
        });

    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({
            success: false,
            message: "OTP পাঠাতে সমস্যা হয়েছে"
        });
    }
});



app.post("/api/verify-otp", async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "ইমেইল পাওয়া যায়নি"
            });
        }

        // Check if OTP matches and is not expired
        if (user.otp !== otp || user.otpExpires < new Date()) {
            return res.status(400).json({
                success: false,
                message: "অবৈধ OTP বা OTP এর মেয়াদ শেষ"
            });
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: "OTP সফলভাবে যাচাই করা হয়েছে"
        });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).json({
            success: false,
            message: "OTP যাচাই করতে সমস্যা হয়েছে"
        });
    }
});

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
        const { name, email, password } = req.body;

        // Validate email format
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                success: false,
                message: "অবৈধ ইমেইল ঠিকানা"
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: "এই ইমেইলটি ইতিমধ্যে ব্যবহার করা হয়েছে"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            courses: []
        });

        await user.save();

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
            expiresIn: "1d" 
        });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                courses: user.courses
            }
        });

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "রেজিস্ট্রেশনে সমস্যা হয়েছে",
            error: error.message
        });
    }
});


// Login route
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: "ইমেইল বা পাসওয়ার্ড ভুল"
            });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false,
                message: "ইমেইল বা পাসওয়ার্ড ভুল"
            });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
            expiresIn: "1d" 
        });

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                courses: user.courses
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "লগইনে সমস্যা হয়েছে"
        });
    }
});


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
io.on("connection", (socket) => {
  console.log("A user connected")
  socket.on("disconnect", () => {
    console.log("A user disconnected")
  })
})

// সার্ভার শুরু করুন
const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))





// Add these routes to your server.js

// Password reset route
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Update user's password
        const user = await User.findOneAndUpdate(
            { email },
            { password: hashedPassword },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Password reset failed' });
    }
});

// User courses route
app.get('/api/users/:userId/courses', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Get full course details
        const courses = await Course.find({ _id: { $in: user.courses } });
        
        res.json({ courses });
    } catch (error) {
        console.error('Error fetching user courses:', error);
        res.status(500).json({ message: 'Error fetching user courses' });
    }
});