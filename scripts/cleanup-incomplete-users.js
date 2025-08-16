const mongoose = require("mongoose")
const dotenv = require("dotenv")

dotenv.config()

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err))

// User model
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

async function cleanupIncompleteUsers() {
  try {
    // Find users without name or password
    const incompleteUsers = await User.find({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: "" },
        { password: { $exists: false } },
        { password: null },
        { password: "" },
      ],
    })

    console.log(`Found ${incompleteUsers.length} incomplete users:`)

    for (const user of incompleteUsers) {
      console.log(
        `- Email: ${user.email}, Name: ${user.name || "missing"}, Password: ${user.password ? "exists" : "missing"}`,
      )
    }

    if (incompleteUsers.length > 0) {
      const result = await User.deleteMany({
        $or: [
          { name: { $exists: false } },
          { name: null },
          { name: "" },
          { password: { $exists: false } },
          { password: null },
          { password: "" },
        ],
      })

      console.log(`Deleted ${result.deletedCount} incomplete user records`)
    }

    process.exit(0)
  } catch (error) {
    console.error("Error cleaning up incomplete users:", error)
    process.exit(1)
  }
}

// Run cleanup
cleanupIncompleteUsers()
