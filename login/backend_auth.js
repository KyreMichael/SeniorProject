require('dotenv').config(); // ✅ Load environment variables from .env

const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));
// ✅ Serve static files (CSS, JS, images)
app.use('/login', express.static(path.join(__dirname, 'login'), {  
    setHeaders: (res, filePath) => {  
        if (filePath.endsWith('.css')) {  
            res.setHeader('Content-Type', 'text/css');  
        }  
    }
}));

// ✅ Debugging Step: Check if .env is loading correctly
console.log("🛠 DEBUG: MONGO_URI is:", process.env.MONGO_URI);

// ✅ Ensure MongoDB URI is defined
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ ERROR: MONGO_URI is undefined. Make sure .env is loaded!");
    process.exit(1); // Stop server if MongoDB URI is missing
}

// ✅ Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// ✅ User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "student" },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Number, default: null }
});

const User = mongoose.model('User', UserSchema);

// ✅ Register User
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        console.error("❌ Registration Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// ✅ Login User
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.json({ token, role: user.role });
    } catch (error) {
        console.error("❌ Login Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// ✅ Forgot Password (Generates Reset Link)
app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: "Email not found" });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetToken = resetToken;
        user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes expiry
        await user.save();

        const resetLink = `http://localhost:5001/password-reset/reset-password.html?token=${resetToken}`;
        console.log("🔗 Reset Password Link:", resetLink);

        res.json({ message: "Password reset link generated!", resetLink });
    } catch (error) {
        console.error("❌ Forgot Password Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// ✅ Reset Password (Updates Password in MongoDB)
app.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;

    try {
        const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired reset token." });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetToken = null;
        user.resetTokenExpiry = null;
        await user.save();

        res.json({ message: "Password successfully reset! You can now log in." });
    } catch (error) {
        console.error("❌ Reset Password Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// ✅ Serve Static Files
app.use('/password-reset', express.static(path.join(__dirname, 'password-reset')));

// ✅ Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));