// --- Firebase Configuration ---
 const firebaseConfig = {
     apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE", // Your actual API key
     authDomain: "mmu-cas.firebaseapp.com",
     projectId: "mmu-cas",
     storageBucket: "mmu-cas.appspot.com",
     messagingSenderId: "814309169546",
     appId: "1:814309169546:web:dc514a74b6d07675145073",
     measurementId: "G-YHFGZ85W8H"
 };

// --- NEW: EmailJS Configuration ---
const emailjsConfig = {
    publicKey: "_G7jjBj34V12n_BnL", 
    serviceId: "service_osgdwmr",   
    statusUpdateTemplateId: "template_g24ntdn", 
    rescheduleTemplateId: "template_g24ntdn"      
};

// --- Initialize Firebase ---
 if (!firebase.apps.length) {
     firebase.initializeApp(firebaseConfig);
    // --- NEW: Initialize EmailJS ---
    if (emailjsConfig.publicKey) {
        emailjs.init({ publicKey: emailjsConfig.publicKey });
        console.log("EmailJS SDK Initialized.");
    } else {
        console.warn("EmailJS Public Key is missing. Email notifications will be disabled.");
    }
 }
 const auth = firebase.auth();
 const db = firebase.firestore();
 ;
 let currentCounselorUser = null; // Holds data like { uid, username, role }
 let counselorAvailability = null; // Holds availability data from Firestore
 let counselorAppointments = [];   // Holds appointments from Firestore
 let availabilityDocRef = null;    // Firestore DocumentReference for counselor's availability
 let appointmentsListener = null;  // To unsubscribe from Firestore listener

 const ALL_TIME_SLOTS = [];
 for (let h = 9; h <= 16; h++) {
     ALL_TIME_SLOTS.push(`${h.toString().padStart(2, '0')}:00`, `${h.toString().padStart(2, '0')}:30`);
 }
 ALL_TIME_SLOTS.push('17:00');
 const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

 // --- Main Initialization on DOMContentLoaded ---
 document.addEventListener('DOMContentLoaded', () => {
     auth.onAuthStateChanged(async (user) => {
         if (user) {
             console.log("Counselor Meetings: Auth state changed: User logged in", user.uid);
             try {
                 const userDocRef = db.collection("users").doc(user.uid);
                 const userDoc = await userDocRef.get();

                 if (userDoc.exists) {
                     const firestoreUserData = userDoc.data();
                    
                     // Combine Auth data (for freshest emailVerified) and Firestore data
                     currentCounselorUser = {
                         uid: user.uid,
                         email: user.email, // From auth user
                         emailVerified: user.emailVerified, // Directly from auth user
                         ...firestoreUserData
                     };

                     // Update sessionStorage
                     sessionStorage.setItem('currentUser', JSON.stringify(currentCounselorUser));
                     console.log("Counselor Meetings: Current counselor user (with verification status):", currentCounselorUser);

                     // ***** EMAIL VERIFICATION CHECK *****
                     // ***** END VERIFICATION CHECK *****

                     if (currentCounselorUser.role === 'counselor') {
                         if (document.getElementById('cName')) {
                            document.getElementById('cName').textContent = currentCounselorUser.username || currentCounselorUser.fullName || "Counselor";
                         }
                         availabilityDocRef = db.collection('counselorAvailabilities').doc(currentCounselorUser.uid);
                        
                         await loadCounselorAvailability(); // Assumes this function exists
                         initializePageWithData(); // Assumes this function exists to set up tabs, etc.
                         listenForAppointments();     // Assumes this function exists
                         console.log("Counselor Meetings: App initialized for verified counselor.");
                     } else {
                         console.error("Counselor Meetings: Access Denied: User is not a counselor.");
                         alert('Access denied. You are not authorized to view this page.');
                         window.location.href = 'login-page.html';
                     }
                 } else {
                     console.error("Counselor Meetings: User document not found in Firestore. Logging out.");
                     alert('User data not found. Please contact support.');
                     await auth.signOut();
                      window.location.href = 'login-page.html';
                 }
             } catch (error) {
                 console.error("Counselor Meetings: Error fetching user data:", error);
                 alert('Error loading your data. Please try again.');
                 if (auth.currentUser) await auth.signOut();
                 window.location.href = 'login-page.html';
             }
         } else {
             console.log("Counselor Meetings: User logged out. Redirecting to login.");
             currentCounselorUser = null;
             if (appointmentsListener) appointmentsListener();
             alert('Please login to access this page.');
             window.location.href = 'login-page.html';
         }
     });
 });


 function initializePageWithData() {
     // Setup day tabs event listeners
     document.querySelectorAll('.day-tab').forEach(tab => {
         tab.addEventListener('click', () => {
             document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
             tab.classList.add('active');
             renderWeeklySlots(tab.dataset.day);
         });
     });
     // Activate Monday by default if no tab is active
     if (!document.querySelector('.day-tab.active')) {
         const mondayTab = document.querySelector('.day-tab[data-day="monday"]');
         if (mondayTab) mondayTab.classList.add('active');
     }
     renderWeeklySlots(document.querySelector('.day-tab.active')?.dataset.day || 'monday');

     // Setup daily availability date picker and buttons
     const availDateInput = document.getElementById('availDate');
     const emergencyToggle = document.getElementById('emergencyToggle');
     const saveDailyAvailBtn = document.getElementById('saveDailyAvail');
     const saveEmergencyBlockBtn = document.getElementById('saveEmergencyBlockBtn');
     if (saveEmergencyBlockBtn) {
         saveEmergencyBlockBtn.onclick = saveEmergencyDayBlock;
     }
     if(emergencyToggle) {
         emergencyToggle.onchange = () => handleAvailDateChange(document.getElementById('availDate').value);
     }
     const today = new Date();
     const initialDateStr = today.toISOString().slice(0, 10);
     availDateInput.value = initialDateStr;
     availDateInput.min = initialDateStr; // Prevent selecting past dates

     handleAvailDateChange(initialDateStr); // Process initial date for daily adjustments
     availDateInput.addEventListener('change', (e) => handleAvailDateChange(e.target.value));
     emergencyToggle.onchange = function() {
         handleAvailDateChange(availDateInput.value); // Re-render slots based on new emergency mode
     };
     saveDailyAvailBtn.onclick = saveDailyAvailability;
     document.getElementById('saveWeeklyAvail').onclick = saveWeeklyAvailability;

     // Reschedule form buttons
     document.getElementById('saveReschedule').onclick = saveRescheduledAppointment;
     document.getElementById('cancelReschedule').onclick = () => {
         rescheduleAppointmentId = null;
         document.getElementById('rescheduleForm').style.display = 'none';
     };
 }


async function loadCounselorAvailability() {
    if (!availabilityDocRef) return console.error("availabilityDocRef not set.");
    try {
        const docSnap = await availabilityDocRef.get();
        if (docSnap.exists) {
            counselorAvailability = docSnap.data();
        } else {
            console.log("No availability document found, creating default (all slots blocked).");
            counselorAvailability = {
                uid: currentCounselorUser.uid,
                username: currentCounselorUser.username,
                weekly: {
                    monday: [...ALL_TIME_SLOTS],
                    tuesday: [...ALL_TIME_SLOTS],
                    wednesday: [...ALL_TIME_SLOTS],
                    thursday: [...ALL_TIME_SLOTS],
                    friday: [...ALL_TIME_SLOTS]
                },
                exceptions: {}
            };
            await availabilityDocRef.set(counselorAvailability);
            alert("Welcome! Your schedule is set to 'unavailable' by default. Please un-select the times you are available and click 'Save'.");
        }
    } catch (error) {
        console.error("Error loading counselor availability:", error);
        alert("Could not load availability settings.");
    }

    if (counselorAvailability && !counselorAvailability.weekly) {
        counselorAvailability.weekly = {};
    }
    DAYS.forEach(day => {
        if (!counselorAvailability.weekly || typeof counselorAvailability.weekly[day] === 'undefined') {
            if (!counselorAvailability.weekly) counselorAvailability.weekly = {};
            counselorAvailability.weekly[day] = [...ALL_TIME_SLOTS];
        }
    });
}


 function renderWeeklySlots(day) {
     if (!counselorAvailability || !day) {
         console.warn("Cannot render weekly slots, availability or day not set.", counselorAvailability, day);
         return;
     }
     const weeklySlotsDiv = document.getElementById('weeklySlots');
     weeklySlotsDiv.innerHTML = '';
     const blocked = counselorAvailability.weekly[day] || [];
     ALL_TIME_SLOTS.forEach(slot => {
         const el = document.createElement('div');
         el.textContent = slot;
         el.className = 'slot' + (blocked.includes(slot) ? ' blocked' : '');
         el.onclick = () => el.classList.toggle('blocked');
         weeklySlotsDiv.appendChild(el);
     });
 }

 async function saveWeeklyAvailability() {

     if (!currentCounselorUser || !counselorAvailability || !availabilityDocRef) return;
     const activeDayElement = document.querySelector('.day-tab.active');
     if (!activeDayElement) {
         alert("No day selected to save availability for.");
         return;
     }
     const activeDay = activeDayElement.dataset.day;
     const blockedSlots = Array.from(document.getElementById('weeklySlots').children)
         .filter(c => c.classList.contains('blocked'))
         .map(c => c.textContent);

     counselorAvailability.weekly[activeDay] = blockedSlots;

     try {
         await availabilityDocRef.update({
             [`weekly.${activeDay}`]: blockedSlots // Update specific day using dot notation
         });
         alert(`Weekly availability saved for ${activeDay.charAt(0).toUpperCase() + activeDay.slice(1)}`);
         // No need to call renderPending/renderSchedule here unless availability affects them directly
     } catch (error) {
         console.error("Error saving weekly availability:", error);
         alert("Failed to save weekly availability.");
     }
 }

 function renderDailySlots(dateStr) { // dateStr is YYYY-MM-DD and a weekday
     if (!counselorAvailability || !dateStr) {
         console.warn("Cannot render daily slots, availability or dateStr not set.", counselorAvailability, dateStr);
         return;
     }
     const allSlotsDiv = document.getElementById('allSlots');
     allSlotsDiv.innerHTML = '';
     const dateObj = new Date(dateStr + 'T00:00:00'); // Ensure local interpretation
     const dayOfWeekJS = dateObj.getDay(); // 1 for Mon, ..., 5 for Fri
     if (dayOfWeekJS === 0 || dayOfWeekJS === 6) return; // Should be caught by handleAvailDateChange
     const dayName = DAYS[dayOfWeekJS - 1];
    
     const weeklyBlocked = counselorAvailability.weekly[dayName] || [];
     const exceptionData = counselorAvailability.exceptions[dateStr] || { blockedSlots: [], emergency: false };
     const exceptionBlockedSlots = exceptionData.blockedSlots || [];
     const isEmergency = exceptionData.emergency || false;
    
     document.getElementById('emergencyToggle').checked = isEmergency;
    
     ALL_TIME_SLOTS.forEach(slot => {
         const el = document.createElement('div');
         el.textContent = slot;
         if (isEmergency) {
             el.className = 'slot' + (exceptionBlockedSlots.includes(slot) ? ' emergency-block' : '');
         } else {
             const isBlockedByWeekly = weeklyBlocked.includes(slot);
             const isSpecificallyUnblockedByException = exceptionData.unblockedSlots && exceptionData.unblockedSlots.includes(slot);
             const isSpecificallyBlockedByException = exceptionBlockedSlots.includes(slot);

             let finalBlocked = false;
             if (isSpecificallyUnblockedByException) {
                 finalBlocked = false;
             } else if (isSpecificallyBlockedByException) {
                 finalBlocked = true;
             } else {
                 finalBlocked = isBlockedByWeekly;
             }
             el.className = 'slot' + (finalBlocked ? ' blocked' : '');
         }
         el.onclick = () => {
             if (document.getElementById('emergencyToggle').checked) {
                 el.classList.toggle('emergency-block');
                 if(el.classList.contains('emergency-block')) el.classList.remove('blocked');
             } else {
                 el.classList.toggle('blocked');
                 if(el.classList.contains('blocked')) el.classList.remove('emergency-block');
             }
         };
         allSlotsDiv.appendChild(el);
     });
 }
    
 function handleAvailDateChange(dateStr) {
     const allSlotsDiv = document.getElementById('allSlots');
     const emergencyToggle = document.getElementById('emergencyToggle');
     const saveDailyAvailBtn = document.getElementById('saveDailyAvail');
     const resetDailyAvailBtn = document.getElementById('resetDailyAvail');
     const emergencyBlockContainer = document.getElementById('emergencyBlockContainer');

     if (!dateStr) {
         allSlotsDiv.innerHTML = '<p style="text-align:center;">Please select a date.</p>';
         emergencyToggle.checked = false;
         emergencyToggle.disabled = true;
         saveDailyAvailBtn.disabled = true;
         return;
     }
     const selectedDate = new Date(dateStr + 'T00:00:00'); // Ensure local interpretation
     const dayOfWeekJS = selectedDate.getDay();

     if (dayOfWeekJS === 0 || dayOfWeekJS === 6) { // Sunday or Saturday
         allSlotsDiv.innerHTML = '<p style="color: red; text-align:center;">Weekend adjustments are not supported. Please select a weekday.</p>';
         emergencyToggle.checked = false;
         emergencyToggle.disabled = true;
         saveDailyAvailBtn.disabled = true;
         if (emergencyBlockContainer) emergencyBlockContainer.style.display = 'none';
         return;
     } else {
         allSlotsDiv.innerHTML = '';
         emergencyToggle.disabled = false;
         saveDailyAvailBtn.disabled = false;
         renderDailySlots(dateStr);
     }
      if (emergencyToggle.checked) {
         // In emergency mode: Hide the slot-by-slot view and regular save button
         allSlotsDiv.style.display = 'none';
         saveDailyAvailBtn.style.display = 'none';
         // Show the emergency block container and its button
         if (emergencyBlockContainer) emergencyBlockContainer.style.display = 'block';
     } else {
         // In normal adjustment mode: Show the slot-by-slot view and regular save button
         allSlotsDiv.style.display = 'grid'; // Or 'flex', whatever your CSS uses
         saveDailyAvailBtn.style.display = 'inline-block';
         // Hide the emergency block container
         if (emergencyBlockContainer) emergencyBlockContainer.style.display = 'none';
        
         // Render the slots for manual adjustment
         renderDailySlots(dateStr);
     }
     // Enable the reset button whenever a weekday is selecteddocSnap.exists
     if(resetDailyAvailBtn) resetDailyAvailBtn.disabled = false;
 }
 async function saveEmergencyDayBlock() {
     if (!currentCounselorUser || !availabilityDocRef) return;
     const dateStr = document.getElementById('availDate').value;
     if (!dateStr) return alert('Please select a date first.');
    
     if (!confirm(`Are you sure you want to block the entire day for ${dateStr} due to an emergency? This will make you unavailable for any new bookings on this day.`)) {
         return;
     }

     const newExceptionEntry = {
         emergency: true,
         note: "Unavailable due to emergency", // Optional note
         blockedSlots: ALL_TIME_SLOTS // Block all slots to be explicit
     };
    
     // Update local cache and Firestore
     if (!counselorAvailability.exceptions) counselorAvailability.exceptions = {};
     counselorAvailability.exceptions[dateStr] = newExceptionEntry;
    
     try {
         await availabilityDocRef.update({
             [`exceptions.${dateStr}`]: newExceptionEntry
         });
         alert(`The entire day (${dateStr}) has been blocked for an emergency.`);
     } catch (error) {
         console.error("Error saving emergency block:", error);
         alert("Failed to save the emergency block.");
     }
 }

 async function saveDailyAvailability() {
     if (!currentCounselorUser || !counselorAvailability || !availabilityDocRef) return;
     const dateStr = document.getElementById('availDate').value;
     if (!dateStr) return alert('Please select a date to save changes for.');
    
     const selectedDate = new Date(dateStr + 'T00:00:00');
     const dayOfWeekJS = selectedDate.getDay();
     if (dayOfWeekJS === 0 || dayOfWeekJS === 6) {
         alert('Cannot save changes for a weekend. Please select a weekday.');
         return;
     }
    
     const isEmergency = document.getElementById('emergencyToggle').checked;
     const clickedSlots = Array.from(document.getElementById('allSlots').children)
         .filter(c => c.classList.contains('slot'));
    
     let newBlockedSlots = [];
     let newUnblockedSlots = []; // For non-emergency, to explicitly unblock a weekly blocked slot

     const dayName = DAYS[dayOfWeekJS - 1];
     const weeklyBlocked = counselorAvailability.weekly[dayName] || [];

     if (isEmergency) {
         newBlockedSlots = clickedSlots
             .filter(c => c.classList.contains('emergency-block'))
             .map(c => c.textContent);
     } else {
         clickedSlots.forEach(slotElement => {
             const slotTime = slotElement.textContent;
             const isVisuallyBlocked = slotElement.classList.contains('blocked'); // Current visual state
             const isWeeklyBlocked = weeklyBlocked.includes(slotTime);

             if (isVisuallyBlocked && !isWeeklyBlocked) { // Blocked, but not part of weekly block -> exception block
                 newBlockedSlots.push(slotTime);
             } else if (!isVisuallyBlocked && isWeeklyBlocked) { // Not blocked, but part of weekly block -> exception unblock
                 newUnblockedSlots.push(slotTime);
             }
             // If visually blocked AND weekly blocked, it's covered by weekly, no exception needed unless unblocked.
             // If visually not blocked AND not weekly blocked, it's available, no exception needed.
         });
     }
    
     const newExceptionEntry = {
         blockedSlots: newBlockedSlots,
         emergency: isEmergency
     };
     if (!isEmergency && newUnblockedSlots.length > 0) {
         newExceptionEntry.unblockedSlots = newUnblockedSlots;
     }

     // If no specific blocks/unblocks for this date and not emergency, remove the exception
     if (newBlockedSlots.length === 0 && (!newUnblockedSlots || newUnblockedSlots.length === 0) && !isEmergency) {
         delete counselorAvailability.exceptions[dateStr]; // Remove from local cache
         try {
             await availabilityDocRef.update({
                 [`exceptions.${dateStr}`]: firebase.firestore.FieldValue.delete()
             });
             alert(`Daily changes cleared for ${dateStr} (reverted to weekly schedule).`);
         } catch (error) {
             console.error("Error clearing daily exception:", error);
             alert("Failed to clear daily changes.");
             return; // Don't proceed if delete fails
         }
     } else {
         counselorAvailability.exceptions[dateStr] = newExceptionEntry; // Update local cache
         try {
             await availabilityDocRef.update({
                 [`exceptions.${dateStr}`]: newExceptionEntry
             });
             alert(`Daily changes saved for ${dateStr}`);
         } catch (error) {
             console.error("Error saving daily availability:", error);
             alert("Failed to save daily changes.");
             // Revert local cache if save fails? Or let next load handle it.
             return;
         }
     }
     // renderPending and renderSchedule might be needed if availability changes affect them.
     // For now, assuming they are mainly driven by the appointments data itself.
 }

 function listenForAppointments() {
     if (!currentCounselorUser) return;
     console.log("Setting up listener for appointments for counselor:", currentCounselorUser.uid);

     if (appointmentsListener) appointmentsListener(); // Unsubscribe from previous listener

     appointmentsListener = db.collection('appointments')
         .where('counselorUid', '==', currentCounselorUser.uid)
         // .orderBy('createdAt', 'desc') // Or sort by appointment date/time
         .onSnapshot(querySnapshot => {
             counselorAppointments = [];
             querySnapshot.forEach(doc => {
                 counselorAppointments.push({ id: doc.id, ...doc.data() });
             });
             console.log("Appointments updated:", counselorAppointments.length, "appointments found.");
             renderPendingAppointments();
             renderScheduledAppointments();
         }, error => {
             console.error("Error listening for appointments:", error);
             alert("Could not load appointments in real-time. Please refresh.");
         });
 }

 function renderPendingAppointments() {
     if (!currentCounselorUser) return;
     const container = document.getElementById('pendingList');
     container.innerHTML = '';
     const pending = counselorAppointments.filter(a => a.status === 'Pending')
                         .sort((a,b) => (a.requestedByStudentAt?.toMillis() || 0) - (b.requestedByStudentAt?.toMillis() || 0)); // Show oldest requests first

     if (pending.length === 0) {
         container.innerHTML = '<p>No pending appointment requests.</p>';
         return;
     }
     pending.forEach(a => {
         const card = document.createElement('div');
         card.className = 'request-card';
         const reqDate = a.requestedByStudentAt ? a.requestedByStudentAt.toDate().toLocaleString() : 'N/A';
         card.innerHTML = `
             <p><strong>Requested for: ${a.date} @ ${a.time}</strong></p>
             <p>Student: ${a.studentUsername || 'Unknown'}</p>
             <p>Reason: ${a.reason || 'Not specified'}</p>
             <p>Requested on: ${reqDate} </p>
             <p>Note:</p><textarea id="note-${a.id}" class="note-input">${a.note||''}</textarea>
             <div class="actions">
                 <button class="approve" data-id="${a.id}">Approve</button>
                 <button class="decline" data-id="${a.id}">Decline</button>
                 <button class="reschedule" data-id="${a.id}">Reschedule</button>
             </div>
         `;
         container.appendChild(card);
     });
     container.querySelectorAll('.approve').forEach(b =>
         b.onclick = () => updateAppointmentStatus(b.dataset.id, 'Approved', document.getElementById(`note-${b.dataset.id}`).value));
     container.querySelectorAll('.decline').forEach(b =>
         b.onclick = () => updateAppointmentStatus(b.dataset.id, 'Declined', document.getElementById(`note-${b.dataset.id}`).value));
     container.querySelectorAll('.reschedule').forEach(b =>
         b.onclick = () => openRescheduleModal(b.dataset.id));
 }

// --- MODIFIED FUNCTION ---
async function updateAppointmentStatus(appointmentId, status, note = '') {
    if (!currentCounselorUser) return;
    console.log(`Updating appointment ${appointmentId} to status ${status}`);

    const appointmentRef = db.collection('appointments').doc(appointmentId);

    try {
        // First, get the appointment data to know who the student is
        const appointmentDoc = await appointmentRef.get();
        if (!appointmentDoc.exists) {
            throw new Error("Appointment document not found.");
        }
        const appointmentData = appointmentDoc.data();
        const studentUid = appointmentData.studentUid;

        // Update the appointment itself
        await appointmentRef.update({
            status: status,
            note: note,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`Appointment ${status.toLowerCase()}.`);

        // --- NEW: CREATE FIRESTORE NOTIFICATION & SEND EMAIL NOTIFICATION ---
        if (studentUid) {
            let notifMessage = "";
            let notifType = "";

            if (status === 'Approved') {
                notifMessage = `Your appointment for ${appointmentData.date} at ${appointmentData.time} with ${appointmentData.counselorUsername} has been approved.`;
                notifType = 'APPOINTMENT_APPROVED';
            } else if (status === 'Declined') {
                notifMessage = `Your appointment for ${appointmentData.date} at ${appointmentData.time} with ${appointmentData.counselorUsername} was declined. Note: ${note || 'No reason provided.'}`;
                notifType = 'APPOINTMENT_DECLINED';
            }

            // 1. Create the in-app notification in Firestore (existing logic)
            if (notifMessage) {
                await db.collection('notifications').add({
                    userId: studentUid,
                    message: notifMessage,
                    link: 'student-meetings.html',
                    read: false,
                    type: notifType,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Firestore notification created for student ${studentUid} for status: ${status}`);
            }

            // 2. Send email notification using EmailJS
            if (emailjsConfig.serviceId && emailjsConfig.statusUpdateTemplateId) {
                // We need the student's email. Let's fetch their user document.
                const studentUserDoc = await db.collection('users').doc(studentUid).get();
                if (studentUserDoc.exists && studentUserDoc.data().email) {
                    const studentEmail = studentUserDoc.data().email;
                    const templateParams = {
                        // These parameter names MUST match the variables in your EmailJS template
                        student_name: appointmentData.studentUsername || 'Student',
                        to_email: studentEmail,
                        counselor_name: appointmentData.counselorUsername || 'Your Counselor',
                        appointment_date: appointmentData.date,
                        appointment_time: appointmentData.time,
                        status: status,
                        note: note || 'No additional notes were provided.'
                    };

                    emailjs.send(emailjsConfig.serviceId, emailjsConfig.statusUpdateTemplateId, templateParams)
                        .then((response) => {
                            console.log('SUCCESS! EmailJS email sent.', response.status, response.text);
                        }, (error) => {
                            console.error('FAILED to send EmailJS email.', error);
                        });
                } else {
                    console.warn(`Could not find email for student UID: ${studentUid}. Email not sent.`);
                }
            } else {
                console.warn("EmailJS config is missing. Skipping email notification.");
            }
        }
    } catch (error) {
        console.error("Error updating appointment status:", error);
        alert("Failed to update appointment status.");
    }
}


 let rescheduleAppointmentId = null; // Store ID of appointment being rescheduled

 function openRescheduleModal(appointmentId) {
     if (!counselorAppointments) return;
     const appointment = counselorAppointments.find(a => a.id === appointmentId);
     if (!appointment) {
         alert("Appointment not found for rescheduling.");
         return;
     }
     rescheduleAppointmentId = appointmentId;
     document.getElementById('rescheduleForm').style.display = 'block';
    
     const resDateSelect = document.getElementById('resDate');
     resDateSelect.innerHTML = ''; // Clear previous options
    
     const today = new Date();
     today.setHours(0,0,0,0); // Start from today
    
     let availableDatesForSelect = [];
     for (let i = 0; i < 30; i++) { // Offer dates for the next 30 days
         const date = new Date(today);
         date.setDate(today.getDate() + i);
         const dayOfWeekJS = date.getDay();
         if (dayOfWeekJS === 0 || dayOfWeekJS === 6) continue; // Skip weekends
        
         const dateStr = date.toISOString().split('T')[0];
         availableDatesForSelect.push(dateStr);
     }
    
     resDateSelect.innerHTML = availableDatesForSelect.map(d => `<option value="${d}">${d}</option>`).join('');
     resDateSelect.onchange = populateRescheduleTimes;
    
     if (availableDatesForSelect.length > 0) {
         resDateSelect.value = availableDatesForSelect[0]; // Select first available date
         populateRescheduleTimes(); // Populate times for the first selected date
     } else {
         document.getElementById('resTime').innerHTML = '<option value="">No dates available for reschedule</option>';
     }
 }

 function populateRescheduleTimes() {
     const dateStr = document.getElementById('resDate').value;
     const resTimeSelect = document.getElementById('resTime');
     resTimeSelect.innerHTML = ''; // Clear previous

     if (!dateStr || !counselorAvailability || !currentCounselorUser) {
         resTimeSelect.innerHTML = '<option value="">Select a date first</option>';
         return;
     }
    
     const dateObj = new Date(dateStr + 'T00:00:00');
     const dayOfWeekJS = dateObj.getDay();
     if (dayOfWeekJS === 0 || dayOfWeekJS === 6) { // Should not happen if date select is filtered
          resTimeSelect.innerHTML = '<option value="">Weekends not available</option>';
         return;
     }
     const dayName = DAYS[dayOfWeekJS - 1];
    
     const weeklyBlocked = counselorAvailability.weekly[dayName] || [];
     const exceptionData = counselorAvailability.exceptions[dateStr] || { blockedSlots: [], emergency: false, unblockedSlots: [] };
     const exceptionBlockedSlots = exceptionData.blockedSlots || [];
     const exceptionUnblockedSlots = exceptionData.unblockedSlots || [];
     const isEmergencyDay = exceptionData.emergency || false;
    
     let availableTimes = [...ALL_TIME_SLOTS];
     if (isEmergencyDay) {
         availableTimes = availableTimes.filter(t => !exceptionBlockedSlots.includes(t));
     } else {
         availableTimes = availableTimes.filter(t => {
             const isWeeklyBlocked = weeklyBlocked.includes(t);
             const isSpecificallyUnblocked = exceptionUnblockedSlots.includes(t);
             const isSpecificallyBlocked = exceptionBlockedSlots.includes(t);

             if (isSpecificallyUnblocked) return true; // Available due to exception override
             if (isSpecificallyBlocked) return false; // Blocked due to exception override
             return !isWeeklyBlocked; // Default to weekly availability
         });
     }
    
     // Filter out times already booked by this counselor on this date
     const existingAppointmentsOnDate = counselorAppointments.filter(a =>
         a.counselorUid === currentCounselorUser.uid &&
         a.date === dateStr &&
         (a.status === 'Approved' || (a.status === 'Pending' && a.id !== rescheduleAppointmentId)) // Exclude current one if pending
     );
     availableTimes = availableTimes.filter(t =>
         !existingAppointmentsOnDate.some(a => a.time === t)
     );
    
     if (availableTimes.length > 0) {
         resTimeSelect.innerHTML = availableTimes.map(t => `<option value="${t}">${t}</option>`).join('');
     } else {
         resTimeSelect.innerHTML = '<option value="">No times available on this date</option>';
     }
 }

// --- MODIFIED FUNCTION ---
async function saveRescheduledAppointment() {
    if (!currentCounselorUser || !rescheduleAppointmentId) return;
    const newDate = document.getElementById('resDate').value;
    const newTime = document.getElementById('resTime').value;

    if (!newDate || !newTime) {
        alert("Please select a valid new date and time for rescheduling.");
        return;
    }

    try {
        const appointmentRef = db.collection('appointments').doc(rescheduleAppointmentId);
        const appointmentSnap = await appointmentRef.get();
        if (!appointmentSnap.exists) {
            throw new Error("Appointment to reschedule not found.");
        }
        const appointmentData = appointmentSnap.data();
        const oldNote = appointmentData.note || "";
        const studentUid = appointmentData.studentUid;

        // Update the appointment in Firestore
        await appointmentRef.update({
            date: newDate,
            time: newTime,
            status: 'Pending', // Status is reset to Pending for student re-confirmation
            note: oldNote + ` [Rescheduled by counselor to ${newDate} ${newTime}]`,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("Appointment reschedule request sent to student (status set to Pending).");

        // --- NEW: SEND RESCHEDULE EMAIL NOTIFICATION ---
        if (studentUid && emailjsConfig.serviceId && emailjsConfig.rescheduleTemplateId) {
            const studentUserDoc = await db.collection('users').doc(studentUid).get();
            if (studentUserDoc.exists && studentUserDoc.data().email) {
                const studentEmail = studentUserDoc.data().email;
                const templateParams = {
                    // These parameter names MUST match the variables in your EmailJS template
                    student_name: appointmentData.studentUsername || 'Student',
                    to_email: studentEmail,
                    counselor_name: appointmentData.counselorUsername || 'Your Counselor',
                    original_date: appointmentData.date,
                    original_time: appointmentData.time,
                    new_date: newDate,
                    new_time: newTime,
                    note: `Your counselor has proposed a new time for your appointment. It is now set to Pending and requires your action.`
                };

                emailjs.send(emailjsConfig.serviceId, emailjsConfig.rescheduleTemplateId, templateParams)
                    .then((response) => {
                        console.log('SUCCESS! Reschedule email sent.', response.status, response.text);
                    }, (error) => {
                        console.error('FAILED to send reschedule email.', error);
                    });
            } else {
                 console.warn(`Could not find email for student UID: ${studentUid}. Reschedule email not sent.`);
            }
        } else {
            console.warn("EmailJS config is missing. Skipping reschedule email notification.");
        }


        rescheduleAppointmentId = null;
        document.getElementById('rescheduleForm').style.display = 'none';
        // Real-time listener will update UI

    } catch (error) {
        console.error("Error rescheduling appointment:", error);
        alert("Failed to reschedule appointment.");
    }
}


 function renderScheduledAppointments() {
     if (!currentCounselorUser) return;
     const container = document.getElementById('scheduleList');
     container.innerHTML = '';
     const approved = counselorAppointments
         .filter(a => a.status === 'Approved')
         .sort((a, b) => {
             const dateTimeA = `${a.date} ${a.time}`;
             const dateTimeB = `${b.date} ${b.time}`;
             return dateTimeA.localeCompare(dateTimeB);
         });

     if (approved.length === 0) {
         container.innerHTML = '<p>No approved appointments in your schedule.</p>';
         return;
     }
     approved.forEach(a => {
         const card = document.createElement('div');
         card.className = 'appointment-card';
         card.innerHTML = `
             <p><strong>${a.date} @ ${a.time}</strong></p>
             <p>Student: ${a.studentUsername || 'Unknown'}</p>
             ${a.reason ? `<p>Reason: ${a.reason}</p>` : ''}
             ${a.note ? `<p>Note: ${a.note}</p>` : ''}
         `;
         container.appendChild(card);
     });
 }