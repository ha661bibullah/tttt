const mongoose = require("mongoose")

class DatabaseConnection {
  constructor() {
    this.isConnected = false
  }

  async connect() {
    if (this.isConnected) {
      console.log("MongoDB already connected")
      return
    }

    try {
      const options = {
        // Connection options
        maxPoolSize: 10, // Maximum number of connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        bufferMaxEntries: 0, // Disable mongoose buffering
        bufferCommands: false, // Disable mongoose buffering

        // Replica set options
        retryWrites: true,
        w: "majority",

        // Additional options
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }

      await mongoose.connect(process.env.MONGO_URI, options)

      this.isConnected = true
      console.log("✅ MongoDB Connected Successfully")

      // Connection event listeners
      mongoose.connection.on("error", (err) => {
        console.error("❌ MongoDB Connection Error:", err)
        this.isConnected = false
      })

      mongoose.connection.on("disconnected", () => {
        console.log("⚠️ MongoDB Disconnected")
        this.isConnected = false
      })

      mongoose.connection.on("reconnected", () => {
        console.log("✅ MongoDB Reconnected")
        this.isConnected = true
      })

      // Graceful shutdown
      process.on("SIGINT", async () => {
        await this.disconnect()
        process.exit(0)
      })
    } catch (error) {
      console.error("❌ MongoDB Connection Failed:", error)
      this.isConnected = false
      throw error
    }
  }

  async disconnect() {
    if (!this.isConnected) {
      return
    }

    try {
      await mongoose.connection.close()
      this.isConnected = false
      console.log("✅ MongoDB Disconnected Gracefully")
    } catch (error) {
      console.error("❌ Error disconnecting from MongoDB:", error)
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    }
  }
}

module.exports = new DatabaseConnection()
