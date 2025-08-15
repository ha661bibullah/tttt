const mongoose = require("mongoose")
const DatabaseService = require("../services/DatabaseService")
const Course = require("../models/Course")
require("dotenv").config()

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("Connected to MongoDB for seeding...")

    // Create sample admin user
    const adminUser = await DatabaseService.createUser({
      name: "Admin User",
      email: "admin@talimulislam.com",
      password: "admin123456",
      role: "admin",
      isEmailVerified: true,
    })

    console.log("✅ Admin user created")

    // Create sample instructor
    const instructor = await DatabaseService.createUser({
      name: "উস্তাদ মোহাম্মদ আলী",
      email: "instructor@talimulislam.com",
      password: "instructor123",
      role: "instructor",
      isEmailVerified: true,
      profile: {
        bio: "ইসলামিক স্টাডিজে বিশেষজ্ঞ",
        qualifications: ["আল-আজহার বিশ্ববিদ্যালয় থেকে স্নাতক", "মদিনা বিশ্ববিদ্যালয় থেকে স্নাতকোত্তর"],
      },
    })

    console.log("✅ Instructor created")

    // Create sample courses
    const courses = [
      {
        title: "প্র্যাক্টিক্যাল ইবারত",
        slug: "practical-ibarat",
        description: "আরবি ভাষা শেখার জন্য একটি সম্পূর্ণ কোর্স যা ব্যবহারিক ইবারত শেখায়।",
        shortDescription: "আরবি ভাষার মৌলিক ইবারত শিখুন",
        price: 2000,
        originalPrice: 2500,
        category: "arabic-language",
        level: "beginner",
        language: "bn",
        duration: {
          hours: 20,
          minutes: 0,
          totalMinutes: 1200,
        },
        instructor: {
          id: instructor._id,
          name: instructor.name,
          bio: instructor.profile.bio,
        },
        curriculum: [
          {
            moduleTitle: "মৌলিক ইবারত",
            moduleDescription: "আরবি ভাষার মৌলিক ইবারত শেখা",
            lessons: [
              {
                lessonId: "lesson-1",
                title: "আরবি বর্ণমালা",
                description: "আরবি বর্ণমালার পরিচয়",
                type: "video",
                duration: { minutes: 30 },
                isPreview: true,
                order: 1,
              },
              {
                lessonId: "lesson-2",
                title: "সাধারণ শব্দাবলী",
                description: "দৈনন্দিন ব্যবহৃত আরবি শব্দ",
                type: "video",
                duration: { minutes: 45 },
                order: 2,
              },
            ],
            order: 1,
          },
          {
            moduleTitle: "ব্যবহারিক কথোপকথন",
            moduleDescription: "দৈনন্দিন জীবনে ব্যবহৃত আরবি কথোপকথন",
            lessons: [
              {
                lessonId: "lesson-3",
                title: "পরিচয় পর্ব",
                description: "নিজের পরিচয় দেওয়া",
                type: "video",
                duration: { minutes: 40 },
                order: 1,
              },
            ],
            order: 2,
          },
        ],
        thumbnail: "/images/courses/practical-ibarat.jpg",
        status: "published",
        isPublished: true,
        publishedAt: new Date(),
        tags: ["আরবি", "ইবারত", "ভাষা শিক্ষা"],
        prerequisites: ["বাংলা পড়তে পারা"],
        learningObjectives: ["আরবি বর্ণমালা চেনা", "সাধারণ আরবি শব্দ বুঝতে পারা", "মৌলিক কথোপকথন করতে পারা"],
        targetAudience: ["নতুন শিক্ষার্থী", "আরবি ভাষা শিখতে আগ্রহী"],
      },
      {
        title: "কুরআন তিলাওয়াত",
        slug: "quran-tilawat",
        description: "সুন্দর ও শুদ্ধভাবে কুরআন তিলাওয়াত শেখার কোর্স।",
        shortDescription: "কুরআন তিলাওয়াতের নিয়ম শিখুন",
        price: 1500,
        category: "quran-studies",
        level: "beginner",
        language: "bn",
        duration: {
          hours: 15,
          minutes: 30,
          totalMinutes: 930,
        },
        instructor: {
          id: instructor._id,
          name: instructor.name,
          bio: instructor.profile.bio,
        },
        curriculum: [
          {
            moduleTitle: "তাজবিদের মূলনীতি",
            moduleDescription: "কুরআন তিলাওয়াতের মূল নিয়মাবলী",
            lessons: [
              {
                lessonId: "quran-lesson-1",
                title: "মাখরাজ পরিচিতি",
                description: "আরবি বর্ণের উচ্চারণস্থান",
                type: "video",
                duration: { minutes: 35 },
                isPreview: true,
                order: 1,
              },
            ],
            order: 1,
          },
        ],
        thumbnail: "/images/courses/quran-tilawat.jpg",
        status: "published",
        isPublished: true,
        publishedAt: new Date(),
        tags: ["কুরআন", "তিলাওয়াত", "তাজবিদ"],
      },
    ]

    for (const courseData of courses) {
      await DatabaseService.createCourse(courseData)
    }

    console.log("✅ Sample courses created")

    // Create sample student
    const student = await DatabaseService.createUser({
      name: "আহমেদ হাসান",
      email: "student@example.com",
      password: "student123",
      phone: "01712345678",
      isEmailVerified: true,
    })

    console.log("✅ Sample student created")

    console.log("\n🎉 Database seeding completed successfully!")
    console.log("\nLogin credentials:")
    console.log("Admin: admin@talimulislam.com / admin123456")
    console.log("Instructor: instructor@talimulislam.com / instructor123")
    console.log("Student: student@example.com / student123")
  } catch (error) {
    console.error("❌ Seeding failed:", error)
  } finally {
    await mongoose.disconnect()
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
}

module.exports = seedDatabase
