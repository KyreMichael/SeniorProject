document.getElementById('forgotPasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    console.log("🚀 Forgot Password form submitted!");

    const email = document.getElementById('email').value.trim();
    const BACKEND_URL = "https://seniorproject-jkm4.onrender.com"; // Define this at the top


    if (!email) {
        alert("❌ Please enter your email.");
        return;
    }

    console.log("📤 Sending Forgot Password request for email:", email);

    try {
        const response = await fetch(`${BACKEND_URL}/password-reset/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        console.log("✅ Server Response:", data);

        if (response.ok) {
            alert("✅ Reset link sent! Check the console for the link.");
            console.log("🔗 Reset Link:", data.resetLink);
            window.location.href = data.resetLink; // Auto redirect
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (error) {
        console.error("❌ Forgot Password Request Failed:", error);
        alert("❌ Server error. Please try again.");
    }
});