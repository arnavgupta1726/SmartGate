
import { auth, db } from "./firebase-config.js";

import {
    collection,
    addDoc,
    query,
    where,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// HTML elements
const appointmentForm = document.getElementById("appointmentForm");
const appointmentMessage = document.getElementById("appointmentMessage");
const myAppointments = document.getElementById("myAppointments");

const appointmentCount = document.getElementById("appointmentCount");
const approvedCount = document.getElementById("approvedCount");
const qrCount = document.getElementById("qrCount");
const qrPassContainer = document.getElementById("qrPassContainer");

const notificationsList = document.getElementById("notificationsList");
const notificationCount = document.getElementById("notificationCount");

let currentUser = null;
let unsubscribeAppointments = null;
let unsubscribeNotifications = null;
let unsubscribeEmployees = null;


// Convert existing hostName input into employee dropdown
let hostNameField = document.getElementById("hostName");

if (hostNameField && hostNameField.tagName !== "SELECT") {
    const employeeSelect = document.createElement("select");

    employeeSelect.id = "hostName";
    employeeSelect.name = "hostName";
    employeeSelect.required = true;
    employeeSelect.className = hostNameField.className;

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Loading employees...";
    employeeSelect.appendChild(defaultOption);

    hostNameField.replaceWith(employeeSelect);
    hostNameField = employeeSelect;
}


// Show messages
function showMessage(message, success = false) {
    appointmentMessage.textContent = message;
    appointmentMessage.style.color = success ? "green" : "red";
}


// Load active employees
function loadEmployees() {

    if (!hostNameField) return;

    const employeeQuery = query(
        collection(db, "employeeDirectory"),
        where("active", "==", true)
    );

    unsubscribeEmployees = onSnapshot(
        employeeQuery,
        (snapshot) => {

            const previousValue = hostNameField.value;

            hostNameField.innerHTML = "";

            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = snapshot.empty
                ? "No active employees available"
                : "Select an employee";

            hostNameField.appendChild(defaultOption);

            snapshot.forEach((employeeDocument) => {

                const employee = employeeDocument.data();

                const option = document.createElement("option");

                // Employee UID is stored as the option value
                option.value = employeeDocument.id;

                option.textContent =
                    employee.fullName || "Employee";

                hostNameField.appendChild(option);
            });

            // Preserve selection if possible
            if (
                previousValue &&
                [...hostNameField.options].some(
                    option => option.value === previousValue
                )
            ) {
                hostNameField.value = previousValue;
            }
        },
        (error) => {
            console.error("Employee directory error:", error);

            hostNameField.innerHTML = "";

            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Could not load employees";

            hostNameField.appendChild(option);
        }
    );
}


// Format notification date
function formatNotificationDate(timestamp) {

    if (!timestamp || !timestamp.toDate) {
        return "Just now";
    }

    return timestamp.toDate().toLocaleString();
}


// Display notifications
function displayNotifications(notifications) {

    if (!notificationsList || !notificationCount) return;

    notificationsList.innerHTML = "";

    const unread = notifications.filter(
        item => item.isRead !== true
    );

    notificationCount.textContent = unread.length;

    if (notifications.length === 0) {
        notificationsList.innerHTML =
            '<div class="empty-state">You have no notifications yet.</div>';
        return;
    }

    notifications.forEach((notification) => {

        const card = document.createElement("div");
        card.className = "appointment-card";

        const heading = document.createElement("h3");

        heading.textContent =
            notification.status === "approved"
                ? "Appointment Approved"
                : "Appointment Rejected";

        const message = document.createElement("p");

        message.textContent =
            notification.message ||
            "Your appointment status has been updated.";

        const date = document.createElement("p");

        date.textContent =
            "Date: " + formatNotificationDate(notification.createdAt);

        const status = document.createElement("span");

        status.className =
            "appointment-status " +
            (notification.isRead ? "approved" : "pending");

        status.textContent =
            notification.isRead ? "READ" : "UNREAD";

        card.append(heading, message, date, status);

        if (!notification.isRead) {

            const readButton = document.createElement("button");

            readButton.type = "button";
            readButton.className = "submit-btn";
            readButton.style.marginTop = "12px";
            readButton.textContent = "Mark as Read";

            readButton.addEventListener("click", async () => {

                readButton.disabled = true;

                try {
                    await updateDoc(
                        doc(db, "notifications", notification.id),
                        {
                            isRead: true
                        }
                    );

                } catch (error) {

                    console.error(
                        "Mark notification read error:",
                        error
                    );

                    alert("Could not mark notification as read.");
                    readButton.disabled = false;
                }
            });

            card.appendChild(readButton);
        }

        notificationsList.appendChild(card);
    });
}


// Display appointment history
function displayAppointments(appointments) {

    myAppointments.innerHTML = "";

    const approved = appointments.filter(
        item => item.status === "approved"
    );

    appointmentCount.textContent = appointments.length;
    approvedCount.textContent = approved.length;
    qrCount.textContent = approved.length;

    if (appointments.length === 0) {

        myAppointments.innerHTML =
            '<div class="empty-state">You have not booked any appointments yet.</div>';
    }

    appointments.forEach((appointment) => {

        const card = document.createElement("div");
        card.className = "appointment-card";

        const heading = document.createElement("h3");

        heading.textContent =
            "Visit with " + (appointment.hostName || "Host");

        const purpose = document.createElement("p");
        purpose.textContent =
            "Purpose: " + (appointment.purpose || "");

        const date = document.createElement("p");
        date.textContent =
            "Date: " + (appointment.visitDate || "");

        const time = document.createElement("p");
        time.textContent =
            "Time: " + (appointment.visitTime || "");

        const status = document.createElement("span");

        status.className =
            "appointment-status " + appointment.status;

        status.textContent =
            (appointment.status || "pending").toUpperCase();

        card.append(heading, purpose, date, time, status);

        myAppointments.appendChild(card);
    });

    displayQRPasses(approved);
}


// Display QR passes
function displayQRPasses(approvedAppointments) {

    qrPassContainer.innerHTML = "";

    if (approvedAppointments.length === 0) {

        const info = document.createElement("div");
        info.className = "qr-info";

        const heading = document.createElement("h3");
        heading.textContent = "QR Pass Not Available Yet";

        const paragraph = document.createElement("p");

        paragraph.textContent =
            "Your QR visitor pass will appear here after your host approves your appointment.";

        info.append(heading, paragraph);
        qrPassContainer.appendChild(info);

        return;
    }

    if (typeof QRCode === "undefined") {

        qrPassContainer.textContent =
            "QR library could not load. Please check your internet connection.";

        return;
    }

    approvedAppointments.forEach((appointment) => {

        const passCard = document.createElement("div");
        passCard.className = "appointment-card";

        const heading = document.createElement("h3");
        heading.textContent = "Approved Visitor Pass";

        const date = document.createElement("p");
        date.textContent = "Visit Date: " + appointment.visitDate;

        const time = document.createElement("p");
        time.textContent = "Visit Time: " + appointment.visitTime;

        const qrBox = document.createElement("div");

        qrBox.style.width = "180px";
        qrBox.style.minHeight = "180px";
        qrBox.style.margin = "20px auto";
        qrBox.style.display = "flex";
        qrBox.style.justifyContent = "center";

        const passId = "SMARTGATE|PASS|" + appointment.id;

        new QRCode(qrBox, {
            text: passId,
            width: 180,
            height: 180,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const instruction = document.createElement("p");

        instruction.textContent =
            "Show this QR code to the security guard at the gate.";

        instruction.style.textAlign = "center";

        const passNumber = document.createElement("p");

        passNumber.textContent =
            "Pass ID: " + appointment.id;

        passNumber.style.fontSize = "12px";
        passNumber.style.color = "#64748b";
        passNumber.style.textAlign = "center";

        passCard.append(
            heading,
            date,
            time,
            qrBox,
            instruction,
            passNumber
        );

        qrPassContainer.appendChild(passCard);
    });
}


// Authentication and Firestore listeners
onAuthStateChanged(auth, (user) => {

    if (!user) {

        if (unsubscribeAppointments) unsubscribeAppointments();
        if (unsubscribeNotifications) unsubscribeNotifications();
        if (unsubscribeEmployees) unsubscribeEmployees();

        window.location.href = "../login.html";
        return;
    }

    currentUser = user;

    if (unsubscribeAppointments) unsubscribeAppointments();
    if (unsubscribeNotifications) unsubscribeNotifications();
    if (unsubscribeEmployees) unsubscribeEmployees();

    // Load employee dropdown
    loadEmployees();

    // Visitor appointments
    const appointmentsQuery = query(
        collection(db, "appointments"),
        where("visitorId", "==", user.uid)
    );

    unsubscribeAppointments = onSnapshot(
        appointmentsQuery,
        (snapshot) => {

            const appointments = [];

            snapshot.forEach((documentSnapshot) => {

                appointments.push({
                    id: documentSnapshot.id,
                    ...documentSnapshot.data()
                });
            });

            appointments.sort((a, b) => {
                return (b.createdAt?.seconds || 0) -
                       (a.createdAt?.seconds || 0);
            });

            displayAppointments(appointments);
        },
        (error) => {

            console.error("Appointment loading error:", error);

            myAppointments.textContent =
                "Unable to load appointments. Please check Firestore rules.";

            qrPassContainer.textContent =
                "Unable to load QR passes.";
        }
    );

    // Visitor notifications
    const notificationsQuery = query(
        collection(db, "notifications"),
        where("visitorId", "==", user.uid)
    );

    unsubscribeNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {

            const notifications = [];

            snapshot.forEach((documentSnapshot) => {

                notifications.push({
                    id: documentSnapshot.id,
                    ...documentSnapshot.data()
                });
            });

            notifications.sort((a, b) => {
                return (b.createdAt?.seconds || 0) -
                       (a.createdAt?.seconds || 0);
            });

            displayNotifications(notifications);
        },
        (error) => {

            console.error("Notification loading error:", error);

            if (notificationsList) {
                notificationsList.textContent =
                    "Unable to load notifications. Check Firestore rules.";
            }
        }
    );
});


// Book appointment
appointmentForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    if (!currentUser) {
        showMessage("Please login before booking an appointment.");
        return;
    }

    const hostId = hostNameField.value;

    const selectedOption =
        hostNameField.options[hostNameField.selectedIndex];

    const hostName = selectedOption
        ? selectedOption.textContent
        : "";

    const purpose =
        document.getElementById("purpose").value.trim();

    const visitDate =
        document.getElementById("visitDate").value;

    const visitTime =
        document.getElementById("visitTime").value;

    if (!hostId || !purpose || !visitDate || !visitTime) {

        showMessage(
            "Please select an employee and fill in all appointment details."
        );

        return;
    }

    const visitDateTime = new Date(
        `${visitDate}T${visitTime}`
    );

    if (
        Number.isNaN(visitDateTime.getTime()) ||
        visitDateTime <= new Date()
    ) {

        showMessage(
            "Please select a future date and time."
        );

        return;
    }

    const submitButton = appointmentForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;

    showMessage("Submitting your appointment...", true);

    try {

        await addDoc(collection(db, "appointments"), {

            visitorId: currentUser.uid,
            visitorName: currentUser.displayName || "Visitor",
            visitorEmail: currentUser.email,

            // Selected employee information
            hostId: hostId,
            hostName: hostName,

            purpose: purpose,
            visitDate: visitDate,
            visitTime: visitTime,

            status: "pending",
            qrGenerated: false,

            createdAt: serverTimestamp(),
            visitTimestamp: Timestamp.fromDate(visitDateTime)
        });

        showMessage(
            "Appointment submitted successfully! Waiting for selected employee approval.",
            true
        );

        appointmentForm.reset();

    } catch (error) {

        console.error("Appointment booking error:", error);

        showMessage(
            "Appointment booking failed: " + error.message
        );

    } finally {

        submitButton.disabled = false;
    }
});
