const API = "http://localhost:5000";

/* If already logged in, skip straight to the right panel */
(function redirectIfLoggedIn() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (token && user) {
        window.location.href = user.role === "admin" ? "admin.html" : "dashboard.html";
    }
})();

function switchTab(tab) {

    const isLogin = tab === "login";

    document.getElementById("tabLogin").classList.toggle("active", isLogin);
    document.getElementById("tabSignup").classList.toggle("active", !isLogin);

    document.getElementById("loginPanel").classList.toggle("active", isLogin);
    document.getElementById("signupPanel").classList.toggle("active", !isLogin);

    document.getElementById("loginMessage").textContent = "";
    document.getElementById("signupMessage").textContent = "";
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "🙈" : "👁";
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

function setMessage(elId, text, type) {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.className = `auth-message ${type}`;
}

function redirectByRole(user) {
    window.location.href = user.role === "admin" ? "admin.html" : "dashboard.html";
}

async function handleLogin(event) {

    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("loginBtn");

    btn.disabled = true;
    btn.textContent = "Signing in...";
    setMessage("loginMessage", "", "");

    try {

        const response = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            setMessage("loginMessage", data.message || "Invalid credentials", "error");
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        setMessage("loginMessage", "Signed in! Redirecting...", "success");

        redirectByRole(data.user);

    } catch (err) {
        setMessage("loginMessage", "Can't reach the server. Is the backend running?", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Sign In";
    }
}

async function handleSignup(event) {

    event.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const btn = document.getElementById("signupBtn");

    if (password.length < 4) {
        setMessage("signupMessage", "Password must be at least 4 characters", "error");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creating account...";
    setMessage("signupMessage", "", "");

    try {

        const response = await fetch(`${API}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            setMessage("signupMessage", data.message || "Could not create account", "error");
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        setMessage("signupMessage", "Account created! Redirecting...", "success");

        redirectByRole(data.user);

    } catch (err) {
        setMessage("signupMessage", "Can't reach the server. Is the backend running?", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Create Account";
    }
}
