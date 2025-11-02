// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE",
    authDomain: "mmu-cas.firebaseapp.com",
    projectId: "mmu-cas",
    storageBucket: "mmu-cas.appspot.com",
    messagingSenderId: "814309169546",
    appId: "1:814309169546:web:dc514a74b6d07675145073",
    measurementId: "G-YHFGZ85W8H"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Logout handler
document.addEventListener('DOMContentLoaded', function() {
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            if (auth) {
                auth.signOut().then(() => {
                    sessionStorage.removeItem("currentUser");
                    window.location.href = "login-page.html";
                }).catch((error) => {
                    alert("Error signing out: " + error.message);
                });
            } else {
                alert("An error occurred (auth not available). Please try refreshing.");
            }
        });
    }

    // Listen to authentication state
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            let userData = JSON.parse(sessionStorage.getItem("currentUser"));
            if (userData && userData.uid === user.uid) {
                if (userData.role === "student") {
                    setStudentInfo(userData); // Set from session storage first

                    // Fetch fresh data from Firestore and update info
                    const userDoc = await db.collection("users").doc(user.uid).get();
                    if (userDoc.exists) {
                        const freshUserData = userDoc.data();
                        setStudentInfo(freshUserData);
                        sessionStorage.setItem("currentUser", JSON.stringify({
                            uid: user.uid,
                            email: freshUserData.email,
                            fullName: freshUserData.fullName,
                            username: freshUserData.username,
                            role: freshUserData.role,
                            idNumber: freshUserData.idNumber
                        }));
                        // Start notification sync
                        updateNotificationCount(user.uid);
                    } else {
                        alert("User data missing. Logging out.");
                        auth.signOut();
                    }
                } else {
                    alert("Access denied. You are not registered as a student.");
                    window.location.href = "login-page.html";
                }
            } else {
                // Session storage missing or inconsistent
                if(user) await auth.signOut();
                window.location.href = "login-page.html";
            }
        } else {
            sessionStorage.removeItem("currentUser");
            window.location.href = "login-page.html";
        }
    });
});

// Helper to set student info on dashboard
function setStudentInfo(userData) {
    document.getElementById("studentName").textContent = userData.fullName || userData.username || "N/A";
    document.getElementById("studentId").textContent = userData.idNumber || "N/A";
}

// Real-time update for unread notification count
function updateNotificationCount(userId) {
    db.collection("notifications")
      .where("userId", "==", userId)
      .where("read", "==", false) // Show only unread
      .onSnapshot(snapshot => {
          const count = snapshot.size;
          const badge = document.getElementById("notificationBadge");
          const msg = document.getElementById("notificationMsg");
          if (badge) badge.textContent = count > 0 ? count : "";
          if (msg) msg.innerHTML = `You have <strong>${count} new message${count === 1 ? "" : "s"}</strong>.`;
      });
}