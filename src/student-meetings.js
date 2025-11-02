// --- Firebase and EmailJS Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE", // Your actual API key
    authDomain: "mmu-cas.firebaseapp.com",
    projectId: "mmu-cas",
    storageBucket: "mmu-cas.appspot.com",
    messagingSenderId: "814309169546",
    appId: "1:814309169546:web:dc514a74b6d07675145073",
    measurementId: "G-YHFGZ85W8H"
};
const emailjsConfig = {
    publicKey: "_G7jjBj34V12n_BnL",
    serviceId: "service_osgdwmr",
    newRequestTemplateId: "template_7l3255g"
};

// --- Initialize Firebase & EmailJS ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    if (emailjsConfig.publicKey && emailjsConfig.serviceId) {
        emailjs.init({ publicKey: emailjsConfig.publicKey });
    }
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- Global Constants ---
const ALL_TIME_SLOTS = [];
for (let h = 9; h <= 16; h++) {
    ALL_TIME_SLOTS.push(`${h.toString().padStart(2, '0')}:00`, `${h.toString().padStart(2, '0')}:30`);
}
ALL_TIME_SLOTS.push('17:00');
const WEEK_DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// --- DOM Element References ---
let DOM = {};

// --- Application State ---
let AppData = {
    currentUser: null,
    counselorsList: [],
    allCounselorAvailabilities: {}, // NEW: Cache for all counselor availabilities
    isSubmitting: false,
    selectedSlotData: null // NEW: To hold data for the modal
};

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Cache all DOM elements
    DOM.dateSelect = document.getElementById('appointment-date');
    DOM.counselorFilter = document.getElementById('counselor-filter');
    DOM.slotContainer = document.getElementById('unifiedSlotContainer');
    DOM.appointmentsContainer = document.getElementById('appointmentsContainer');
    DOM.refreshAppointmentsBtn = document.getElementById('refreshAppointmentsBtn');

    // Modal elements
    DOM.bookingModal = document.getElementById('bookingModal');
    DOM.modalTimeDate = document.getElementById('modal-time-date');
    DOM.modalReason = document.getElementById('modal-reason');
    DOM.modalConfirmBtn = document.getElementById('modal-confirm-btn');
    DOM.modalCancelBtn = document.getElementById('modal-cancel-btn');
    
    initializeApp();
});

async function initializeApp() {
    auth.onAuthStateChanged(async (user) => {
        if (user && user.emailVerified) {
            const userDoc = await db.collection("users").doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'student') {
                AppData.currentUser = { uid: user.uid, email: user.email, ...userDoc.data() };
                console.log("Student user authenticated:", AppData.currentUser.username);
                setupPage();
            } else {
                alert("Access denied. This page is for verified students only.");
                window.location.href = 'login-page.html';
            }
        } else {
            alert("Please log in with a verified student account.");
            window.location.href = 'login-page.html';
        }
    });
}

function setupPage() {
    // Set default date to today
    DOM.dateSelect.value = new Date().toISOString().split('T')[0];
    DOM.dateSelect.min = new Date().toISOString().split('T')[0];

    setupEventListeners();
    loadInitialData(); // Load counselors, their availability, and then render slots
    loadStudentAppointments(); // Load the student's personal appointments
}

function setupEventListeners() {
    DOM.dateSelect.addEventListener('change', renderUnifiedTimeSlots);
    DOM.counselorFilter.addEventListener('change', renderUnifiedTimeSlots);
    DOM.refreshAppointmentsBtn.addEventListener('click', loadStudentAppointments);

    // Modal listeners
    DOM.modalCancelBtn.addEventListener('click', () => DOM.bookingModal.style.display = 'none');
    DOM.modalConfirmBtn.addEventListener('click', handleConfirmBooking);
}

// Fetches counselor data and their full availability schedules
async function loadInitialData() {
    DOM.slotContainer.innerHTML = `<div class="loading-message">Loading counselors...</div>`;

    // Fetch all users with role 'counselor'
    const counselorsSnapshot = await db.collection('users').where('role', '==', 'counselor').get();
    AppData.counselorsList = counselorsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

    // Fetch availability for each counselor
    const availabilityPromises = AppData.counselorsList.map(c => 
        db.collection('counselorAvailabilities').doc(c.uid).get()
    );
    const availabilityDocs = await Promise.all(availabilityPromises);

    availabilityDocs.forEach((doc, index) => {
        if (doc.exists) {
            const counselorUid = AppData.counselorsList[index].uid;
            AppData.allCounselorAvailabilities[counselorUid] = doc.data();
        }
    });

    // Populate counselor filter dropdown
    DOM.counselorFilter.innerHTML = `<option value="any">-- Any Available Counselor --</option>`;
    AppData.counselorsList.forEach(counselor => {
        // Only add counselor to dropdown if they have an availability schedule
        if (AppData.allCounselorAvailabilities[counselor.uid]) {
            const option = document.createElement('option');
            option.value = counselor.uid;
            option.textContent = counselor.fullName || counselor.username;
            DOM.counselorFilter.appendChild(option);
        }
    });

    // Initial render
    await renderUnifiedTimeSlots();
}


/**
 * The CORE function. Renders the unified time slot grid based on selected date and counselor filter.
 */
async function renderUnifiedTimeSlots() {
    DOM.slotContainer.innerHTML = `<div class="loading-message">Checking availability...</div>`;

    const selectedDate = DOM.dateSelect.value;
    const filterCounselorUid = DOM.counselorFilter.value;

    // Get all appointments for the selected day to minimize reads
    const appointmentsSnapshot = await db.collection('appointments')
        .where('date', '==', selectedDate)
        .where('status', 'in', ['Pending', 'Approved'])
        .get();
    
    const bookedSlots = {}; // { "10:00": ["uid1", "uid2"], "10:30": ["uid1"] }
    appointmentsSnapshot.forEach(doc => {
        const appt = doc.data();
        if (!bookedSlots[appt.time]) {
            bookedSlots[appt.time] = [];
        }
        bookedSlots[appt.time].push(appt.counselorUid);
    });

    // Determine which counselors to check
    const targetCounselors = filterCounselorUid === 'any'
        ? AppData.counselorsList
        : AppData.counselorsList.filter(c => c.uid === filterCounselorUid);

    let hasAvailableSlots = false;
    DOM.slotContainer.innerHTML = ''; // Clear loading message

    ALL_TIME_SLOTS.forEach(time => {
        const availableCounselors = [];
        targetCounselors.forEach(counselor => {
            const isBooked = bookedSlots[time]?.includes(counselor.uid);
            if (!isBooked && isCounselorFree(counselor.uid, selectedDate, time)) {
                availableCounselors.push(counselor);
            }
        });
        
        const slotEl = document.createElement('div');
        slotEl.className = 'unified-slot';

        if (availableCounselors.length > 0) {
            hasAvailableSlots = true;
            slotEl.classList.add('available');
            slotEl.innerHTML = `
                <div class="slot-time">${time}</div>
                <div class="slot-availability">${availableCounselors.length} counselor${availableCounselors.length > 1 ? 's' : ''} available</div>
            `;
            slotEl.onclick = () => {
                AppData.selectedSlotData = { time, date: selectedDate, availableCounselors };
                const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                DOM.modalTimeDate.textContent = `${time} on ${displayDate}`;
                DOM.modalReason.value = '';
                DOM.bookingModal.style.display = 'flex';
                DOM.modalReason.focus();
            };
        } else {
            slotEl.classList.add('unavailable');
            slotEl.innerHTML = `<div class="slot-time">${time}</div>`;
        }
        DOM.slotContainer.appendChild(slotEl);
    });
    
    if (!hasAvailableSlots) {
        DOM.slotContainer.innerHTML = `<div class="no-slots-message">No available slots for the selected criteria. Please try another date or counselor.</div>`;
    }
}

/**

 * @returns {boolean}
 */
function isCounselorFree(counselorUid, dateStr, timeStr) {
  
    const dayIndex = new Date(dateStr + 'T00:00:00').getDay(); // 0 = Sunday, 6 = Saturday
    if (dayIndex === 0 || dayIndex === 6) {
        return false;
    }

    const avail = AppData.allCounselorAvailabilities[counselorUid];
    if (!avail) return false; // no availability doc at all

    const dayName = WEEK_DAY_NAMES[dayIndex];
    const exceptionData = (avail.exceptions && avail.exceptions[dateStr]) || {};

  
    if (exceptionData.emergency) return false;

  
    const isWeeklyBlocked = Array.isArray(avail.weekly?.[dayName]) 
        && avail.weekly[dayName].includes(timeStr);

    // Any daily overrides
    const isDailyBlocked   = Array.isArray(exceptionData.blockedSlots) 
        && exceptionData.blockedSlots.includes(timeStr);
    const isDailyUnblocked = Array.isArray(exceptionData.unblockedSlots) 
        && exceptionData.unblockedSlots.includes(timeStr);

    if (isDailyUnblocked)    return true;
    if (isWeeklyBlocked
     || isDailyBlocked)      return false;


    return true;
}

async function handleConfirmBooking() {
    if (AppData.isSubmitting) return;

    const reason = DOM.modalReason.value.trim();
    if (!reason) {
        alert("Please provide a reason for the appointment.");
        return;
    }

    AppData.isSubmitting = true;
    DOM.modalConfirmBtn.textContent = 'Booking...';
    DOM.modalConfirmBtn.disabled = true;
    
    try {
        const { time, date, availableCounselors } = AppData.selectedSlotData;
        
        // Pick a random counselor from the available list
        const randomCounselor = availableCounselors[Math.floor(Math.random() * availableCounselors.length)];

        await bookAppointmentForCounselor(randomCounselor, date, time, reason);

        alert(`Success! Your appointment has been booked with ${randomCounselor.fullName} on ${date} at ${time}.`);
        
        DOM.bookingModal.style.display = 'none';
        await renderUnifiedTimeSlots(); 
        await loadStudentAppointments(); 

    } catch (error) {
        console.error("Error confirming booking:", error);
        alert("There was an error booking your appointment. The slot may have just been taken. Please try again.");
    } finally {
        AppData.isSubmitting = false;
        DOM.modalConfirmBtn.textContent = 'Confirm Booking';
        DOM.modalConfirmBtn.disabled = false;
    }
}

async function bookAppointmentForCounselor(counselorData, date, time, reason) {
    const newAppointment = {
        studentUid: AppData.currentUser.uid,
        studentUsername: AppData.currentUser.username,
        counselorUid: counselorData.uid,
        counselorUsername: counselorData.fullName,
        date, time, reason,
        status: 'Pending',
        requestedByStudentAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        studentNote: '',
        counselorNote: ''
    };

    await db.collection('appointments').add(newAppointment);

    // Send In-App Notification
    await db.collection('notifications').add({
        userId: counselorData.uid,
        message: `New appointment request from ${AppData.currentUser.username} for ${date} at ${time}.`,
        link: 'counselor-meetings.html',
        read: false,
        type: 'APPOINTMENT_REQUEST',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Send EmailJS Notification
    if (emailjsConfig.newRequestTemplateId && counselorData.email) {
        const templateParams = {
            counselor_name: counselorData.fullName,
            to_email: counselorData.email,
            student_name: AppData.currentUser.username,
            appointment_date: date,
            appointment_time: time,
            reason: reason,
            from_name: "MMU Counseling System"
        };
        // Not waiting for this to finish to speed up UI
        emailjs.send(emailjsConfig.serviceId, emailjsConfig.newRequestTemplateId, templateParams)
            .then(res => console.log('EmailJS success!', res.status))
            .catch(err => console.error('EmailJS failed.', err));
    }
}


// --- Functions for displaying student's own appointments (largely unchanged) ---

async function loadStudentAppointments() {
    if (!AppData.currentUser || !DOM.appointmentsContainer) return;
    DOM.appointmentsContainer.innerHTML = '<p>Loading your appointments...</p>';
    try {
        const querySnapshot = await db.collection('appointments')
            .where('studentUid', '==', AppData.currentUser.uid)
            .orderBy('date', 'desc').orderBy('time', 'desc')
            .get();

        if (querySnapshot.empty) {
            DOM.appointmentsContainer.innerHTML = '<h3>Your Appointments</h3><p>You have no appointments booked yet.</p>';
            return;
        }

        DOM.appointmentsContainer.innerHTML = '';
        const upcoming = [], past = [];
        const now = new Date();

        querySnapshot.forEach(doc => {
            const app = { id: doc.id, ...doc.data() };
            const appDateTime = new Date(`${app.date}T${app.time}`);
            const isConcluded = ['Completed', 'Cancelled', 'Rejected'].includes(app.status);
            if (isConcluded || appDateTime < now) {
                past.push(app);
            } else {
                upcoming.push(app);
            }
        });
        
        // Upcoming Appointments
        const upcomingHeader = document.createElement('h3');
        upcomingHeader.textContent = 'Upcoming Appointments';
        DOM.appointmentsContainer.appendChild(upcomingHeader);
        if (upcoming.length === 0) {
            DOM.appointmentsContainer.innerHTML += '<p>You have no upcoming appointments.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'appointment-list';
            upcoming.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
            upcoming.forEach(app => ul.appendChild(createAppointmentListItem(app, false)));
            DOM.appointmentsContainer.appendChild(ul);
        }

        // Past Appointments
        const pastHeader = document.createElement('h3');
        pastHeader.textContent = 'Past Appointments';
        DOM.appointmentsContainer.appendChild(pastHeader);
        if (past.length === 0) {
            DOM.appointmentsContainer.innerHTML += '<p>You have no past appointment records.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'appointment-list';
            past.forEach(app => ul.appendChild(createAppointmentListItem(app, true)));
            DOM.appointmentsContainer.appendChild(ul);
        }
    } catch (error) {
        console.error("Error loading student appointments:", error);
        DOM.appointmentsContainer.innerHTML = '<p style="color: red;">Error loading your appointments.</p>';
    }
}

function createAppointmentListItem(appointment, showDeleteBtn) {
    const li = document.createElement('li');
    li.className = `appointment-item status-${appointment.status ? appointment.status.toLowerCase().replace(/\s+/g, '-') : 'unknown'}`;
    const apptDateObj = new Date(`${appointment.date}T${appointment.time}:00`);
    const displayDate = !isNaN(apptDateObj) ? apptDateObj.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : appointment.date;
    const displayTime = !isNaN(apptDateObj) ? apptDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}) : appointment.time;
    
    const deleteButtonHTML = showDeleteBtn ? `<button class="delete-btn" onclick="deleteAppointment('${appointment.id}')">Delete Record</button>` : '';

    li.innerHTML = `
        <div class="appointment-details">
            <p><strong>Counselor:</strong> ${appointment.counselorUsername || 'N/A'}</p>
            <p><strong>Date:</strong> ${displayDate} at ${displayTime}</p>
            <p><strong>Reason:</strong> ${appointment.reason || 'N/A'}</p>
            <p><strong>Status:</strong> <span class="status-text">${appointment.status || 'N/A'}</span></p>
            ${appointment.counselorNote ? `<p><strong>Counselor Note:</strong> ${appointment.counselorNote}</p>` : ''}
        </div>
        <div class="appointment-actions">${deleteButtonHTML}</div>`;
    return li;
}

async function deleteAppointment(appointmentId) {
    if (confirm("Are you sure you want to permanently delete this past appointment record?")) {
        try {
            await db.collection('appointments').doc(appointmentId).delete();
            await loadStudentAppointments(); 
        } catch (error) {
            console.error("Error deleting appointment:", error);
            alert("Failed to delete the appointment record.");
        }
    }
}
window.deleteAppointment = deleteAppointment; // Make accessible to onclick