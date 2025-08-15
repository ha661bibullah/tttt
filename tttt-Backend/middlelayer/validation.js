const { body, validationResult } = require("express-validator")

// ভ্যালিডেশন এরর হ্যান্ডলার
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "ভ্যালিডেশন এরর",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
        value: error.value,
      })),
    })
  }
  next()
}

// ব্যবহারকারী রেজিস্ট্রেশন ভ্যালিডেশন
const validateUserRegistration = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("নাম ২-৫০ অক্ষরের মধ্যে হতে হবে")
    .matches(/^[a-zA-Zা-হ\s]+$/)
    .withMessage("নামে শুধুমাত্র বর্ণ এবং স্পেস থাকতে পারে"),

  body("email").isEmail().normalizeEmail().withMessage("সঠিক ইমেইল প্রদান করুন"),

  body("password")
    .isLength({ min: 6 })
    .withMessage("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("পাসওয়ার্ডে কমপক্ষে একটি ছোট হাতের অক্ষর, একটি বড় হাতের অক্ষর এবং একটি সংখ্যা থাকতে হবে"),

  body("phone")
    .optional()
    .matches(/^(\+88)?01[3-9]\d{8}$/)
    .withMessage("সঠিক বাংলাদেশী মোবাইল নম্বর প্রদান করুন"),

  handleValidationErrors,
]

// লগইন ভ্যালিডেশন
const validateLogin = [
  body("email").isEmail().normalizeEmail().withMessage("সঠিক ইমেইল প্রদান করুন"),

  body("password").notEmpty().withMessage("পাসওয়ার্ড প্রয়োজন"),

  handleValidationErrors,
]

// পেমেন্ট ভ্যালিডেশন
const validatePayment = [
  body("user.name").trim().isLength({ min: 2, max: 50 }).withMessage("নাম ২-৫০ অক্ষরের মধ্যে হতে হবে"),

  body("user.email").isEmail().normalizeEmail().withMessage("সঠিক ইমেইল প্রদান করুন"),

  body("user.phone")
    .matches(/^(\+88)?01[3-9]\d{8}$/)
    .withMessage("সঠিক বাংলাদেশী মোবাইল নম্বর প্রদান করুন"),

  body("course.id").isMongoId().withMessage("সঠিক কোর্স আইডি প্রদান করুন"),

  body("amount").isNumeric().isFloat({ min: 0 }).withMessage("সঠিক পেমেন্ট পরিমাণ প্রদান করুন"),

  body("paymentMethod")
    .isIn(["bkash", "nagad", "rocket", "upay", "bank", "card", "cash"])
    .withMessage("সঠিক পেমেন্ট মাধ্যম নির্বাচন করুন"),

  body("transactionId").trim().isLength({ min: 5, max: 50 }).withMessage("ট্রানজেকশন আইডি ৫-৫০ অক্ষরের মধ্যে হতে হবে"),

  handleValidationErrors,
]

// কোর্স তৈরি ভ্যালিডেশন
const validateCourse = [
  body("title").trim().isLength({ min: 5, max: 200 }).withMessage("কোর্সের শিরোনাম ৫-২০০ অক্ষরের মধ্যে হতে হবে"),

  body("description").trim().isLength({ min: 20, max: 2000 }).withMessage("কোর্সের বিবরণ ২০-২০০০ অক্ষরের মধ্যে হতে হবে"),

  body("price").isNumeric().isFloat({ min: 0 }).withMessage("সঠিক মূল্য প্রদান করুন"),

  body("category")
    .isIn(["islamic-studies", "arabic-language", "quran-studies", "hadith-studies", "fiqh", "other"])
    .withMessage("সঠিক ক্যাটেগরি নির্বাচন করুন"),

  body("level").isIn(["beginner", "intermediate", "advanced"]).withMessage("সঠিক লেভেল নির্বাচন করুন"),

  handleValidationErrors,
]

// রিভিউ ভ্যালিডেশন
const validateReview = [
  body("rating").isInt({ min: 1, max: 5 }).withMessage("রেটিং ১-৫ এর মধ্যে হতে হবে"),

  body("comment").trim().isLength({ min: 10, max: 1000 }).withMessage("মন্তব্য ১০-১০০০ অক্ষরের মধ্যে হতে হবে"),

  body("title").optional().trim().isLength({ max: 100 }).withMessage("শিরোনাম সর্বোচ্চ ১০০ অক্ষরের হতে পারে"),

  handleValidationErrors,
]

module.exports = {
  validateUserRegistration,
  validateLogin,
  validatePayment,
  validateCourse,
  validateReview,
  handleValidationErrors,
}
