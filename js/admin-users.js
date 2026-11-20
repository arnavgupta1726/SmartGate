
import { app, db } from "./firebase-config.js";

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Create a separate Firebase Auth instance.
// This keeps the Admin logged in while creating staff accounts.
const staffApp = initializeApp(app.options, "staffCreation");
const staffAuth = getAuth(staffApp);

// Registration form elements
const staffForm = document.getElementById("staffRegistrationForm");
const staffName = document.getElementById("staffName");
const staffEmail = document.getElementById("staffEmail");
const staffPassword = document.getElementById("staffPassword");
const staffRole = document.getElementById("staffRole");
const createStaffButton = document.getElementById("createStaffButton");
const staffMessage = document.getElementById("staffRegistrationMessage");

function showMessage(message, success = false) {
    staffMessage.textContent = message;
    staffMessage.style.display = "block";
    staffMessage.style.color = success ? "#15803d" : "#dc2626";
}

staffForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = staffName.value.trim();
    const email = staffEmail.value.trim();
    const password = staffPassword.value;
    const role = staffRole.value;

    if (!fullName || !email || !password || !role) {
        showMessage("Please fill in all fields.");
        return;
    }

    if (!["employee", "guard"].includes(role)) {
        showMessage("Please select Employee or Guard.");
        return;
    }

    if (password.length < 6) {
        showMessage("Password must contain at least 6 characters.");
        return;
    }

    createStaffButton.disabled = true;
    createStaffButton.textContent = "Creating Account...";

    try {
        // Create account using the separate Auth instance
        const credential = await createUserWithEmailAndPassword(
            staffAuth,
            email,
            password
        );

        const newUser = credential.user;

        await updateProfile(newUser, {
            displayName: fullName
        });

        // Create the user's Firestore profile using the Admin session
        await setDoc(doc(db, "users", newUser.uid), {
            uid: newUser.uid,
            fullName: fullName,
            email: email,
            role: role,
            active: true,
            createdAt: serverTimestamp()
        });

        // Add employees to the visitor's host selection list
        if (role === "employee") {
            await setDoc(doc(db, "employeeDirectory", newUser.uid), {
                employeeId: newUser.uid,
                fullName: fullName,
                active: true,
                updatedAt: serverTimestamp()
            });
        }

        showMessage(
            `${role === "employee" ? "Employee" : "Guard"} account created successfully!`,
            true
        );

        staffForm.reset();

    } catch (error) {
        console.error("Staff registration error:", error);

        let message = "Unable to create account: " + error.message;

        if (error.code === "auth/email-already-in-use") {
            message = "This email address is already registered.";
        } else if (error.code === "auth/weak-password") {
            message = "Please use a stronger password.";
        } else if (error.code === "permission-denied") {
            message = "Firestore permission denied. Please check your rules.";
        }

        showMessage(message);

    } finally {
        createStaffButton.disabled = false;
        createStaffButton.textContent = "Create Account";
    }
});
