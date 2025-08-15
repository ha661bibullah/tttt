const mongoose = require("mongoose")

const reviewSchema = new mongoose.Schema(
  {
    // ব্যবহারকারী তথ্য
    user: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: String,
      avatar: String,
    },

    // কোর্স তথ্য
    course: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
      },
      title: String,
    },

    // রিভিউ তথ্য
    rating: {
      type: Number,
      required: [true, "রেটিং প্রয়োজন"],
      min: [1, "রেটিং কমপক্ষে ১ হতে হবে"],
      max: [5, "রেটিং সর্বোচ্চ ৫ হতে পারে"],
    },

    title: {
      type: String,
      trim: true,
      maxlength: [100, "শিরোনাম সর্বোচ্চ ১০০ অক্ষরের হতে পারে"],
    },

    comment: {
      type: String,
      required: [true, "মন্তব্য প্রয়োজন"],
      trim: true,
      maxlength: [1000, "মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে"],
    },

    // স্ট্যাটাস
    isApproved: {
      type: Boolean,
      default: false,
    },

    isHelpful: {
      helpfulCount: {
        type: Number,
        default: 0,
      },
      notHelpfulCount: {
        type: Number,
        default: 0,
      },
    },

    // মডারেশন
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: Date,
    moderationNote: String,
  },
  {
    timestamps: true,
  },
)

// ইনডেক্স
reviewSchema.index({ "course.id": 1, "user.id": 1 }, { unique: true })
reviewSchema.index({ "course.id": 1, isApproved: 1 })
reviewSchema.index({ rating: 1 })
reviewSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Review", reviewSchema)
