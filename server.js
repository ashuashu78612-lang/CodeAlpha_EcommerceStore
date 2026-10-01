const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "development_secret";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/codealpha_ecommerce")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err.message));

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  image: String,
  category: String,
  stock: { type: Number, default: 10 }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    price: Number,
    quantity: Number
  }],
  total: Number,
  status: { type: String, default: "Placed" }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);
const Order = mongoose.model("Order", orderSchema);

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) return res.status(401).json({ message: "Login required" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Could not load products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch {
    res.status(400).json({ message: "Invalid product ID" });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields are required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hashed });

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
    res.status(201).json({ message: "Registration successful", token, user: { name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(password || "", user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
    res.json({ message: "Login successful", token, user: { name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

app.post("/api/orders", auth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const productIds = items.map(i => i.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    const orderItems = [];
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (!product) return res.status(400).json({ message: "Product not found" });

      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (product.stock < quantity) {
        return res.status(400).json({ message: `${product.name} has only ${product.stock} left` });
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity
      });

      product.stock -= quantity;
      await product.save();
    }

    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = await Order.create({ user: req.user.id, items: orderItems, total });

    res.status(201).json({ message: "Order placed successfully", orderId: order._id, total });
  } catch (err) {
    res.status(500).json({ message: "Order processing failed" });
  }
});

app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

app.post("/api/seed", async (req, res) => {
  const count = await Product.countDocuments();
  if (count > 0) return res.json({ message: "Products already exist" });

  await Product.insertMany([
    { name: "Wireless Headphones", description: "Comfortable Bluetooth headphones with clear sound.", price: 1499, category: "Electronics", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80", stock: 15 },
    { name: "Smart Watch", description: "Fitness tracking and notifications on your wrist.", price: 2299, category: "Electronics", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80", stock: 12 },
    { name: "Backpack", description: "Lightweight everyday backpack for college and travel.", price: 899, category: "Fashion", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80", stock: 20 },
    { name: "Running Shoes", description: "Comfortable sports shoes for daily running.", price: 1899, category: "Fashion", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80", stock: 10 },
    { name: "Coffee Mug", description: "Simple ceramic mug for tea or coffee.", price: 299, category: "Home", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=600&q=80", stock: 30 },
    { name: "Desk Lamp", description: "Minimal LED desk lamp for study and work.", price: 699, category: "Home", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80", stock: 18 }
  ]);

  res.json({ message: "Demo products added" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`E-commerce server running at http://localhost:${PORT}`));