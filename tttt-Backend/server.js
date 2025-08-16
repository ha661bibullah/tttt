const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Models
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
    refreshToken: String,
    createdAt: { type: Date, default: Date.now },
  })
);

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
);

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
);

// Middleware
app.use(cors());
app.use(express.json());

// Authentication Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(403).json({ success: false, message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to authenticate token",
        error: err.message 
      });
    }
    
    req.userId = decoded.userId;
    next();
  });
};

// Payment Validation Middleware
const validatePayment = (req, res, next) => {
  const { name, email, phone, courseId, paymentMethod, txnId, amount } = req.body;

  if (!name || !email || !phone || !courseId || !paymentMethod || !txnId || !amount) {
    return res.status(400).json({ 
      success: false,
      message: "সমস্ত প্রয়োজনীয় ফিল্ড পূরণ করুন" 
    });
  }

  if (!["bkash", "nagad", "bank", "card"].includes(paymentMethod)) {
    return res.status(400).json({ 
      success: false,
      message: "অবৈধ পেমেন্ট মাধ্যম" 
    });
  }

  next();
};

// Routes

// User Registration
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "নাম, ইমেইল এবং পাসওয়ার্ড প্রয়োজন" 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "ইউজার ইতিমধ্যে বিদ্যমান" 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      courses: [],
    });

    await user.save();

    // Generate tokens
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, { 
      expiresIn: "7d" 
    });

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      message: "রেজিস্ট্রেশন সফল হয়েছে",
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false, 
      message: "রেজিস্ট্রেশন ব্যর্থ হয়েছে",
      error: error.message 
    });
  }
});

// User Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "ইমেইল এবং পাসওয়ার্ড প্রয়োজন" 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "ভুল ইমেইল বা পাসওয়ার্ড" 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "ভুল ইমেইল বা পাসওয়ার্ড" 
      });
    }

    // Generate tokens
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, { 
      expiresIn: "7d" 
    });

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      message: "লগইন সফল হয়েছে",
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        courses: user.courses,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "লগইন ব্যর্থ হয়েছে",
      error: error.message 
    });
  }
});

// Token Refresh
app.post("/api/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: "Refresh token প্রয়োজন" 
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ 
        success: false, 
        message: "অবৈধ refresh token" 
      });
    }

    // Generate new tokens
    const newToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const newRefreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, { 
      expiresIn: "7d" 
    });

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(403).json({ 
      success: false, 
      message: "অবৈধ refresh token",
      error: error.message 
    });
  }
});

// Get User Profile (Protected)
app.get("/api/user", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "ইউজার পাওয়া যায়নি" 
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ 
      success: false, 
      message: "ইউজার ডেটা লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

// OTP Routes
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "ইমেইল প্রয়োজন" 
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = Date.now() + 300000; // 5 minutes

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "তালিমুল ইসলাম একাডেমি - OTP কোড",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">OTP কোড</h2>
          <p>আপনার OTP কোড: <strong>${otp}</strong></p>
          <p>এই কোডটি ৫ মিনিটের মধ্যে ব্যবহার করুন।</p>
          <p style="color: #666;">ধন্যবাদ,<br>তালিমুল ইসলাম একাডেমি টিম</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    await User.findOneAndUpdate(
      { email },
      { otp, otpExpires },
      { upsert: true, new: true }
    );

    res.json({ 
      success: true, 
      message: "OTP সফলভাবে পাঠানো হয়েছে" 
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ 
      success: false, 
      message: "OTP পাঠাতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "ইমেইল এবং OTP প্রয়োজন" 
      });
    }

    const user = await User.findOne({ email });

    if (!user || user.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: "অবৈধ OTP" 
      });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ 
        success: false, 
        message: "OTP এর মেয়াদ শেষ হয়ে গেছে" 
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
      message: "OTP যাচাই করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

// Payment Routes
app.post("/api/payments", validatePayment, async (req, res) => {
  try {
    const { name, email, phone, courseId, paymentMethod, txnId, amount } = req.body;

    // Find course details
    const course = await Course.findOne({ id: courseId });
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "কোর্স পাওয়া যায়নি" 
      });
    }

    const payment = new Payment({
      userId: req.userId,
      name,
      email,
      phone,
      courseId,
      courseName: course.title,
      paymentMethod,
      txnId,
      amount,
      status: "pending",
    });

    await payment.save();
    await notifyAdmin(payment._id);

    res.status(201).json({
      success: true,
      message: "পেমেন্ট সফলভাবে জমা হয়েছে",
      payment,
    });
  } catch (error) {
    console.error("Error saving payment:", error);
    res.status(500).json({ 
      success: false, 
      message: "পেমেন্ট সেভ করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.get("/api/admin/payments", verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { txnId: { $regex: search, $options: "i" } },
        { courseName: { $regex: search, $options: "i" } },
      ];
    }

    const payments = await Payment.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const count = await Payment.countDocuments(query);

    res.json({
      success: true,
      payments,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalPayments: count,
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ 
      success: false, 
      message: "পেমেন্ট লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.get("/api/admin/payments/:id", verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: "পেমেন্ট পাওয়া যায়নি" 
      });
    }

    res.json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ 
      success: false, 
      message: "পেমেন্ট ডিটেইলস লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.put("/api/admin/payments/:id", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "অবৈধ স্ট্যাটাস ভ্যালু। শুধুমাত্র approved, rejected বা pending গ্রহণযোগ্য",
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
        message: "পেমেন্ট পাওয়া যায়নি",
      });
    }

    // If approved, grant course access
    if (status === "approved") {
      const user = await User.findOneAndUpdate(
        { email: payment.email },
        { $addToSet: { courses: payment.courseId } },
        { new: true }
      );

      if (!user) {
        console.error(`User not found with email: ${payment.email}`);
      } else {
        // Send real-time notification
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

        // Send email notification
        await sendCourseAccessEmail(
          payment.email,
          payment.name,
          payment.courseName || payment.courseId
        );
      }
    }

    res.json({
      success: true,
      message: "পেমেন্ট স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে",
      payment,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({
      success: false,
      message: "পেমেন্ট আপডেট করতে সমস্যা হয়েছে",
      error: error.message,
    });
  }
});

// Course Routes
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      courses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ 
      success: false, 
      message: "কোর্স লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.get("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "কোর্স পাওয়া যায়নি" 
      });
    }

    res.json({
      success: true,
      course,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ 
      success: false, 
      message: "কোর্স ডিটেইলস লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

app.get("/api/users/:email/courses", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "ইউজার পাওয়া যায়নি" 
      });
    }

    // Find all courses the user has access to
    const courses = await Course.find({ id: { $in: user.courses } });

    res.json({
      success: true,
      courses,
    });
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ 
      success: false, 
      message: "ইউজার কোর্স লোড করতে সমস্যা হয়েছে",
      error: error.message 
    });
  }
});

// Helper Functions
async function notifyAdmin(paymentId) {
  console.log(`New payment created: ${paymentId}`);
  // Implement actual notification logic (email, SMS, etc.)
}

async function sendCourseAccessEmail(email, name, courseName) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

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
            <a href="${process.env.FRONTEND_URL}/practical-ibarat" 
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
    };

    await transporter.sendMail(mailOptions);
    console.log(`Course access email sent to ${email}`);
  } catch (error) {
    console.error("Error sending course access email:", error);
    throw error;
  }
}

// WebSocket Connection
io.on("connection", (socket) => {
  console.log("A user connected");
  
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));