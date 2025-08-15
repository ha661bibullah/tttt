const mongoose = require("mongoose")

const progressSchema = new mongoose.Schema(
  {
    // ব্যবহারকারী এবং কোর্স
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // সামগ্রিক অগ্রগতি
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // লেসন অগ্রগতি
    lessons: [
      {
        lessonId: {
          type: String,
          required: true,
        },
        moduleIndex: Number,
        lessonIndex: Number,
        status: {
          type: String,
          enum: ["not_started", "in_progress", "completed"],
          default: "not_started",
        },
        startedAt: Date,
        completedAt: Date,
        timeSpent: {
          type: Number, // মিনিটে
          default: 0,
        },
        watchTime: {
          type: Number, // ভিডিওর ক্ষেত্রে সেকেন্ডে
          default: 0,
        },
        lastPosition: {
          type: Number, // ভিডিওর শেষ অবস্থান সেকেন্ডে
          default: 0,
        },
      },
    ],

    // কুইজ এবং অ্যাসাইনমেন্ট
    assessments: [
      {
        lessonId: String,
        type: {
          type: String,
          enum: ["quiz", "assignment", "exam"],
        },
        score: Number,
        maxScore: Number,
        percentage: Number,
        attempts: [
          {
            attemptNumber: Number,
            score: Number,
            answers: [
              {
                questionId: String,
                answer: mongoose.Schema.Types.Mixed,
                isCorrect: Boolean,
              },
            ],
            completedAt: Date,
            timeSpent: Number,
          },
        ],
        bestScore: Number,
        status: {
          type: String,
          enum: ["not_attempted", "in_progress", "completed", "passed", "failed"],
          default: "not_attempted",
        },
      },
    ],

    // সময় ট্র্যাকিং
    totalTimeSpent: {
      type: Number, // মিনিটে
      default: 0,
    },

    // সার্টিফিকেট
    certificate: {
      isEarned: {
        type: Boolean,
        default: false,
      },
      earnedAt: Date,
      certificateId: String,
      downloadCount: {
        type: Number,
        default: 0,
      },
    },

    // শেষ অ্যাক্সেস
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    lastAccessedLesson: String,

    // সম্পূর্ণতা
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,

    // নোট এবং বুকমার্ক
    notes: [
      {
        lessonId: String,
        note: String,
        timestamp: Number, // ভিডিওর ক্ষেত্রে
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    bookmarks: [
      {
        lessonId: String,
        title: String,
        timestamp: Number,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
)

// ইউনিক ইনডেক্স
progressSchema.index({ user: 1, course: 1 }, { unique: true })

// অন্যান্য ইনডেক্স
progressSchema.index({ user: 1 })
progressSchema.index({ course: 1 })
progressSchema.index({ overallProgress: 1 })
progressSchema.index({ lastAccessedAt: -1 })

// অগ্রগতি আপডেট করার মেথড
progressSchema.methods.updateProgress = function () {
  const completedLessons = this.lessons.filter((lesson) => lesson.status === "completed").length
  const totalLessons = this.lessons.length

  if (totalLessons > 0) {
    this.overallProgress = Math.round((completedLessons / totalLessons) * 100)

    if (this.overallProgress === 100 && !this.isCompleted) {
      this.isCompleted = true
      this.completedAt = new Date()
    }
  }
}

module.exports = mongoose.model("Progress", progressSchema)
