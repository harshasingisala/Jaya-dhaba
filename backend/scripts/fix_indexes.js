const mongoose = require("mongoose");
require("dotenv").config();

async function cleanupIndexes() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/feedx");
    console.log("Connected! Checking indexes on 'users' collection...");

    const User = mongoose.model("User", new mongoose.Schema({}), "users");
    
    // Get existing indexes
    const indexes = await User.collection.indexes();
    console.log("Current indexes:", JSON.stringify(indexes, null, 2));

    // Look for the 'pin' index
    const pinIndex = indexes.find(idx => idx.name === "pin_1" || (idx.key && idx.key.pin));
    
    if (pinIndex) {
      console.log(`Dropping index: ${pinIndex.name}`);
      await User.collection.dropIndex(pinIndex.name);
      console.log("Index dropped successfully!");
    } else {
      console.log("No 'pin' index found.");
    }

    // Drop other non-standard unique indexes if they exist
    // (Email and UID should stay unique)
    for (const idx of indexes) {
      if (idx.unique && idx.name !== "email_1" && idx.name !== "uid_1" && idx.name !== "_id_") {
        console.log(`Dropping unnecessary unique index: ${idx.name}`);
        await User.collection.dropIndex(idx.name);
      }
    }

    console.log("Cleanup complete!");
  } catch (err) {
    console.error("Cleanup failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

cleanupIndexes();
