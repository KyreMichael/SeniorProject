require('dotenv').config(); // ✅ Load environment variables

const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const SERVER_URL = "https://seniorproject-jkm4.onrender.com";  // 🔥 Your backend URL


const app = express();
app.use(express.json());
app.use(cors());

app.use('/my-favicon', express.static(path.join(__dirname, 'my-favicon')));

const PORT = process.env.PORT || 5001;

// ✅ Serve Static Files Correctly
// app.use('/login', express.static(path.join(__dirname, 'login'))); 
app.use('/password-reset', express.static(path.join(__dirname, 'login', 'password-reset')));

// ✅ Serve index.html correctly
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'login', 'index.html'));
// });

// ✅ Fix MIME type issue for CSS & JS
app.get('/login/login.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'login', 'login.css'));
});

app.get('/login/login.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'login', 'login.js'));
});

// // ✅ Debugging Step: Check if .env is loading correctly
// console.log("🛠 DEBUG: MONGO_URI is:", process.env.MONGO_URI);

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
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "student" },
    team: { type: String, default: "N/A" },  // New team field
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Number, default: null }
});

const User = mongoose.model('User', UserSchema);

// ✅ Register User
app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
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

        const token = jwt.sign({ userId: user._id, role: user.role, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, role: user.role, username: user.username });

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
//  senior-project-delta.vercel.app
        // const resetLink = `http://localhost:${PORT}/login/password-reset/reset-password.html?token=${resetToken}`;
        // const resetLink = `https://https://seniorproject-jkm4.onrender.com/login/password-reset/reset-password.html?token=${resetToken}`;
        const resetLink = `${SERVER_URL}/password-reset/reset-password.html?token=${resetToken}`;

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


app.post("/team-signup", async (req, res) => {
    const { teamName, userName, members } = req.body; // members should be an array

    if (!teamName || !userName || !Array.isArray(members)) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Create a unique list of usernames (current user + additional members)
        const allUsernames = [userName, ...members];
        const uniqueUsernames = [...new Set(allUsernames)];

        // Ensure all provided usernames exist in the database
        const users = await User.find({ username: { $in: uniqueUsernames } });
        if (users.length !== uniqueUsernames.length) {
            return res.status(400).json({ error: "One or more usernames do not exist." });
        }

        // Ensure none of these users have been assigned a team yet
        const alreadyAssigned = users.filter(user => user.team !== "N/A");
        if (alreadyAssigned.length > 0) {
            return res.status(400).json({ error: "One or more users are already assigned to a team." });
        }

        // Update the team field for all users
        await User.updateMany(
            { username: { $in: uniqueUsernames } },
            { $set: { team: teamName } }
        );

        res.json({ message: "Team signup successful!", team: teamName });
    } catch (error) {
        console.error("Team signup error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});


// ✅ Fix MIME type issues for home.css & home.js
app.get('/home/home.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'home', 'home.css'));
});

app.get('/home/home.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'home', 'home.js'));
});


// ✅ Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at ${SERVER_URL}`);
});