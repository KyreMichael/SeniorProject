require('dotenv').config(); // ✅ Load environment variables

const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const SERVER_URL = "https://seniorproject-jkm4.onrender.com";  // 🔥 Your backend URL

const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + '-' + file.originalname)
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

app.use(cors({
    origin: 'https://senior-project-delta.vercel.app', // or '*' to open to all
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  }));

app.use(express.json());

app.use('/my-favicon', express.static(path.join(__dirname, 'my-favicon')));

const PORT = process.env.PORT || 5001;

// Serve static files (for password reset)
app.use('/password-reset', express.static(path.join(__dirname, 'login', 'password-reset')));

app.get('/login/login.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'login', 'login.css'));
});

app.get('/login/login.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'login', 'login.js'));
});

// Ensure MongoDB URI is defined
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ ERROR: MONGO_URI is undefined. Make sure .env is loaded!");
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// User Schema with a default team value ("N/A")
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "student" },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Number, default: null }
});
const User = mongoose.model('User', UserSchema);

/* CHECK-IN MODEL */
const CheckInSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    photo: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isVisible: { type: Boolean, default: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null }
});

// Create indexes for faster queries
CheckInSchema.index({ userId: 1, timestamp: -1 });
CheckInSchema.index({ groupId: 1, timestamp: -1 });
CheckInSchema.index({ isVisible: 1 });

const CheckIn = mongoose.model('CheckIn', CheckInSchema);

/* SETTINGS MODEL */
// Settings Schema & Model (for storing Discord URL, etc.)
const SettingsSchema = new mongoose.Schema({
  discordURL: { type: String, default: "https://discord.gg/default" },
  checkInEnabled: { type: Boolean, default: false }
});
const Settings = mongoose.model('Settings', SettingsSchema);

/* ADMIN AUTHENTICATION MIDDLEWARE */
// This middleware checks for the presence of a JWT in the Authorization header,
// verifies it, and ensures the user's role is "admin".
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ error: "Forbidden: Admins only" });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
}

/* ROUTES */

// Register User
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

// Login User (returns JWT with role and username)
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        res.json({ token, role: user.role, username: user.username });
    } catch (error) {
        console.error("❌ Login Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// Forgot Password (Generates Reset Link)
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

        const resetLink = `${SERVER_URL}/password-reset/reset-password.html?token=${resetToken}`;
        console.log("🔗 Reset Password Link:", resetLink);

        res.json({ message: "Password reset link generated!", resetLink });
    } catch (error) {
        console.error("❌ Forgot Password Error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

// Reset Password (Updates Password in MongoDB)
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

// Team Signup Endpoint
//  ——————————————————————————————————————————————
//  Team Signup (now ObjectId‑based, no more "N/A")
app.post('/team-signup', async (req, res) => {
    const { teamName, userName, members } = req.body;
  
    // 1) Basic validation
    if (!teamName || !userName || !Array.isArray(members)) {
      return res.status(400).json({ error: 'teamName, userName & members[] required' });
    }
  
    // 2) Build & dedupe list of usernames
    const names = [...new Set([userName, ...members])];
  
    // 3) Fetch those users
    const users = await User.find({ username: { $in: names } });
    if (users.length !== names.length) {
      return res.status(400).json({ error: 'One or more usernames not found' });
    }
  
    // 4) Create the new Team document
    const newTeam = await Team.create({
      name:    teamName,
      members: users.map(u => u._id)
    });
  
    // 5) Update each User.team to point at newTeam._id
    await User.updateMany(
      { _id: { $in: users.map(u => u._id) } },
      { $set: { team: newTeam._id } }
    );
  
    // 6) Success!
    res.json({ message: 'Team created!', teamId: newTeam._id });
  });
  //  ——————————————————————————————————————————————

/* SETTINGS ENDPOINTS */

// GET /api/settings/discord - Returns the current Discord URL
app.get('/api/settings/discord', async (req, res) => {
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      // If no settings exist, create one with the default value
      settings = await Settings.create({});
    }
    res.json({ discordURL: settings.discordURL });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/settings/discord - Updates the Discord URL
app.post('/api/settings/discord', async (req, res) => {
  const { discordURL } = req.body;
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = await Settings.create({ discordURL });
    } else {
      settings.discordURL = discordURL;
      await settings.save();
    }
    res.json({ message: "Discord URL updated successfully", discordURL: settings.discordURL });
  } catch (error) {
    console.error("Error updating Discord URL:", error);
    res.status(500).json({ error: "Server error updating Discord URL" });
  }
});

/* ADMIN ROUTE: Admin Dashboard (Protected Route) */
// Only users with a valid JWT containing role "admin" can access this route.
app.get("/admin", adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "admin", "admin.html"));
});

// Serve home CSS and JS
app.get('/home/home.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'home', 'home.css'));
});

app.get('/home/home.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'home', 'home.js'));
});

/* GET /api/user - Returns the latest user info (including role) */
// This endpoint helps refresh user data on page load
app.get("/api/user", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        username: user.username,
        role: user.role,
        email: user.email,
        team: user.team
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(401).json({ error: "Invalid token" });
    }
});
// 1) Company schema & model
// ─── COMPANY SCHEMA & ROUTES ──────────────────────────────────
const CompanySchema = new mongoose.Schema({
    name:          { type: String, required: true },
    maxTeams:      { type: Number, required: true },
    teamsAssigned: { type: Number, default: 0 }
  });
  const Company = mongoose.model('Company', CompanySchema);
  
  app.get('/api/companies', async (req, res) => {
    try { res.json({ companies: await Company.find() }); }
    catch(err){ res.status(500).json({ error: 'Server error' }); }
  });
  
  app.post('/api/companies', adminAuth, async (req, res) => {
    try {
      const { name, maxTeams } = req.body;
      const company = await Company.create({ name, maxTeams });
      res.status(201).json({ company });
    } catch(err) {
      res.status(400).json({ error:'Invalid payload' });
    }
  });
  
  app.put('/api/companies/:id', adminAuth, async (req, res) => {
    try {
      const company = await Company.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new:true, runValidators:true }
      );
      if(!company) return res.status(404).json({ error:'Not found' });
      res.json({ company });
    } catch(err) {
      res.status(400).json({ error:'Invalid payload' });
    }
  });
  
  app.delete('/api/companies/:id', adminAuth, async (req, res) => {
    try {
      const doc = await Company.findByIdAndDelete(req.params.id);
      if(!doc) return res.status(404).json({ error:'Not found' });
      res.json({ message:'Deleted' });
    } catch(err) {
      res.status(500).json({ error:'Server error' });
    }
  });
  
  // 4) Team schema & model (ensure this is only declared once in your file)
  // ─── Team Schema & Model ──────────────────────────────────────
const TeamSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true
    },
    members: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null
    }
  });
  const Team = mongoose.model('Team', TeamSchema);
  
  
  // ─── GET /api/teams ───────────────────────────────────────────
  // Only admins should see every team's assignments,
  // and with populated member usernames + company names.
  app.get('/api/teams', adminAuth, async (req, res) => {
    try {
      const teams = await Team.find()
        .populate('members', 'username')
        .populate('company', 'name');
      res.json({ teams });
    } catch (err) {
      console.error('Error fetching teams:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  
  // ─── POST /team-signup ────────────────────────────────────────
  // Create a new Team and assign each User.team → newTeam._id.
  app.post('/team-signup', async (req, res) => {
    const { teamName, userName, members } = req.body;
    if (!teamName || !userName || !Array.isArray(members)) {
      return res.status(400).json({ error: 'teamName, userName & members[] required' });
    }
  
    // 1) Gather & dedupe usernames
    const names = [...new Set([userName, ...members])];
  
    // 2) Lookup Users
    const users = await User.find({ username: { $in: names } });
    if (users.length !== names.length) {
      return res.status(400).json({ error: 'One or more usernames not found' });
    }
  
    // 3) Create the Team
    const newTeam = await Team.create({
      name:    teamName,
      members: users.map(u => u._id)
    });
  
    // 4) Update each User.team
    await User.updateMany(
      { _id: { $in: users.map(u => u._id) } },
      { $set: { team: newTeam._id } }
    );
  
    res.json({ message: 'Team created!', teamId: newTeam._id });
  });
  
  
  // ─── POST /api/teams/:teamId/select-company ──────────────────
  // Any authenticated user may assign their team to a company.
  app.post('/api/teams/:teamId/select-company', async (req, res) => {
    // 0) Verify JWT
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try { jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: "Invalid token" }); }
  
    // 1) Business logic
    const { teamId } = req.params;
    const { companyId } = req.body;
    const company = await Company.findById(companyId);
    if (!company || company.teamsAssigned >= company.maxTeams) {
      return res.status(400).json({ error: "No slots available" });
    }
  
    // 2) Assign & increment
    await Team.findByIdAndUpdate(teamId, { company: companyId });
    company.teamsAssigned++;
    await company.save();
  
    res.json({ message: "Company assigned!" });
  });

  const RepresentativeSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true
    },
    company: {
      type: String,
      required: true
    },
    position: {
      type: String,
      required: true
    },
    linkedinURL: {
      type: String,
      required: true
    }
  });
  const Representative = mongoose.model('Representative', RepresentativeSchema);
  
// Get all reps (public)
app.get('/api/representatives', async (req, res) => {
    const reps = await Representative.find();
    res.json({ reps });
  });
  
  // Create a rep (admin only)
  app.post('/api/representatives', adminAuth, async (req, res) => {
    const { name, company, position, linkedinURL } = req.body;
    try {
      const rep = await Representative.create({ name, company, position, linkedinURL });
      res.status(201).json({ rep });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // Update a rep (admin only)
  app.put('/api/representatives/:id', adminAuth, async (req, res) => {
    try {
      const rep = await Representative.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!rep) return res.status(404).json({ error: 'Not found' });
      res.json({ rep });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // Delete a rep (admin only)
  app.delete('/api/representatives/:id', adminAuth, async (req, res) => {
    await Representative.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  });
// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at ${SERVER_URL}`);
});

// ─── Event Schema & Model ──────────────────────────────────
const EventSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  date:      { type: Date,   required: true },
  startTime: { type: String, required: true },  // stored as "14:00"
  endTime:   { type: String, required: true }   // stored as "15:30"
});
const Event = mongoose.model('Event', EventSchema);

// ─── GET /api/events?date=YYYY-MM-DD ───────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const { date } = req.query;
    let query = {};

    if (!date) {
      // no date at all
      return res.status(400).json({ error: "date query required" });
    }

    if (date !== 'ALL') {
      // filter to that one day
      const dayStart = new Date(date + 'T00:00:00Z');   // force UTC midnight
      const dayEnd   = new Date(date + 'T00:00:00Z');
      dayEnd.setDate(dayEnd.getDate() + 1);
      query.date = { $gte: dayStart, $lt: dayEnd };
    }
    // else date === 'ALL' → leave query = {}

    const events = await Event.find(query)
      .sort({ date: 1, startTime: 1 });  // sort by date then time
    res.json({ events });
  } catch (err) {
    console.error("Error in GET /api/events:", err);
    res.status(500).json({ error: "Server error fetching events" });
  }
});
// Admin-only: return every event in the DB
app.get('/api/events/all', adminAuth, async (req, res) => {
  try {
    const events = await Event.find().sort('date startTime');
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ─── POST /api/events (admins only) ───────────────────────
app.post('/api/events', adminAuth, async (req, res) => {
  try {
    const ev = await Event.create(req.body);
    res.status(201).json({ event: ev });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid payload' });
  }
});

// ─── DELETE /api/events/:id (admins only) ─────────────────
app.delete('/api/events/:id', adminAuth, async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error:'Not found' });
    res.json({ message:'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Server error' });
  }
  
});

// ─── Submission Schema & Model ──────────────────────────────────
const SubmissionSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileData: {
        type: Buffer,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        default: null
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }
});

// Add index for better query performance
SubmissionSchema.index({ company: 1 });
SubmissionSchema.index({ team: 1 });

const Submission = mongoose.model('Submission', SubmissionSchema);

// === PROJECT FILE SUBMISSION WITH USERNAME ===
app.post('/submit-project', upload.single('projectFile'), async (req, res) => {
    try {
        // 1) Verify JWT
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ error: "No token provided" });
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: "Invalid token" });
        }

        // 2) Get user and verify they exist
        const user = await User.findById(decoded.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 3) Get file info from request
        const fileInfo = req.file;
        if (!fileInfo) return res.status(400).json({ error: "No file uploaded" });

        // 4) Read the file data
        const fileData = fs.readFileSync(fileInfo.path);
        const contentType = fileInfo.mimetype;

        // 5) Get user's team and company
        const team = await Team.findById(user.team);
        if (!team) {
            return res.status(400).json({ error: "User is not in a team" });
        }

        if (!team.company) {
            return res.status(400).json({ error: "Team is not assigned to a company" });
        }

        // 6) Create submission with file data
        const newSubmission = new Submission({
            username: user.username,
            originalName: fileInfo.originalname,
            fileName: fileInfo.filename,
            fileData: fileData,
            contentType: contentType,
            team: team._id,
            company: team.company
        });

        await newSubmission.save();

        // 7) Clean up the temporary file
        fs.unlinkSync(fileInfo.path);

        res.json({
            message: "Project submitted successfully!",
            submission: {
                fileName: fileInfo.filename,
                originalName: fileInfo.originalname,
                submittedAt: newSubmission.submittedAt,
                team: team.name,
                company: team.company
            }
        });
    } catch (err) {
        console.error("File upload error:", err);
        res.status(500).json({ error: "File upload failed" });
    }
});

// Admin endpoints for submissions
app.get('/api/admin/submissions', adminAuth, async (req, res) => {
    try {
        console.log('Fetching submissions...');
        const submissions = await Submission.find()
            .populate({
                path: 'team',
                select: 'name'
            })
            .populate({
                path: 'company',
                select: 'name'
            })
            .sort({ submittedAt: -1 });
        
        console.log('Found submissions:', submissions.map(s => ({
            id: s._id,
            team: s.team ? { id: s.team._id, name: s.team.name } : null,
            company: s.company ? { id: s.company._id, name: s.company.name } : null,
            fileName: s.fileName
        })));

        res.json({ submissions });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

app.get('/api/admin/submissions/:id/view', adminAuth, async (req, res) => {
    try {
        console.log('Viewing submission:', req.params.id);
        const submission = await Submission.findById(req.params.id);
        if (!submission) {
            console.log('Submission not found in database:', req.params.id);
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', submission.contentType);
        res.setHeader('Content-Length', submission.fileData.length);
        res.setHeader('Content-Disposition', `inline; filename="${submission.originalName}"`);
        
        // Send the file data
        res.send(submission.fileData);
    } catch (error) {
        console.error('Error viewing submission:', error);
        res.status(500).json({ error: 'Failed to view submission' });
    }
});

app.get('/api/admin/submissions/:id/download', adminAuth, async (req, res) => {
    try {
        console.log('Downloading submission:', req.params.id);
        const submission = await Submission.findById(req.params.id);
        if (!submission) {
            console.log('Submission not found:', req.params.id);
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', submission.contentType);
        res.setHeader('Content-Length', submission.fileData.length);
        res.setHeader('Content-Disposition', `attachment; filename="${submission.originalName}"`);
        
        // Send the file data
        res.send(submission.fileData);
    } catch (error) {
        console.error('Error downloading submission:', error);
        res.status(500).json({ error: 'Failed to download submission' });
    }
});

// Check-in routes
app.post('/api/checkin', async (req, res) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Get user from token with populated team
        const user = await User.findById(decoded.userId).populate('team');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { photo } = req.body;
        if (!photo) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        // Create check-in with user's ID and team
        const checkIn = new CheckIn({
            userId: user._id,
            photo,
            timestamp: new Date(),
            isVisible: true,
            groupId: user.team ? user.team._id : null  // Store the team ID directly
        });

        await checkIn.save();
        console.log('Check-in saved successfully:', {
            userId: user._id,
            timestamp: checkIn.timestamp,
            teamId: checkIn.groupId,
            teamName: user.team ? user.team.name : 'No Team'
        });

        res.status(201).json({ 
            message: 'Check-in successful',
            checkIn: {
                id: checkIn._id,
                timestamp: checkIn.timestamp,
                isVisible: checkIn.isVisible,
                teamName: user.team ? user.team.name : 'No Team'
            }
        });
    } catch (err) {
        console.error('Error saving check-in:', err);
        res.status(500).json({ error: 'Failed to save check-in' });
    }
});

// Admin routes for check-ins
app.get('/api/admin/checkins', adminAuth, async (req, res) => {
    try {
        const { visibility, group } = req.query;
        let query = {};

        if (visibility === 'visible') {
            query.isVisible = true;
        } else if (visibility === 'hidden') {
            query.isVisible = false;
        }

        if (group && group !== 'all') {
            query.groupId = group;
        }

        const checkins = await CheckIn.find(query)
            .sort({ timestamp: -1 })
            .populate({
                path: 'userId',
                select: 'username team',
                populate: {
                    path: 'team',
                    select: 'name'
                }
            })
            .populate('groupId', 'name');  // Populate the team information directly

        // Transform the data to include team name
        const transformedCheckins = checkins.map(checkin => {
            let teamName = 'No Team';
            
            // Try to get team name from populated groupId first
            if (checkin.groupId && checkin.groupId.name) {
                teamName = checkin.groupId.name;
            }
            // Fallback to user's team if groupId is not populated
            else if (checkin.userId && checkin.userId.team && checkin.userId.team.name) {
                teamName = checkin.userId.team.name;
            }

            return {
                _id: checkin._id,
                photo: checkin.photo,
                timestamp: checkin.timestamp,
                isVisible: checkin.isVisible,
                teamName: teamName
            };
        });

        console.log('Transformed check-ins:', transformedCheckins.map(c => ({
            id: c._id,
            teamName: c.teamName,
            timestamp: c.timestamp
        })));

        res.json({ checkins: transformedCheckins });
    } catch (err) {
        console.error('Error fetching check-ins:', err);
        res.status(500).json({ error: 'Failed to fetch check-ins' });
    }
});

app.put('/api/admin/checkins/:id/visibility', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { isVisible } = req.body;

        if (typeof isVisible !== 'boolean') {
            return res.status(400).json({ error: 'isVisible must be a boolean' });
        }

        const checkIn = await CheckIn.findByIdAndUpdate(
            id,
            { isVisible },
            { new: true }
        );

        if (!checkIn) {
            return res.status(404).json({ error: 'Check-in not found' });
        }

        res.json({ message: 'Visibility updated successfully', checkIn });
    } catch (err) {
        console.error('Error updating visibility:', err);
        res.status(500).json({ error: 'Failed to update visibility' });
    }
});

// Check-in status endpoints
app.get('/api/checkin-status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    let settings = await Settings.findOne({});
    if (!settings) {
      settings = await Settings.create({ checkInEnabled: false });
    }
    res.json({ enabled: settings.checkInEnabled });
  } catch (err) {
    console.error('Error fetching check-in status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/checkin-status', adminAuth, async (req, res) => {
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = await Settings.create({ checkInEnabled: false });
    }
    res.json({ enabled: settings.checkInEnabled });
  } catch (err) {
    console.error('Error fetching check-in status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/checkin-status', adminAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    let settings = await Settings.findOne({});
    if (!settings) {
      settings = await Settings.create({ checkInEnabled: enabled });
    } else {
      settings.checkInEnabled = enabled;
      await settings.save();
    }
    res.json({ enabled: settings.checkInEnabled });
  } catch (err) {
    console.error('Error updating check-in status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});