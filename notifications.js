// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE",
    authDomain: "mmu-cas.firebaseapp.com",
    projectId: "mmu-cas",
    storageBucket: "mmu-cas.appspot.com",
    messagingSenderId: "814309169546",
    appId: "1:814309169546:web:dc514a74b6d07675145073",
    measurementId: "G-YHFGZ85W8H"
};

// --- Initialize Firebase ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

const notificationsListContainer = document.getElementById('notificationsList');
const markAllReadBtn = document.getElementById('markAllReadBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
let notificationsListener = null;

let allNotificationIds = [];
let unreadNotificationIds = [];

// --- NEW: Function to Request Notification Permission ---
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notification permission granted.');
            } else {
                console.log('Notification permission denied.');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Request permission as soon as the page is loaded
    requestNotificationPermission();

    auth.onAuthStateChanged(user => {
        if (user && user.emailVerified) {
            console.log("User authenticated, setting up notifications listener for UID:", user.uid);
            setupNotificationsListener(user.uid);

            if (markAllReadBtn) markAllReadBtn.addEventListener('click', () => markAllAsRead(user.uid));
            if (deleteAllBtn) deleteAllBtn.addEventListener('click', () => deleteAllNotifications(user.uid));

        } else {
            console.log("No verified user logged in.");
            if (notificationsListContainer) {
                notificationsListContainer.innerHTML = '<p>Please <a href="login-page.html">log in</a> to see your notifications.</p>';
            }
            if (markAllReadBtn) markAllReadBtn.style.display = 'none';
            if (deleteAllBtn) deleteAllBtn.style.display = 'none';
        }
    });
});

function setupNotificationsListener(userId) {
    if (notificationsListener) notificationsListener();

    notificationsListener = db.collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            console.log("Received notification snapshot. Size:", snapshot.size);
            const notifications = [];
            const newUnreadNotifications = [];

            allNotificationIds = [];
            const currentUnreadIds = [];

            snapshot.docChanges().forEach(change => {
                const doc = change.doc;
                const data = doc.data();
                const docId = doc.id;

                if (change.type === 'added' && !data.read) {
                    // This is a newly added, unread notification
                    newUnreadNotifications.push({ id: docId, ...data });
                }
            });

            snapshot.forEach(doc => {
                const data = doc.data();
                const docId = doc.id;

                allNotificationIds.push(docId);
                if (!data.read) {
                    currentUnreadIds.push(docId);
                }
                notifications.push({ id: docId, ...data });
            });

            unreadNotificationIds = currentUnreadIds;

            renderNotifications(notifications);

            // --- NEW: Trigger browser notifications for new unread items ---
            if (newUnreadNotifications.length > 0) {
                showBrowserNotification(newUnreadNotifications[0]); // Show for the latest one
            }

            if (markAllReadBtn) markAllReadBtn.style.display = unreadNotificationIds.length > 0 ? 'inline-block' : 'none';
            if (deleteAllBtn) deleteAllBtn.style.display = allNotificationIds.length > 0 ? 'inline-block' : 'none';

        }, error => {
            console.error("Error fetching notifications in real-time:", error);
            if (notificationsListContainer) {
                notificationsListContainer.innerHTML = '<p style="color:red;">Error loading notifications.</p>';
            }
        });
}

// --- NEW: Function to Show a Browser Notification ---
function showBrowserNotification(notification) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        console.log('Browser notifications not available or permission not granted.');
        return;
    }

    const icon = getIconForType(notification.type);
    const options = {
        body: notification.message,
        icon: 'path/to/your/icon.png' // Optional: Replace with a URL to an icon image
    };

    const browserNotification = new Notification(`New Notification ${icon}`, options);

    // Handle click on the browser notification
    browserNotification.onclick = () => {
        handleNotificationClick(notification);
        window.focus(); // Bring the browser tab to the front
    };
}


function renderNotifications(notifications) {
    if (!notificationsListContainer) return;

    if (notifications.length === 0) {
        notificationsListContainer.innerHTML = '<p>You have no notifications.</p>';
        return;
    }

    notificationsListContainer.innerHTML = '';
    notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        if (!notification.read) {
            item.classList.add('unread');
        }

        const iconType = getIconForType(notification.type);
        const displayDate = notification.createdAt ? notification.createdAt.toDate().toLocaleString() : 'Just now';

        item.innerHTML = `
            <div class="icon">${iconType}</div>
            <div class="content">
                <div class="message">${notification.message}</div>
                <div class="timestamp">${displayDate}</div>
            </div>
        `;

        item.addEventListener('click', () => handleNotificationClick(notification));
        notificationsListContainer.appendChild(item);
    });
}

function getIconForType(type) {
    switch (type) {
        case 'APPOINTMENT_APPROVED': return '✔️';
        case 'APPOINTMENT_RESCHEDULED': return '🔄';
        case 'APPOINTMENT_DECLINED': return '❌';
        case 'APPOINTMENT_REQUEST': return '🗓️';
        case 'FORUM_REPLY': return '💬';
        case 'FORUM_NEW_POST': return '?';
        default: return '🔔';
    }
}



async function handleNotificationClick(notification) {
    if (!notification.read) {
        try {
            await db.collection('notifications').doc(notification.id).update({ read: true });
            console.log("Marked notification as read upon navigation:", notification.id);
        } catch (error) {
            console.error("Error marking notification as read:", error);
        }
    }
    if (notification.link) {
        window.location.href = notification.link;
    }
}

async function markAllAsRead(userId) {
    if (unreadNotificationIds.length === 0) {
        alert("No unread notifications to mark.");
        return;
    }
    console.log(`Marking ${unreadNotificationIds.length} notifications as read for user ${userId}`);
    markAllReadBtn.disabled = true;

    const batch = db.batch();
    unreadNotificationIds.forEach(notifId => {
        const notifRef = db.collection('notifications').doc(notifId);
        batch.update(notifRef, { read: true });
    });

    try {
        await batch.commit();
        console.log("Successfully marked all as read.");
    } catch (error) {
        console.error("Error marking all as read:", error);
        alert("Could not mark all notifications as read. Please try again.");
    } finally {
        markAllReadBtn.disabled = false;
    }
}

async function deleteAllNotifications(userId) {
    if (allNotificationIds.length === 0) {
        alert("There are no notifications to delete.");
        return;
    }

    if (!confirm(`Are you sure you want to permanently delete all ${allNotificationIds.length} of your notifications? This action cannot be undone.`)) {
        return;
    }

    console.log(`Deleting ${allNotificationIds.length} notifications for user ${userId}`);
    deleteAllBtn.disabled = true;

    const batch = db.batch();
    allNotificationIds.forEach(notifId => {
        const notifRef = db.collection('notifications').doc(notifId);
        batch.delete(notifRef);
    });

    try {
        await batch.commit();
        console.log("Successfully deleted all notifications.");
    } catch (error) {
        console.error("Error deleting all notifications:", error);
        alert("Could not delete all notifications. Please try again.");
    } finally {
        deleteAllBtn.disabled = false;
    }
}