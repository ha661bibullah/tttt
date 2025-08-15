const mongoose = require("mongoose")

const paymentSchema = new mongoose.Schema(
  {
    // ব্যবহারকারী তথ্য
    user: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: {
        type: String,
        required: [true, "নাম প্রয়োজন"],
        trim: true,
      },
      email: {
        type: String,
        required: [true, "ইমেইল প্রয়োজন"],
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
        required: [true, "ফোন নম্বর প্রয়োজন"],
        trim: true,
      },
    },

    // কোর্স তথ্য
    course: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    // পেমেন্ট তথ্য
    amount: {
      type: Number,
      required: [true, "পেমেন্ট পরিমাণ প্রয়োজন"],
      min: [0, "পেমেন্ট পরিমাণ ০ বা তার বেশি হতে হবে"],
    },
    currency: {
      type: String,
      default: "BDT",
      enum: ["BDT", "USD"],
    },

    // পেমেন্ট মেথড
    paymentMethod: {
      type: String,
      required: [true, "পেমেন্ট মাধ্যম প্রয়োজন"],
      enum: ["bkash", "nagad", "rocket", "upay", "bank", "card", "cash"],
    },

    // ট্রানজেকশন তথ্য
    transactionId: {
      type: String,
      required: [true, "ট্রানজেকশন আইডি প্রয়োজন"],
      trim: true,
      unique: true,
    },
    gatewayTransactionId: String,

    // স্ট্যাটাস
    status: {
      type: String,
      enum: ["pending", "processing", "approved", "rejected", "refunded", "cancelled"],
      default: "pending",
    },

    // অনুমোদন তথ্য
    approvedBy: {
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      adminName: String,
      approvedAt: Date,
      note: String,
    },

    // প্রত্যাখ্যান তথ্য
    rejectedBy: {
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      adminName: String,
      rejectedAt: Date,
      reason: String,
    },

    // রিফান্ড তথ্য
    refund: {
      amount: Number,
      reason: String,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      processedAt: Date,
      refundTransactionId: String,
    },

    // অতিরিক্ত তথ্য
    notes: String,
    attachments: [
      {
        filename: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // সিস্টেম তথ্য
    ipAddress: String,
    userAgent: String,

    // ডিসকাউন্ট তথ্য
    discount: {
      code: String,
      amount: Number,
      percentage: Number,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// ভার্চুয়াল ফিল্ড
paymentSchema.virtual("isApproved").get(function () {
  return this.status === "approved"
})

paymentSchema.virtual("isPending").get(function () {
  return this.status === "pending"
})

paymentSchema.virtual("finalAmount").get(function () {
  let final = this.amount
  if (this.discount) {
    if (this.discount.amount) {
      final -= this.discount.amount
    } else if (this.discount.percentage) {
      final -= (final * this.discount.percentage) / 100
    }
  }
  return Math.max(0, final)
})

// স্ট্যাটাস আপডেট করার মেথড
paymentSchema.methods.approve = function (adminId, adminName, note) {
  this.status = "approved"
  this.approvedBy = {
    adminId,
    adminName,
    approvedAt: new Date(),
    note,
  }
}

paymentSchema.methods.reject = function (adminId, adminName, reason) {
  this.status = "rejected"
  this.rejectedBy = {
    adminId,
    adminName,
    rejectedAt: new Date(),
    reason,
  }
}

// ইনডেক্স
paymentSchema.index({ "user.email": 1 })
paymentSchema.index({ "course.id": 1 })
paymentSchema.index({ status: 1 })
paymentSchema.index({ transactionId: 1 })
paymentSchema.index({ createdAt: -1 })
paymentSchema.index({ paymentMethod: 1 })

module.exports = mongoose.model("Payment", paymentSchema)
