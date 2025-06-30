const firebaseConfig = {
    apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE",
    authDomain: "mmu-cas.firebaseapp.com",
    projectId: "mmu-cas",
    storageBucket: "mmu-cas.appspot.com",
    messagingSenderId: "814309169546",
    appId: "1:814309169546:web:dc514a74b6d07675145073",
    measurementId: "G-YHFGZ85W8H"
  };
  
  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  // Login Functionality
  document.getElementById("login-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      
      const email = document.getElementById("username").value;
      const password = document.getElementById("password").value;
      const errorMessage = document.getElementById("error-message");
      
      try {
          // Firebase authentication
          const userCredential = await auth.signInWithEmailAndPassword(email, password);
          
          // Get user data from Firestore
          const userDoc = await db.collection("users").doc(userCredential.user.uid).get();
          
          if (userDoc.exists) {
              const userData = userDoc.data();
              // Store in sessionStorage instead of localStorage
              sessionStorage.setItem("currentUser", JSON.stringify({
                  uid: userCredential.user.uid,
                  email: userCredential.user.email,
                  ...userData
              }));
              
              // Redirect based on role
              if (userData.role === "student") {
                  window.location.href = "student-dashboard.html";
              } else if (userData.role === "counselor") {
                  window.location.href = "counselor-dashboard.html";
              }
          }
      } catch (error) {
          console.error("Login error:", error);
          errorMessage.textContent = getLoginErrorMessage(error.code);
      }
  });
  
  function getLoginErrorMessage(code) {
      switch(code) {
          case 'auth/user-not-found':
              return "No account found with this email";
          case 'auth/wrong-password':
              return "Incorrect password";
          case 'auth/invalid-email':
              return "Invalid email format";
          default:
              return "Login failed. Please try again.";
      }
  }
  
  // Check if User is Logged In
  function checkLogin() {
      const user = sessionStorage.getItem("currentUser");
      if (!user) {
          window.location.href = "login-page.html";
      }
  }
  
  // Logout Functionality
  function logout() {
      auth.signOut().then(() => {
          sessionStorage.removeItem("currentUser");
          window.location.href = "login-page.html";
      });
  }