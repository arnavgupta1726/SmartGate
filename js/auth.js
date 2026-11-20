
import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// HTML elements
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

const registerMessage = document.getElementById("registerMessage");
const loginMessage = document.getElementById("loginMessage");

function showMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "green" : "red";
}

// Dashboard paths
const dashboardRoutes = {
    visitor: "dashboard/visitor-dashboard.html",
    employee: "dashboard/employee-dashboard.html",
    guard: "dashboard/guard-dashboard.html",
    admin: "dashboard/admin-dashboard.html"
};

// ===============================
// VISITOR REGISTRATION
// ===============================

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const fullName = document.getElementById("fullName")?.value.trim();
        const email = document.getElementById("email")?.value.trim();
        const password = document.getElementById("password")?.value;

        if (!fullName || !email || !password) {
            showMessage(registerMessage, "Please fill all fields.");
            return;
        }

        try {
            const result = await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

            await updateProfile(result.user, {
                displayName: fullName
            });

            await setDoc(doc(db, "users", result.user.uid), {
                uid: result.user.uid,
                fullName: fullName,
                email: email,
                role: "visitor",
                active: true,
                createdAt: serverTimestamp()
            });

            showMessage(
                registerMessage,
                "Registration successful! Please login.",
                true
            );

            await signOut(auth);

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1200);

        } catch (error) {
            console.error("Registration error:", error);

            showMessage(
                registerMessage,
                "Registration failed: " + error.message
            );
        }
    });
}

// ===============================
// LOGIN FOR ALL ROLES
// ===============================

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        // Correct IDs from your login.html
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;

        if (!email || !password) {
            showMessage(loginMessage, "Please enter email and password.");
            return;
        }

        try {
            showMessage(loginMessage, "Checking login details...", true);

            const result = await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

            const user = result.user;

            const profileSnapshot = await getDoc(
                doc(db, "users", user.uid)
            );

            if (!profileSnapshot.exists()) {
                await signOut(auth);
                showMessage(loginMessage, "User profile not found in Firestore.");
                return;
            }

            const userData = profileSnapshot.data();

            if (userData.active !== true) {
                await signOut(auth);
                showMessage(loginMessage, "Your account is inactive.");
                return;
            }

            const destination = dashboardRoutes[userData.role];

            if (!destination) {
                await signOut(auth);
                showMessage(loginMessage, "Invalid user role.");
                return;
            }

            showMessage(
                loginMessage,
                "Login successful! Opening your dashboard...",
                true
            );

            setTimeout(() => {
                window.location.href = destination;
            }, 1000);

        } catch (error) {
            console.error("Login error:", error);

            let message = "Login failed. Please try again.";

            if (
                error.code === "auth/invalid-credential" ||
                error.code === "auth/user-not-found" ||
                error.code === "auth/wrong-password"
            ) {
                message = "Incorrect email or password.";
            } else if (error.code === "auth/too-many-requests") {
                message = "Too many attempts. Please try again later.";
            } else if (error.code === "permission-denied") {
                message = "Firestore permission denied.";
            }

            showMessage(loginMessage, message);
        }
    });
}
