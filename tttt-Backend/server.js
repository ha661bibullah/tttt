require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Express app and server
const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Database Models
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "নাম প্রদান করা বাধ্যতামূলক"],
    trim: true
  },
  email: {
    type: String,
    required: [true, "ইমেইল প্রদান করা বাধ্যতামূলক"],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} একটি বৈধ ইমেইল নয়`
    }
  },
  password: {
    type: String,
    required: [true, "পাসওয়ার্ড প্রদান করা বাধ্যতামূলক"],
    minlength: [6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে"],
    select: false
  },
  phone: {
    type: String,
    trim: true
  },
  courses: [{
    courseId: String,
    courseName: String,
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0
    }
  }],
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  otp: String,
  otpExpires: Date,
  resetToken: String,
  resetTokenExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

const User = mongoose.model("User", userSchema);

const paymentSchema = new mongoose.Schema({
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
});

const Payment = mongoose.model("Payment", paymentSchema);

const courseSchema = new mongoose.Schema({
  id: String,
  title: String,
  description: String,
  price: Number,
  duration: String,
  instructor: String,
  createdAt: { type: Date, default: Date.now },
});

const Course = mongoose.model("Course", courseSchema);

// Utility Functions
const sendEmail = async (to, subject, text, html) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html
  };

  await transporter.sendMail(mailOptions);
};

const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

// Middleware
const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "অনুগ্রহ করে লগইন করুন"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    console.error("টোকেন যাচাই ত্রুটি:", error);
    res.status(401).json({
      success: false,
      message: "অনুগ্রহ করে পুনরায় লগইন করুন"
    });
  }
};

const validatePayment = (req, res, next) => {
  const { name, email, phone, courseId, paymentMethod, txnId, amount } = req.body;

  if (!name || !email || !phone || !courseId || !paymentMethod || !txnId || !amount) {
    return res.status(400).json({ message: "সমস্ত প্রয়োজনীয় ফিল্ড পূরণ করুন" });
  }

  if (!["bkash", "nagad", "bank", "card"].includes(paymentMethod)) {
    return res.status(400).json({ message: "অবৈধ পেমেন্ট মাধ্যম" });
  }

  next();
};

// Authentication Routes
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "নাম, ইমেইল এবং পাসওয়ার্ড প্রদান করা বাধ্যতামূলক"
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "এই ইমেইলটি ইতিমধ্যে ব্যবহার করা হয়েছে"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      courses: []
    });

    await user.save();

    const token = generateToken(user._id, user.email);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error("রেজিস্ট্রেশন ত্রুটি:", error);
    res.status(500).json({
      success: false,
      message: "রেজিস্ট্রেশনে সমস্যা হয়েছে",
      error: error.message
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "ইমেইল এবং পাসওয়ার্ড প্রদান করা বাধ্যতামূলক"
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ভুল ইমেইল বা পাসওয়ার্ড"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "ভুল ইমেইল বা পাসওয়ার্ড"
      });
    }

    const token = generateToken(user._id, user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        courses: user.courses
      }
    });
  } catch (error) {
    console.error("লগইন ত্রুটি:", error);
    res.status(500).json({
      success: false,
      message: "লগইনে সমস্যা হয়েছে",
      error: error.message
    });
  }
});

// User Routes
app.get("/api/users/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("প্রোফাইল লোড ত্রুটি:", error);
    res.status(500).json({
      success: false,
      message: "প্রোফাইল লোড করতে সমস্যা হয়েছে"
    });
  }
});

app.put("/api/users/me", protect, async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("প্রোফাইল আপডেট ত্রুটি:", error);
    res.status(500).json({
      success: false,
      message: "প্রোফাইল আপডেট করতে সমস্যা হয়েছে"
    });
  }
});

app.put("/api/users/update-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "বর্তমান এবং নতুন পাসওয়ার্ড প্রদান করুন"
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "বর্তমান পাসওয়ার্ড সঠিক নয়"
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({
      success: true,
      message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে"
    });
  } catch (error) {
    console.error("পাসওয়ার্ড পরিবর্তন ত্রুটি:", error);
    res.status(500).json({
      success: false,
      message: "পাসওয়ার্ড পরিবর্তনে সমস্যা হয়েছে"
    });
  }
});

// OTP Routes
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    await sendEmail(
      email,
      "তালিমুল ইসলাম একাডেমি - OTP কোড",
      `আপনার OTP কোড: ${otp}`,
      `<p>আপনার OTP কোড: <strong>${otp}</strong></p>`
    );

    await User.findOneAndUpdate(
      { email },
      { otp, otpExpires: Date.now() + 300000 },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "OTP সফলভাবে পাঠানো হয়েছে" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "OTP পাঠাতে সমস্যা হয়েছে" });
  }
});

// In your OTP verification endpoint
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Input validation
    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "ইমেইল এবং OTP প্রদান করা বাধ্যতামূলক" 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "এই ইমেইলে কোনো ব্যবহারকারী খুঁজে পাওয়া যায়নি" 
      });
    }

    // Check if OTP exists and matches
    if (!user.otp || user.otp !== otp.toString()) {
      return res.status(400).json({ 
        success: false, 
        message: "অবৈধ OTP কোড" 
      });
    }

    // Check if OTP has expired
    if (user.otpExpires && user.otpExpires < Date.now()) {
      return res.status(400).json({ 
        success: false, 
        message: "OTP কোডের মেয়াদ শেষ হয়ে গেছে" 
      });
    }

    // Clear OTP fields after successful verification
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ 
      success: true,
      message: "OTP সফলভাবে যাচাই করা হয়েছে" 
    });

  } catch (error) {
    console.error("OTP যাচাই ত্রুটি:", error);
    res.status(500).json({ 
      success: false, 
      message: "OTP যাচাই করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

// Course Routes
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ message: "কোর্স লোড করতে সমস্যা হয়েছে" });
  }
});

app.get("/api/users/:email/courses", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ courses: user.courses || [] });
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ message: "Error fetching user courses" });
  }
});

// Payment Routes
app.post("/api/payments", validatePayment, async (req, res) => {
  try {
    const payment = new Payment(req.body);
    await payment.save();

    io.emit("newPayment", { 
      paymentId: payment._id,
      userName: payment.name,
      courseName: payment.courseName,
      amount: payment.amount,
      date: payment.date
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error("Error saving payment:", error);
    res.status(500).json({ message: "পেমেন্ট সেভ করতে সমস্যা হয়েছে" });
  }
});

app.get("/api/admin/payments", async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { txnId: { $regex: search, $options: "i" } },
      ];
    }

    const payments = await Payment.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const count = await Payment.countDocuments(query);

    res.json({
      payments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "পেমেন্ট লোড করতে সমস্যা হয়েছে" });
  }
});

app.get("/api/admin/payments/:id", async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "পেমেন্ট পাওয়া যায়নি" });
    }
    res.json(payment);
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ message: "পেমেন্ট ডিটেইলস লোড করতে সমস্যা হয়েছে" });
  }
});

app.put("/api/admin/payments/:id", async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Only approved, rejected or pending accepted",
      });
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id, 
      { status }, 
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (status === "approved") {
      const user = await User.findOneAndUpdate(
        { email: payment.email },
        { 
          $addToSet: { 
            courses: {
              courseId: payment.courseId,
              courseName: payment.courseName,
              enrolledAt: new Date(),
              progress: 0
            }
          } 
        },
        { new: true, upsert: true },
      );

      const notification = {
        type: "courseAccessUpdated",
        email: payment.email,
        courseId: payment.courseId,
        courseName: payment.courseName,
        paymentId: payment._id,
        userName: payment.name,
        timestamp: new Date().toISOString(),
      };

      io.emit("courseAccessUpdated", notification);

      await sendEmail(
        payment.email,
        "তালিমুল ইসলাম একাডেমি - কোর্স অনুমোদিত হয়েছে",
        `আপনার ${payment.courseName} কোর্সে অ্যাক্সেস চালু করা হয়েছে`,
        `
          <div style="font-family: Arial, sans-serif;">
            <h2 style="color: #4caf50;">🎉 অভিনন্দন!</h2>
            <p>প্রিয় ${payment.name},</p>
            <p>আপনার পেমেন্ট সফলভাবে অনুমোদিত হয়েছে এবং <strong>"${payment.courseName}"</strong> কোর্সে আপনার অ্যাক্সেস চালু করা হয়েছে।</p>
            <p style="margin-top: 20px;">
              <a href="https://your-course-website.com/courses/${payment.courseId}" 
                style="background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                কোর্স শুরু করুন
              </a>
            </p>
          </div>
        `
      );
    }

    res.json({
      success: true,
      message: "Payment status updated successfully",
      payment,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment",
      error: error.message,
    });
  }
});

// Socket.io Events
io.on("connection", (socket) => {
  console.log("A user connected");
  
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));