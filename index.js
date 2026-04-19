const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const admin = require("firebase-admin");
// Initialize Firebase Admin SDK
const serviceAccount = require('./firebaseConfig.json')
const fileUpload = require('express-fileupload');
const cloudinary = require('./utils/cloudinary');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(fileUpload({ useTempFiles: true }))
app.use(express.json());

// verify token middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    console.log("Decoded token:", decoded);
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

//Admin verification middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.user.email;
    const user = await userCollection.findOne({ email });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin Only" })
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}


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

// Start server AFTER DB connect
async function startServer() {
  try {
    await client.connect();
    const db = client.db("kaelora_db");
    userCollection = db.collection("kaelora_user");
    productCollection = db.collection("kaelora_produts")
    cartCollection = db.collection('cart_item')
    bannerCollection = db.collection("banner")
    orderCollection = db.collection("orders")
    console.log(" MongoDB connected successfully!");

    // Root
    app.get('/', (req, res) => {
      res.send('Hello World!');
    });
    //img upload api
    app.post("/upload", async (req, res) => {
      try {
        if (!req.files || !req.files.image) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const file = req.files.image;

        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: "kaelora",
        });

        res.json({
          url: result.secure_url,
        });

      } catch (error) {
        console.log("UPLOAD ERROR:", error);
        res.status(500).json({ message: error.message });
      }
    });

    // ------------------ POST /users ------------------
    app.post('/users', verifyToken, async (req, res) => {
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
    console.log("cloudinary", cloudinary)

    // ------------------ PUT /users/:email ------------------
    app.put("/users/:email", verifyToken, async (req, res) => {
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
    app.get("/users/:email", verifyToken, async (req, res) => {
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
    //get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    // Get all products
    app.get("/products", async (req, res) => {
      try {
        const search = req.query.search;

        let query = {};

        if (search) {
          query = {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { category: { $regex: search, $options: "i" } },
              { brand: { $regex: search, $options: "i" } }
            ]
          };
        }

        let products = await productCollection.find(query).toArray();

        if (search && products.length === 0) {
          products = await productCollection.find().toArray();
        }

        res.send(products);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // app.get("/products", async (req, res) => {
    //   const products = await productCollection.find().toArray();
    //   res.send(products);
    // });
    // Get single product
    app.get("/products/:id", async (req, res) => {
      try {
        const id = req.params.id

        const product = await productCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.send(product);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Invalid product ID" });
      }
    });


    // Add product
    app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
      const newProduct = { ...req.body, createdAt: new Date(), updatedAt: new Date() };
      const result = await productCollection.insertOne(newProduct);
      res.send(result);
    });

    // Update product
    app.put("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = { ...req.body, updatedAt: new Date() };
      const result = await productCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // Delete product
    app.delete("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    //post api for cart
    app.post("/cart", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })
    //get api for cart item
    app.get("/cart", async (req, res) => {
      const email = req.query.email;
      const result = await cartCollection.find({ userEmail: email }).toArray();
      res.send(result)
    })
    //remove cart api
    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result)
      console.log(result)

    })
    //banner post api
    app.post("/banner", async (req, res) => {
      try {
        const data = req.body;
        // delete previous banner
        await bannerCollection.deleteMany({});
        // insert new banner
        const result = await bannerCollection.insertOne({
          ...data,
          createdAt: new Date(),
        });
        res.status(201).json({
          success: true,
          message: "Banner replaced successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });
    //banner get api
    app.get("/banner", async (req, res) => {
      try {
        const banner = await bannerCollection.findOne();

        res.status(200).json({
          success: true,
          message: "Banner fetched successfully",
          data: banner,
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });
    //order post api
    app.post("/orders", verifyToken, async (req, res) => {
      const { items, orderType, totalAmount, customer } = req.body;

      const order = {
        userEmail: req.user.email,
        customer,
        items,
        orderType,
        totalAmount,
        paymentMethod: "cod",
        paymentStatus: "unpaid",
        status: "pending",
        createdAt: new Date()
      };

      const result = await orderCollection.insertOne(order);

      res.send(result);
    });
    //delete from cart
    app.delete("/cart", verifyToken, async (req, res) => {
      const email = req.user.email;

      const result = await cartCollection.deleteMany({
        userEmail: email
      });

      res.send(result);
    });
    //get my order api
    app.get("/my-orders", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        const result = await orderCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get orders" });
      }
    });
    //get order only admin
    app.get("/orders", verifyToken, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(orders);
    });
    //update order status
    app.patch("/orders/:id",verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status, paymentStatus } = req.body;

      const result = await orderCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status,
            paymentStatus,
          },
        }
      );

      res.send(result);
    });
    //delete order 
    app.delete("/orders/:id",verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await orderCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    //  Start server here
    app.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error(" MongoDB connection error:", err);
  }
}

startServer();