const mongoose = require("mongoose")

const courseSchema = new mongoose.Schema(
  {
    // মূল তথ্য
    title: {
      type: String,
      required: [true, "কোর্সের শিরোনাম প্রয়োজন"],
      trim: true,
      maxlength: [200, "শিরোনাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "কোর্সের বিবরণ প্রয়োজন"],
      maxlength: [2000, "বিবরণ সর্বোচ্চ ২০০০ অক্ষরের হতে পারে"],
    },
    shortDescription: {
      type: String,
      maxlength: [500, "সংক্ষিপ্ত বিবরণ সর্বোচ্চ ৫০০ অক্ষরের হতে পারে"],
    },

    // মূল্য এবং অ্যাক্সেস
    price: {
      type: Number,
      required: [true, "কোর্সের মূল্য প্রয়োজন"],
      min: [0, "মূল্য ০ বা তার বেশি হতে হবে"],
    },
    originalPrice: Number,
    discount: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
      },
      validUntil: Date,
    },
    isFree: {
      type: Boolean,
      default: false,
    },

    // কোর্স মেটাডেটা
    category: {
      type: String,
      required: [true, "কোর্সের ক্যাটেগরি প্রয়োজন"],
      enum: ["islamic-studies", "arabic-language", "quran-studies", "hadith-studies", "fiqh", "other"],
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    language: {
      type: String,
      enum: ["bn", "ar", "en"],
      default: "bn",
    },

    // সময় এবং সময়কাল
    duration: {
      hours: Number,
      minutes: Number,
      totalMinutes: Number,
    },
    estimatedCompletionTime: String,

    // ইন্সট্রাক্টর তথ্য
    instructor: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: String,
      bio: String,
      avatar: String,
      qualifications: [String],
    },

    // কোর্স কন্টেন্ট
    curriculum: [
      {
        moduleTitle: {
          type: String,
          required: true,
        },
        moduleDescription: String,
        lessons: [
          {
            lessonId: {
              type: String,
              required: true,
            },
            title: {
              type: String,
              required: true,
            },
            description: String,
            type: {
              type: String,
              enum: ["video", "text", "quiz", "assignment", "live"],
              default: "video",
            },
            duration: {
              minutes: Number,
            },
            videoUrl: String,
            materials: [
              {
                title: String,
                url: String,
                type: {
                  type: String,
                  enum: ["pdf", "doc", "image", "audio", "other"],
                },
              },
            ],
            isPreview: {
              type: Boolean,
              default: false,
            },
            order: {
              type: Number,
              default: 0,
            },
          },
        ],
        order: {
          type: Number,
          default: 0,
        },
      },
    ],

    // মিডিয়া
    thumbnail: {
      type: String,
      required: [true, "কোর্সের থাম্বনেইল প্রয়োজন"],
    },
    previewVideo: String,
    images: [String],

    // স্ট্যাটাস এবং সেটিংস
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,

    // এনরোলমেন্ট এবং পরিসংখ্যান
    enrollmentCount: {
      type: Number,
      default: 0,
    },
    maxEnrollments: Number,

    // রেটিং এবং রিভিউ
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },

    // SEO এবং মার্কেটিং
    tags: [String],
    metaTitle: String,
    metaDescription: String,

    // সার্টিফিকেট
    certificate: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      template: String,
      completionRequirement: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
    },

    // প্রয়োজনীয়তা এবং লক্ষ্য
    prerequisites: [String],
    learningObjectives: [String],
    targetAudience: [String],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// ভার্চুয়াল ফিল্ড
courseSchema.virtual("totalLessons").get(function () {
  return this.curriculum.reduce((total, module) => total + module.lessons.length, 0)
})

courseSchema.virtual("discountedPrice").get(function () {
  if (this.discount && this.discount.percentage && this.discount.validUntil > new Date()) {
    return this.price - (this.price * this.discount.percentage) / 100
  }
  return this.price
})

// স্লাগ জেনারেট করার মিডলওয়্যার
courseSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim()
  }

  // মোট সময় ক্যালকুলেট করা
  if (this.duration && this.duration.hours && this.duration.minutes) {
    this.duration.totalMinutes = this.duration.hours * 60 + this.duration.minutes
  }

  next()
})

// ইনডেক্স
courseSchema.index({ slug: 1 })
courseSchema.index({ category: 1, status: 1 })
courseSchema.index({ "instructor.id": 1 })
courseSchema.index({ price: 1 })
courseSchema.index({ "rating.average": -1 })
courseSchema.index({ createdAt: -1 })
courseSchema.index({ tags: 1 })

module.exports = mongoose.model("Course", courseSchema)
