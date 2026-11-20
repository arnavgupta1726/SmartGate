
import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const rejectedCount = document.getElementById("rejectedCount");
const appointmentsList = document.getElementById("appointmentsList");


let currentEmployeeId = null;


onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            alert("Employee profile not found.");
            window.location.href = "../login.html";
            return;
        }

        const userData = userSnap.data();

        if (userData.role !== "employee" || userData.active !== true) {
            alert("Access denied.");
            window.location.href = "../login.html";
            return;
        }

        currentEmployeeId = user.uid;

        const employeeName =
            userData.fullName ||
            user.displayName ||
            user.email ||
            "Employee";

        // Register employee in Employee Directory
        const employeeRef = doc(
            db,
            "employeeDirectory",
            user.uid
        );

        await setDoc(employeeRef, {
            employeeId: user.uid,
            fullName: employeeName,
            active: true,
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Load only appointments assigned to this employee
        loadAssignedAppointments();

    } catch (error) {

        console.error("Employee dashboard error:", error);

        alert("Unable to load employee dashboard: " + error.message);
    }

});


// Load assigned appointments
function loadAssignedAppointments() {

    const appointmentsRef = collection(db, "appointments");

    const employeeQuery = query(
        appointmentsRef,
        where("hostId", "==", currentEmployeeId)
    );

    onSnapshot(employeeQuery, (snapshot) => {

        let pending = 0;
        let approved = 0;
        let rejected = 0;

        appointmentsList.innerHTML = "";

        if (snapshot.empty) {

            appointmentsList.innerHTML = `
                <div class="empty-state">
                    No appointments assigned to you yet.
                </div>
            `;

        }

        snapshot.forEach((appointmentDoc) => {

            const appointment = appointmentDoc.data();

            if (appointment.status === "pending") pending++;
            if (appointment.status === "approved") approved++;
            if (appointment.status === "rejected") rejected++;

            const card = document.createElement("div");
            card.className = "appointment-card";

            card.innerHTML = `
                <h3>${escapeHTML(appointment.visitorName || "Visitor")}</h3>

                <p><strong>Email:</strong>
                    ${escapeHTML(appointment.visitorEmail || "")}
                </p>

                <p><strong>Purpose:</strong>
                    ${escapeHTML(appointment.purpose || "")}
                </p>

                <p><strong>Visit Date:</strong>
                    ${escapeHTML(appointment.visitDate || "")}
                </p>

                <p><strong>Visit Time:</strong>
                    ${escapeHTML(appointment.visitTime || "")}
                </p>

                <p><strong>Status:</strong>
                    ${escapeHTML(appointment.status || "")}
                </p>

                ${
                    appointment.status === "pending"
                    ? `
                        <button class="approve-btn"
                            data-id="${appointmentDoc.id}">
                            Approve
                        </button>

                        <button class="reject-btn"
                            data-id="${appointmentDoc.id}">
                            Reject
                        </button>
                    `
                    : ""
                }
            `;

            appointmentsList.appendChild(card);

        });

        pendingCount.textContent = pending;
        approvedCount.textContent = approved;
        rejectedCount.textContent = rejected;

    }, (error) => {

        console.error("Appointment listener error:", error);

        appointmentsList.innerHTML =
            "<p>Unable to load appointments. Please check Firestore rules.</p>";

    });

}


// Approve or reject appointment
async function updateAppointment(appointmentId, newStatus) {

    if (!currentEmployeeId) return;

    try {

        const batch = writeBatch(db);

        const appointmentRef = doc(
            db,
            "appointments",
            appointmentId
        );

        const appointmentSnap = await getDoc(appointmentRef);

        if (!appointmentSnap.exists()) {
            alert("Appointment not found.");
            return;
        }

        const appointment = appointmentSnap.data();

        if (appointment.hostId !== currentEmployeeId) {
            alert("This appointment is not assigned to you.");
            return;
        }

        if (appointment.status !== "pending") {
            alert("This appointment has already been processed.");
            return;
        }

        batch.update(appointmentRef, {
            status: newStatus,
            decisionBy: currentEmployeeId,
            decisionAt: serverTimestamp()
        });

        const notificationRef = doc(
            db,
            "notifications",
            appointmentId
        );

        const message =
            newStatus === "approved"
            ? "Your appointment has been approved. Your QR pass is available."
            : "Your appointment has been rejected. Please contact the host.";

        batch.set(notificationRef, {
            visitorId: appointment.visitorId,
            appointmentId: appointmentId,
            status: newStatus,
            message: message,
            isRead: false,
            createdAt: serverTimestamp()
        });

        await batch.commit();

        alert(
            newStatus === "approved"
            ? "Appointment approved successfully."
            : "Appointment rejected successfully."
        );

    } catch (error) {

        console.error("Appointment update error:", error);

        alert("Unable to update appointment: " + error.message);

    }

}


// Button click handling
appointmentsList.addEventListener("click", (event) => {

    const approveButton = event.target.closest(".approve-btn");
    const rejectButton = event.target.closest(".reject-btn");

    if (approveButton) {
        updateAppointment(
            approveButton.dataset.id,
            "approved"
        );
    }

    if (rejectButton) {
        updateAppointment(
            rejectButton.dataset.id,
            "rejected"
        );
    }

});


// Prevent HTML injection in displayed data
function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, (character) => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];

    });

}
