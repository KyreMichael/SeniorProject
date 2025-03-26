console.log("✅ login.js is loaded and running!");

// ✅ Grab container and buttons
const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');
const registerForm = document.querySelector('#registerForm');
const loginForm = document.querySelector('#loginForm');

// Ensure both forms exist before adding event listeners
if (!registerForm || !loginForm) {
    console.error("❌ Forms not found! Check index.html structure.");
} else {
    console.log("✅ Forms found, event listeners will work.");
}

// ✅ Toggle Login & Register Form visibility
if (registerBtn && loginBtn) {
    registerBtn.addEventListener('click', () => {
        console.log("🔄 Register form toggled!");
        container.classList.add("active");
    });

    loginBtn.addEventListener('click', () => {
        console.log("🔄 Login form toggled!");
        container.classList.remove("active");
    });
} else {
    console.error("❌ Register/Login toggle buttons not found!");
}

// Define separate URLs for backend (API) and frontend (static pages)
const BACKEND_URL = "https://seniorproject-jkm4.onrender.com";  // API calls to Render
const FRONTEND_URL = "https://senior-project-delta.vercel.app";    // Static site on Vercel

// ✅ Register User
registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    console.log("🚀 Register button clicked!");

    // ✅ Capture correct input fields
    const name = registerForm.querySelector('input[placeholder="Full Name"]').value.trim();
    const email = registerForm.querySelector('input[placeholder="Email"]').value.trim();
    const password = registerForm.querySelector('input[placeholder="Password"]').value.trim();

    if (!name || !email || !password) {
        alert("❌ All fields are required.");
        return;
    }

    console.log("📤 Sending registration data:", { username, email, password });

    try {
        const response = await fetch(`${BACKEND_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
    
        const data = await response.json();  // This is correct
        console.log("✅ Server Response:", data);
    
        if (response.ok) {
            alert('✅ Registration successful! You can now log in.');
            
            // Switch back to the login form
            container.classList.remove("active");
    
            // Clear input fields
            registerForm.reset();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (error) {
        console.error('❌ Registration error:', error);
        alert('❌ An error occurred during registration.');
    }
});

    // ✅ Login User
    loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    console.log("🚀 Login button clicked!");

    const email = loginForm.querySelector('input[placeholder="Email"]').value.trim();
    const password = loginForm.querySelector('input[placeholder="Password"]').value.trim();

    if (!email || !password) {
        alert("❌ Email and password are required.");
        return;
    }

    console.log("📤 Sending login data:", { email, password });

    try {
        const response = await fetch(`${BACKEND_URL}/login`, {  // 🔥 Use the correct SERVER_URL
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log("✅ Server Response:", data);

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', data.username);  // Save the username
        
            // Redirect to home page
            window.location.href = `${FRONTEND_URL}/home/home.html`;
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        alert('❌ An error occurred during login.');
    }
});

