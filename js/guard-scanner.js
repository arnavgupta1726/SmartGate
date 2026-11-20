
import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    query,
    where,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// HTML elements
const scanMessage = document.getElementById("scanMessage");
const scanHistory = document.getElementById("scanHistory");
const manualQrInput = document.getElementById("manualQrInput");

const totalScans = document.getElementById("totalScans");
const entryCount = document.getElementById("entryCount");
const exitCount = document.getElementById("exitCount");

const logoutButton = document.getElementById("logoutButton");
const manualScanButton = document.getElementById("manualScanButton");

const startCameraButton = document.getElementById("startCameraButton");
const stopCameraButton = document.getElementById("stopCameraButton");

const visitorDetails = document.getElementById("visitorDetails");
const visitorName = document.getElementById("visitorName");
const visitorEmail = document.getElementById("visitorEmail");
const visitorPurpose = document.getElementById("visitorPurpose");
const visitorDate = document.getElementById("visitorDate");
const visitorPassId = document.getElementById("visitorPassId");
const visitorGateStatus = document.getElementById("visitorGateStatus");

const entryButton = document.getElementById("entryButton");
const exitButton = document.getElementById("exitButton");

let currentGuard = null;
let scanner = null;
let cameraRunning = false;
let unsubscribeHistory = null;
let scanInProgress = false;
let selectedAppointment = null;
let lastScannedText = "";
let lastScannedTime = 0;

// Show messages
function showMessage(message, color = "#334155") {
    scanMessage.textContent = message;
    scanMessage.style.color = color;
}

// Read QR text
function getAppointmentId(qrText) {
    const parts = qrText.trim().split("|");

    if (
        parts.length !== 3 ||
        parts[0] !== "SMARTGATE" ||
        parts[1] !== "PASS" ||
        !parts[2]
    ) {
        throw new Error("Invalid SmartGate QR code.");
    }

    return parts[2].trim();
}

// Update action buttons according to appointment status
function updateActionButtons(appointment) {
    const entryStatus = appointment.entryStatus || "not_entered";
    const exitStatus = appointment.exitStatus || "not_exited";

    visitorGateStatus.textContent =
        exitStatus === "exited"
            ? "Exited"
            : entryStatus === "entered"
                ? "Entered"
                : "Not entered";

    entryButton.disabled =
        entryStatus === "entered" || exitStatus === "exited";

    exitButton.disabled =
        entryStatus !== "entered" || exitStatus === "exited";
}

// Display visitor details
function displayVisitor(appointmentId, appointment) {
    selectedAppointment = {
        id: appointmentId,
        data: appointment
    };

    visitorName.textContent = appointment.visitorName || "Visitor";
    visitorEmail.textContent = appointment.visitorEmail || "Not available";
    visitorPurpose.textContent = appointment.purpose || "Not specified";
    visitorDate.textContent = appointment.visitDate || "Not specified";
    visitorPassId.textContent = appointmentId;

    visitorDetails.hidden = false;

    updateActionButtons(appointment);
}

// Verify pass without recording entry or exit
async function verifyPass(qrText) {
    if (!currentGuard) {
        showMessage("Guard is not logged in.", "#dc2626");
        return;
    }

    if (scanInProgress) return;

    scanInProgress = true;

    try {
        const appointmentId = getAppointmentId(qrText);

        showMessage("Checking visitor pass...", "#2563eb");

        const appointmentRef = doc(db, "appointments", appointmentId);
        const appointmentSnapshot = await getDoc(appointmentRef);

        if (!appointmentSnapshot.exists()) {
            throw new Error("Visitor appointment not found.");
        }

        const appointment = appointmentSnapshot.data();

        if (appointment.status !== "approved") {
            throw new Error(
                "Appointment is not approved. Entry is not allowed."
            );
        }

        displayVisitor(appointmentId, appointment);

        showMessage(
            "Pass verified successfully. Select Mark Entry or Mark Exit.",
            "#168653"
        );

    } catch (error) {
        console.error("Pass verification error:", error);
        selectedAppointment = null;
        visitorDetails.hidden = true;
        showMessage(error.message || "Unable to verify pass.", "#dc2626");

    } finally {
        scanInProgress = false;
    }
}

// Record entry or exit only after guard clicks a button
async function recordAction(action) {
    if (!currentGuard || !selectedAppointment) {
        showMessage("Please verify a visitor pass first.", "#dc2626");
        return;
    }

    const appointmentId = selectedAppointment.id;
    const appointmentRef = doc(db, "appointments", appointmentId);
    const scanRef = doc(collection(db, "gateScans"));

    entryButton.disabled = true;
    exitButton.disabled = true;

    try {
        showMessage("Recording " + action.toLowerCase() + "...", "#2563eb");

        const result = await runTransaction(db, async (transaction) => {
            const appointmentSnapshot = await transaction.get(appointmentRef);

            if (!appointmentSnapshot.exists()) {
                throw new Error("Appointment not found.");
            }

            const appointment = appointmentSnapshot.data();

            if (appointment.status !== "approved") {
                throw new Error("This appointment is not approved.");
            }

            const entryStatus = appointment.entryStatus || "not_entered";
            const exitStatus = appointment.exitStatus || "not_exited";

            let recordedAction;

            if (action === "ENTRY") {
                if (entryStatus === "entered" || exitStatus === "exited") {
                    recordedAction = "DUPLICATE_ENTRY";
                } else {
                    recordedAction = "ENTRY";

                    transaction.update(appointmentRef, {
                        entryStatus: "entered",
                        entryAt: serverTimestamp(),
                        lastScannedBy: currentGuard.uid,
                        lastScannedAt: serverTimestamp()
                    });
                }
            } else if (action === "EXIT") {
                if (entryStatus !== "entered") {
                    throw new Error("Record visitor entry before recording exit.");
                }

                if (exitStatus === "exited") {
                    recordedAction = "DUPLICATE_EXIT";
                } else {
                    recordedAction = "EXIT";

                    transaction.update(appointmentRef, {
                        exitStatus: "exited",
                        exitAt: serverTimestamp(),
                        lastScannedBy: currentGuard.uid,
                        lastScannedAt: serverTimestamp()
                    });
                }
            } else {
                throw new Error("Invalid action.");
            }

            transaction.set(scanRef, {
                appointmentId: appointmentId,
                visitorName: appointment.visitorName || "Visitor",
                visitorEmail: appointment.visitorEmail || "",
                action: recordedAction,
                scannedBy: currentGuard.uid,
                scannedAt: serverTimestamp()
            });

            return {
                action: recordedAction,
                appointment: {
                    ...appointment,
                    ...(recordedAction === "ENTRY"
                        ? { entryStatus: "entered" }
                        : {}),
                    ...(recordedAction === "EXIT"
                        ? { exitStatus: "exited" }
                        : {})
                }
            };
        });

        selectedAppointment.data = result.appointment;
        updateActionButtons(result.appointment);

        if (result.action === "ENTRY") {
            showMessage("ENTRY RECORDED SUCCESSFULLY.", "#168653");
        } else if (result.action === "EXIT") {
            showMessage("EXIT RECORDED SUCCESSFULLY.", "#2563eb");
        } else {
            showMessage(
                "DUPLICATE " + action + "! This action was already recorded.",
                "#dc2626"
            );
        }

    } catch (error) {
        console.error("Entry/Exit error:", error);

        showMessage(
            error.message || "Unable to record this action.",
            "#dc2626"
        );

        // Re-enable buttons based on the last known appointment state
        if (selectedAppointment) {
            updateActionButtons(selectedAppointment.data);
        }
    }
}

// Camera start
async function startScanner() {
    if (cameraRunning) return;

    if (typeof Html5Qrcode === "undefined") {
        showMessage(
            "QR scanner library did not load. Check your internet connection.",
            "#dc2626"
        );
        return;
    }

    try {
        showMessage("Starting camera. Please wait...", "#2563eb");

        scanner = new Html5Qrcode("reader");

        const cameras = await Html5Qrcode.getCameras();

        if (!cameras || cameras.length === 0) {
            throw new Error("No camera found on this device.");
        }

        await scanner.start(
            cameras[0].id,
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                const now = Date.now();

                if (
                    decodedText === lastScannedText &&
                    now - lastScannedTime < 5000
                ) {
                    return;
                }

                lastScannedText = decodedText;
                lastScannedTime = now;

                verifyPass(decodedText);
            },
            () => {
                // Ignore normal QR reading errors.
            }
        );

        cameraRunning = true;
        startCameraButton.disabled = true;
        stopCameraButton.disabled = false;

        showMessage("Camera started. Point it at a visitor QR pass.");

    } catch (error) {
        console.error("Camera error:", error);

        showMessage(
            "Camera could not start: " +
            (error.message || "Please check camera permission."),
            "#dc2626"
        );

        if (scanner) {
            try {
                await scanner.clear();
            } catch (clearError) {
                console.log(clearError);
            }
            scanner = null;
        }
    }
}

// Camera stop
async function stopScanner() {
    if (!scanner || !cameraRunning) return;

    try {
        await scanner.stop();
        await scanner.clear();

        cameraRunning = false;
        scanner = null;

        startCameraButton.disabled = false;
        stopCameraButton.disabled = true;

        showMessage("Camera stopped.");

    } catch (error) {
        console.error("Camera stop error:", error);
        showMessage("Unable to stop camera. Refresh the page if needed.", "#dc2626");
    }
}

// Manual pass verification
manualScanButton.addEventListener("click", async () => {
    const qrText = manualQrInput.value.trim();

    if (!qrText) {
        showMessage("Please enter the complete QR code text.", "#dc2626");
        return;
    }

    await verifyPass(qrText);
});

// Button events
startCameraButton.addEventListener("click", startScanner);
stopCameraButton.addEventListener("click", stopScanner);

entryButton.addEventListener("click", () => {
    recordAction("ENTRY");
});

exitButton.addEventListener("click", () => {
    recordAction("EXIT");
});

// Load scan history
function loadScanHistory(guardUid) {
    const historyQuery = query(
        collection(db, "gateScans"),
        where("scannedBy", "==", guardUid)
    );

    unsubscribeHistory = onSnapshot(
        historyQuery,
        (snapshot) => {
            const scans = [];

            snapshot.forEach((item) => {
                scans.push({
                    id: item.id,
                    ...item.data()
                });
            });

            scans.sort((a, b) => {
                return (b.scannedAt?.seconds || 0) -
                       (a.scannedAt?.seconds || 0);
            });

            totalScans.textContent = scans.length;

            entryCount.textContent =
                scans.filter(item => item.action === "ENTRY").length;

            exitCount.textContent =
                scans.filter(item => item.action === "EXIT").length;

            scanHistory.innerHTML = "";

            if (scans.length === 0) {
                scanHistory.innerHTML =
                    '<div class="empty">No scan records available yet.</div>';
                return;
            }

            scans.slice(0, 30).forEach((item) => {
                const card = document.createElement("div");
                card.className = "scan-item";

                const name = document.createElement("h3");
                name.textContent = item.visitorName || "Visitor";

                const actionText = document.createElement("p");
                actionText.textContent = "Action: " + item.action;

                if (item.action === "ENTRY") {
                    actionText.className = "entry";
                } else if (item.action === "EXIT") {
                    actionText.className = "exit";
                } else {
                    actionText.className = "duplicate";
                }

                const pass = document.createElement("p");
                pass.textContent = "Pass ID: " + item.appointmentId;

                const time = document.createElement("p");

                if (item.scannedAt?.toDate) {
                    time.textContent =
                        "Scanned: " + item.scannedAt.toDate().toLocaleString();
                } else {
                    time.textContent = "Scanned: Saving...";
                }

                card.append(name, actionText, pass, time);
                scanHistory.appendChild(card);
            });
        },
        (error) => {
            console.error("History error:", error);
            scanHistory.textContent =
                "Unable to load scan history. Check Firestore rules.";
        }
    );
}

// Check guard login and role
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {
        const profileSnapshot = await getDoc(
            doc(db, "users", user.uid)
        );

        if (
            !profileSnapshot.exists() ||
            profileSnapshot.data().role !== "guard" ||
            profileSnapshot.data().active !== true
        ) {
            alert("Access denied. Guard account required.");
            await signOut(auth);
            window.location.href = "../login.html";
            return;
        }

        currentGuard = user;
        loadScanHistory(user.uid);

        showMessage("Guard verified. Start the camera or enter a pass manually.");

    } catch (error) {
        console.error("Guard authentication error:", error);

        showMessage(
            "Could not verify guard account. Check Firestore permissions.",
            "#dc2626"
        );
    }
});

// Logout
logoutButton.addEventListener("click", async () => {
    try {
        if (unsubscribeHistory) {
            unsubscribeHistory();
        }

        if (scanner && cameraRunning) {
            await stopScanner();
        }

        await signOut(auth);
        window.location.href = "../login.html";

    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to logout. Please try again.");
    }
});
