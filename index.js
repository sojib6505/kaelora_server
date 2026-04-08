const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@servercluster.nvwzi5y.mongodb.net/?appName=ServerCluster`;

// MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let userCollection;

// ✅ Start server AFTER DB connect
async function startServer() {
  try {
    await client.connect();
    const db = client.db("kaelora_db");
    userCollection = db.collection("kaelora_user");

    console.log("✅ MongoDB connected successfully!");

    // Root
    app.get('/', (req, res) => {
      res.send('Hello World!');
    });

    // ------------------ POST /users ------------------
    app.post('/users', async (req, res) => {
      try {
        const { name, email, photoURL, role, location, phone } = req.body;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const existingUser = await userCollection.findOne({ email });

        if (existingUser) {
          return res.status(200).json({
            message: "User already exists",
            user: existingUser
          });
        }

        const newUser = {
          name: name || "",
          email,
          photoURL: photoURL || "",
          role: role || "user",
          phone: phone || "",
          location: location || {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await userCollection.insertOne(newUser);

        res.status(201).json({
          message: "User created",
          user: newUser
        });

      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // ------------------ PUT /users/:email ------------------
    app.put("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updatedData = req.body;

        const updateDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          }
        };

        const result = await userCollection.updateOne(
          { email },
          updateDoc,
          { upsert: true }
        );

        res.send(result);

      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // ------------------ GET /users/:email ------------------
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.send(user);

      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // ✅ Start server here
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error(" MongoDB connection error:", err);
  }
}

startServer();