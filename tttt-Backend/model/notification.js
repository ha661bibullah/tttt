const mongoose = require("mongoose")

const notificationSchema = new mongoose.Schema(
  {
    // প্রাপক
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // প্রেরক (ঐচ্ছিক)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // নোটিফিকেশন তথ্য
    type: {
      type: String,
      required: true,
      enum: [
        "course_enrollment",
        "payment_approved",
        "payment_rejected",
        "course_update",
        "new_lesson",
        "assignment_due",
        "certificate_earned",
        "system_announcement",
        "reminder",
        "welcome",
      ],
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // অতিরিক্ত ডেটা
    data: {
      courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
      lessonId: String,
      url: String,
      actionText: String,
    },

    // স্ট্যাটাস
    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: Date,

    // ডেলিভারি চ্যানেল
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
      push: {
        type: Boolean,
        default: false,
      },
    },

    // ডেলিভারি স্ট্যাটাস
    deliveryStatus: {
      email: {
        sent: Boolean,
        sentAt: Date,
        error: String,
      },
      sms: {
        sent: Boolean,
        sentAt: Date,
        error: String,
      },
      push: {
        sent: Boolean,
        sentAt: Date,
        error: String,
      },
    },

    // অগ্রাধিকার
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },

    // মেয়াদ
    expiresAt: Date,
  },
  {
    timestamps: true,
  },
)

// ইনডেক্স
notificationSchema.index({ recipient: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, isRead: 1 })
notificationSchema.index({ type: 1 })
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model("Notification", notificationSchema)
