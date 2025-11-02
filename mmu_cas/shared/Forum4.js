const firebaseConfig = {
    apiKey: "AIzaSyCugT4PA8Krc2kSUSZLjEE-TVJRyVKOxAE", // Your actual API key
    authDomain: "mmu-cas.firebaseapp.com",
    projectId: "mmu-cas",
    storageBucket: "mmu-cas.appspot.com",
    messagingSenderId: "814309169546",
    appId: "1:814309169546:web:dc514a74b6d07675145073",
    measurementId: "G-YHFGZ85W8H"
}

// --- Initialize Firebase ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let currentForumUser = null;

// --- Authentication and UI Initialization ---
async function initializeForum() {
    console.log("Forum: Initializing forum...");
    auth.onAuthStateChanged(async (firebaseUser) => {
        console.log("Forum: Auth state changed. Firebase user:", firebaseUser);
        if (firebaseUser) {
            // User is signed in via Firebase
            let userDataFromSession = JSON.parse(sessionStorage.getItem('currentUser'));
            
            // Prioritize fresh data from Firebase Auth for emailVerified status
            const isVerifiedFromAuth = firebaseUser.emailVerified;

            if (userDataFromSession && userDataFromSession.uid === firebaseUser.uid && 
                (userDataFromSession.role) && typeof userDataFromSession.emailVerified !== 'undefined') {
                
                currentForumUser = {...userDataFromSession, emailVerified: isVerifiedFromAuth }; // Update with latest verification status
                if (userDataFromSession.emailVerified !== isVerifiedFromAuth) {
                    sessionStorage.setItem('currentUser', JSON.stringify(currentForumUser)); // Resync session if needed
                }
                console.log("Forum: Using user data. Session/Auth verified status:", currentForumUser.emailVerified);

            } else {
                console.log("Forum: Session data insufficient/mismatched or missing role/emailVerified. Fetching from Firestore for UID:", firebaseUser.uid);
                try {
                    const userDocRef = db.collection("users").doc(firebaseUser.uid);
                    const userDoc = await userDocRef.get();
                    if (userDoc.exists) {
                        const firestoreData = userDoc.data();
                        if (!firestoreData.role) {
                             console.error("Forum: CRITICAL - User document in Firestore is missing 'role'. UID:", firebaseUser.uid);
                             await auth.signOut(); 
                             window.location.href = 'login-page.html'; // Redirect to login
                             return;
                        }
                        currentForumUser = { 
                            uid: firebaseUser.uid, 
                            email: firebaseUser.email, // Get email from firebaseUser
                            emailVerified: isVerifiedFromAuth, // Get verification status from firebaseUser
                            ...firestoreData 
                        };
                        sessionStorage.setItem('currentUser', JSON.stringify(currentForumUser));
                        console.log("Forum: Updated session storage with Firestore data. Verified status:", currentForumUser.emailVerified);
                    } else {
                        console.error("Forum: CRITICAL - User document not found in Firestore. UID:", firebaseUser.uid, "Logging out.");
                        await auth.signOut();
                        window.location.href = 'login-page.html'; // Redirect to login
                        return;
                    }
                } catch (error) {
                    console.error("Forum: Error fetching user data from Firestore:", error);
                    await auth.signOut();
                    window.location.href = 'login-page.html'; // Redirect to login
                    return;
                }
            }


            console.log("Forum: Email verified. Final currentForumUser:", currentForumUser);
            updateUIVisibilityAndInfo(true); // Assumes this function exists
            if (document.getElementById('loggedInUser') && document.getElementById('userRole')) {
                 document.getElementById('loggedInUser').innerText = currentForumUser.username || currentForumUser.fullName || "User";
                 document.getElementById('userRole').innerText = currentForumUser.role.charAt(0).toUpperCase() + currentForumUser.role.slice(1);
            }
            await renderPosts(); // Assumes this function exists

        } else {
            // User is signed out
            console.log("Forum: User is signed out. Redirecting to login.");
            currentForumUser = null;
            sessionStorage.removeItem('currentUser');
            updateUIVisibilityAndInfo(false); // Assumes this function exists
            // For forum, usually fine to show public posts or an empty state if not logged in,
            // but if direct access to forum.html should require login, then redirect:
            alert("Please login to access the forum.");
            window.location.href = 'login-page.html';
        }
    });
}

function updateUIVisibilityAndInfo(isLoggedIn) {
    console.log("Forum: Updating UI. isLoggedIn:", isLoggedIn, "Role:", currentForumUser?.role);
    const loginSection = document.getElementById('loginSection');
    const logoutSection = document.getElementById('logoutSection');
    const postForm = document.getElementById('postForm');

    if (loginSection) loginSection.style.display = isLoggedIn ? 'none' : 'block';
    if (logoutSection) logoutSection.style.display = isLoggedIn ? 'block' : 'none';
    
    if (postForm) {
        postForm.style.display = (isLoggedIn && currentForumUser?.role === 'student') ? 'block' : 'none';
    } else {
        console.error("Forum: postForm element not found!");
    }

    if (!isLoggedIn) {
        const loggedInUserEl = document.getElementById('loggedInUser');
        const userRoleEl = document.getElementById('userRole');
        if (loggedInUserEl) loggedInUserEl.innerText = 'User';
        if (userRoleEl) userRoleEl.innerText = 'N/A';
    }
}

async function handleLogout() {
    console.log("Forum: handleLogout called.");
    try {
        await auth.signOut();
        window.location.href = 'login-page.html';
    } catch (error) {
        console.error("Forum: Error signing out:", error);
        alert("Error signing out.");
    }
}

function redirectToDashboard() {
    console.log("Forum: redirectToDashboard. User:", currentForumUser);
    if (currentForumUser && currentForumUser.role) {
        switch (currentForumUser.role) {
            case "student": window.location.href = "student-dashboard.html"; break;
            case "counselor": window.location.href = "counselor-dashboard.html"; break;
            case "admin": window.location.href = "admin-dashboard.html"; break;
            default:
                console.warn("Forum: No dashboard for role:", currentForumUser.role);
                window.location.href = 'login-page.html';
                break;
        }
    } else {
        console.warn("Forum: Cannot redirect, user/role missing.");
        window.location.href = 'login-page.html';
    }
}

async function createPost() {
    if (!currentForumUser || !currentForumUser.emailVerified) {
        alert('Please login with a verified email to create a post.');
        return;
    }
    if (currentForumUser.role !== 'student') {
        alert('Only students can create posts.');
        return;
    }

    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const isPublic = document.getElementById('publicToggle').checked;

    if (!title || !content) {
        alert('Title and content are required.');
        return;
    }

    const newPostData = {
        title, content,
        authorUsername: currentForumUser.username || currentForumUser.fullName,
        authorUid: currentForumUser.uid,
        authorRole: currentForumUser.role,
        isPublic, replies: [], closed: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        // --- Step 1: Create the new post ---
        const postDocRef = await db.collection('forumPosts').add(newPostData);
        console.log("Post created successfully with ID: ", postDocRef.id);

        // --- Step 2: Create notifications based on post visibility ---
        console.log("Attempting to create notifications...");
        try {
            const usersToNotify = new Set(); // Use a Set to avoid duplicate notifications

            // Always notify all counselors
            const counselorsSnapshot = await db.collection('users').where('role', '==', 'counselor').get();
            counselorsSnapshot.forEach(doc => usersToNotify.add(doc.id));

            // If the post is public, also notify all other students
            if (isPublic) {
                const studentsSnapshot = await db.collection('users').where('role', '==', 'student').get();
                studentsSnapshot.forEach(doc => {
                    // Don't add a notification for the user who created the post
                    if (doc.id !== currentForumUser.uid) {
                        usersToNotify.add(doc.id);
                    }
                });
            }

            if (usersToNotify.size > 0) {
                const notificationsBatch = db.batch();
                const notificationMessage = `A new ${isPublic ? 'public' : 'private'} forum post titled "${title.substring(0, 30)}..." was created.`;
                
                usersToNotify.forEach(userId => {
                    const newNotifRef = db.collection('notifications').doc(); // Auto-generate ID
                    notificationsBatch.set(newNotifRef, {
                        userId: userId,
                        message: notificationMessage,
                        link: `forum4.html?postId=${postDocRef.id}`,
                        read: false,
                        type: 'FORUM_NEW_POST',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await notificationsBatch.commit();
                console.log(`Notifications created for ${usersToNotify.size} users.`);
            } else {
                console.log("No users found to notify.");
            }
        } catch (notifError) {
            console.error("Could not create notifications, but post was created successfully.", notifError);
        }
        // --- END OF NOTIFICATION CODE ---

        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        document.getElementById('publicToggle').checked = false;
        await renderPosts();
    } catch (error) {
        console.error("Error creating post in Firestore:", error);
        alert("Failed to create post. Please try again.");
    }
}

async function fetchPosts() {
    console.log("Forum: Fetching posts. Current user:", currentForumUser);
    const loadingMsg = document.getElementById('loadingPostsMsg');
    if (loadingMsg) loadingMsg.style.display = 'block';
    
    const postsContainerForErrorMsg = document.getElementById('postsContainer');
    if(postsContainerForErrorMsg) postsContainerForErrorMsg.innerHTML = '';

    try {
        let combinedPosts = [];
        if (!currentForumUser) {
            console.log("Forum: Unauthenticated user, fetching only public posts.");
            const publicQuery = db.collection('forumPosts').where('isPublic', '==', true).orderBy('createdAt', 'desc');
            const querySnapshot = await publicQuery.get();
            querySnapshot.forEach(doc => combinedPosts.push({ id: doc.id, ...doc.data() }));
        } else if (currentForumUser.role === 'counselor') {
            console.log("Forum: Counselor identified. Fetching all public and all private posts.");
            const publicQuery = db.collection('forumPosts').where('isPublic', '==', true).orderBy('createdAt', 'desc');
            const publicSnapshot = await publicQuery.get();
            publicSnapshot.forEach(doc => combinedPosts.push({ id: doc.id, ...doc.data() }));
            const privateQuery = db.collection('forumPosts').where('isPublic', '==', false).orderBy('createdAt', 'desc');
            const privateSnapshot = await privateQuery.get();
            privateSnapshot.forEach(doc => { if (!combinedPosts.find(p => p.id === doc.id)) combinedPosts.push({ id: doc.id, ...doc.data() }); });
        } else if (currentForumUser.role === 'student') {
            console.log("Forum: Student identified. Fetching public and own private posts.");
            const publicQuery = db.collection('forumPosts').where('isPublic', '==', true).orderBy('createdAt', 'desc');
            const publicSnapshot = await publicQuery.get();
            publicSnapshot.forEach(doc => combinedPosts.push({ id: doc.id, ...doc.data() }));
            const privateQuery = db.collection('forumPosts').where('authorUid', '==', currentForumUser.uid).where('isPublic', '==', false).orderBy('createdAt', 'desc');
            const privateSnapshot = await privateQuery.get();
            privateSnapshot.forEach(doc => { if (!combinedPosts.find(p => p.id === doc.id)) combinedPosts.push({ id: doc.id, ...doc.data() }); });
        }
        combinedPosts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        console.log("Forum: Total combined posts to render:", combinedPosts.length);
        if (loadingMsg) loadingMsg.style.display = 'none';
        return combinedPosts;
    } catch (error) {
        console.error("Forum: Error fetching posts:", error);
        if (loadingMsg) loadingMsg.style.display = 'none';
        if (postsContainerForErrorMsg) {
            const errorMsg = (error.code === 'permission-denied' || error.message.includes('permission-denied') || error.message.includes('Missing or insufficient permissions'))
                ? '<p style="text-align:center; color:red;">Could not load posts due to permission issues. Please check Firestore rules and ensure necessary indexes are created in Firebase console (you might get a link in the error details).</p>'
                : '<p style="text-align:center; color:red;">An error occurred while loading posts.</p>';
            postsContainerForErrorMsg.innerHTML = errorMsg;
        }
        return [];
    }
}

async function renderPosts() {
    console.log("Forum: renderPosts called. User for visibility:", currentForumUser);
    const loadingMsg = document.getElementById('loadingPostsMsg');

    const posts = await fetchPosts();
    console.log("Forum: Posts received by renderPosts:", posts);

    const container = document.getElementById('postsContainer');
    if (!container) {
        console.error("Forum: postsContainer element not found!");
        if (loadingMsg && loadingMsg.style.display !== 'none') loadingMsg.style.display = 'none';
        return;
    }
    if (!container.innerHTML.includes('color:red')) {
        container.innerHTML = '';
    }

    if (!posts || posts.length === 0) {
        console.log("Forum: No posts to render or posts array is undefined/empty.");
        if (!container.innerHTML.includes('color:red')) {
             container.innerHTML = '<p style="text-align:center; color: #777;">No posts yet. Be the first to create one if you are a student!</p>';
        }
        if (loadingMsg && loadingMsg.style.display !== 'none') loadingMsg.style.display = 'none';
        return;
    }
    if (loadingMsg && loadingMsg.style.display !== 'none') loadingMsg.style.display = 'none';

    posts.forEach(post => {
        // Primary visibility filtering is done in fetchPosts, this is a fallback/UI check
        if (!post.isPublic && (!currentForumUser || (currentForumUser.role !== 'counselor' && currentForumUser.uid !== post.authorUid))) {
            return;
        }

        const postDiv = document.createElement('div');
        postDiv.id = `post-${post.id}`;
        postDiv.className = `post ${post.isPublic ? 'public-post' : 'private-post'} ${post.closed ? 'closed-post' : ''}`;
        
        let repliesHTML = '';
        if (post.replies && post.replies.length > 0) {
            repliesHTML = post.replies.map(r =>
                `<div class="reply"><strong>${r.authorUsername || 'User'}:</strong> ${r.content.replace(/\n/g, '<br>')}</div>`
            ).join('');
        }
        const postDate = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'earlier';
        const postTime = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        // Basic post info
        let postHTML = `
            <h3>${post.title}</h3>
            <p>${post.content.replace(/\n/g, '<br>')}</p>
            <small>Posted by ${post.authorUsername || 'Unknown'} (${post.authorRole || 'N/A'}) on ${postDate} ${postTime}</small>
            <div id="replies-${post.id}" class="replies-container" style="margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;">
                ${repliesHTML}
            </div>
        `;
        postDiv.innerHTML = postHTML; // Set initial HTML

        // --- Add Controls (Reply, Close, Toggle Visibility, Delete) ---
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'controls';
        controlsDiv.style.marginTop = '10px';
        let controlsContent = '';

        // Reply/Comment Area (if post not closed and user logged in)
        if (!post.closed && currentForumUser) {
            const replyTextareaId = `reply-text-${post.id}`;
            controlsContent += `<div class="reply-input-area" style="margin-top:10px;"><textarea id="${replyTextareaId}" placeholder="Your ${currentForumUser.role === 'counselor' ? 'reply' : 'comment'}..." style="width: calc(100% - 22px); margin-bottom: 5px; padding: 8px;"></textarea></div>`;
            
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'controls-buttons';

            // Reply/Comment Button
            if (currentForumUser.role === 'counselor' || (currentForumUser.role === 'student' && (post.isPublic || currentForumUser.uid === post.authorUid))) {
                 buttonContainer.innerHTML += `<button onclick="addReply('${post.id}', '${replyTextareaId}')" class="primary" style="margin-right:5px;">${currentForumUser.role === 'counselor' ? 'Reply' : 'Comment'}</button>`;
            }

            // Counselor-specific: Close Post Button
            if (currentForumUser.role === 'counselor') {
                buttonContainer.innerHTML += `<button onclick="closePost('${post.id}')" class="danger" style="margin-right:5px;">Close Post</button>`;
            }
            
            // Student Author-specific: Toggle Visibility Button
            if (currentForumUser.role === 'student' && currentForumUser.uid === post.authorUid) {
                buttonContainer.innerHTML += `
                    <button onclick="togglePostVisibility('${post.id}')" class="success" style="margin-right:5px;">
                        Make ${post.isPublic ? 'Private' : 'Public'}
                    </button>
                `;
            }
            controlsContent += buttonContainer.outerHTML;
        }
        
        // Delete Button (Student author or Counselor)
        if (currentForumUser && (currentForumUser.uid === post.authorUid || currentForumUser.role === 'counselor')) {
            // Add delete button to a new line or existing button container if it makes sense for layout
            let deleteButtonHTML = `<button onclick="deleteForumPost('${post.id}')" class="danger" style="margin-top: 5px;">Delete Post</button>`;
            if (controlsContent.includes('controls-buttons')) { // If other buttons exist, try to add it near them
                 const tempDiv = document.createElement('div');
                 tempDiv.innerHTML = controlsContent;
                 const btnContainer = tempDiv.querySelector('.controls-buttons');
                 if(btnContainer) {
                    btnContainer.innerHTML += deleteButtonHTML;
                    controlsContent = tempDiv.innerHTML;
                 } else {
                    controlsContent += deleteButtonHTML;
                 }
            } else {
                controlsContent += deleteButtonHTML;
            }
        }
        
        controlsDiv.innerHTML = controlsContent;
        if(controlsContent.trim() !== '') { // Only append controlsDiv if it has content
            postDiv.appendChild(controlsDiv);
        }
        container.appendChild(postDiv);
    });
}

// --- Delete Post Function ---
async function deleteForumPost(postId) {
    console.log(`Forum: deleteForumPost called for post ID: ${postId}`);
    if (!currentForumUser) {
        alert('Please login to delete posts.');
        return;
    }

    // Confirmation dialog
    if (!confirm("Are you sure you want to permanently delete this post and all its replies? This action cannot be undone.")) {
        return;
    }

    try {
        const postRef = db.collection('forumPosts').doc(postId);
        // const postDoc = await postRef.get();
        // if (!postDoc.exists) {
        //     alert("Post not found or already deleted.");
        //     await renderPosts(); // Re-render to update list
        //     return;
        // }
        // if (currentForumUser.uid !== postDoc.data().authorUid && currentForumUser.role !== 'counselor') {
        //     alert("You do not have permission to delete this post.");
        //     return;
        // }

        await postRef.delete();
        console.log("Forum: Post deleted successfully:", postId);
        alert("Post deleted successfully.");
        await renderPosts(); // Re-render posts to reflect the deletion
    } catch (error) {
        console.error("Forum: Error deleting post:", error);
        if (error.code === 'permission-denied') {
            alert("You do not have permission to delete this post.");
        } else {
            alert("Failed to delete post. Please try again.");
        }
    }
}


async function togglePostVisibility(postId) {
    console.log(`Forum: togglePostVisibility called for post ID: ${postId}`);
    if (!currentForumUser) return alert('Please login.');
    try {
        const postRef = db.collection('forumPosts').doc(postId);
        const postDoc = await postRef.get();
        if (!postDoc.exists) { 
            console.error("Forum: Post not found for toggle:", postId);
            return alert("Post not found.");
        }
        if (currentForumUser.uid !== postDoc.data().authorUid) {
            return alert('Unauthorized: Only the author can change post visibility.');
        }
        await postRef.update({ isPublic: !postDoc.data().isPublic });
        console.log("Forum: Post visibility toggled for ID:", postId);
        await renderPosts();
    } catch (error) {
        console.error("Forum: Error toggling post visibility:", error);
        alert("Failed to update post visibility.");
    }
}

async function addReply(postId, textareaId) {
    if (!currentForumUser || !currentForumUser.emailVerified) {
        alert('Please login with a verified email to reply.');
        return;
    }

    const replyInput = document.getElementById(textareaId);
    if (!replyInput) return console.error("Reply textarea not found:", textareaId);
    
    const replyText = replyInput.value.trim();
    if (!replyText) return alert('Reply/comment cannot be empty.');

    const postRef = db.collection('forumPosts').doc(postId);

    try {
        const postDoc = await postRef.get();
        if (!postDoc.exists) throw new Error("Post does not exist.");
        
        const postData = postDoc.data();
        
        const newReply = {
            authorUsername: currentForumUser.username || currentForumUser.fullName,
            authorUid: currentForumUser.uid,
            authorRole: currentForumUser.role,
            content: replyText,
            createdAt: new Date()
        };

        // Update the post with the new reply
        await postRef.update({
            replies: firebase.firestore.FieldValue.arrayUnion(newReply)
        });
        
        // --- CREATE NOTIFICATIONS FOR THREAD PARTICIPANTS ---
        const usersToNotify = new Set();
        // Add the original post author
        if (postData.authorUid) {
            usersToNotify.add(postData.authorUid);
        }
        // Add all previous unique repliers
        if (postData.replies && postData.replies.length > 0) {
            postData.replies.forEach(reply => usersToNotify.add(reply.authorUid));
        }

        // Remove the current user so they don't get a notification for their own reply
        usersToNotify.delete(currentForumUser.uid);

        if (usersToNotify.size > 0) {
            const notificationsBatch = db.batch();
            const notificationMessage = `${newReply.authorUsername} also replied to the post: "${postData.title.substring(0, 30)}..."`;

            usersToNotify.forEach(userId => {
                const newNotifRef = db.collection('notifications').doc();
                notificationsBatch.set(newNotifRef, {
                    userId: userId,
                    message: notificationMessage,
                    link: `forum4.html?postId=${postId}`,
                    read: false,
                    type: 'FORUM_REPLY',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await notificationsBatch.commit();
            console.log(`Reply notifications created for ${usersToNotify.size} thread participants.`);
        }
        // --- END OF NEW NOTIFICATION CODE ---

        replyInput.value = '';
        await renderPosts();
    } catch (error) {
        console.error("Error adding reply:", error);
        alert("Failed to add reply.");
    }
}
async function closePost(postId) {
    console.log(`Forum: closePost called for post ID: ${postId}`);
    if (!currentForumUser || currentForumUser.role !== 'counselor') {
        return alert('Unauthorized: Only counselors can close posts.');
    }
    try {
        const postRef = db.collection('forumPosts').doc(postId);
        await postRef.update({ closed: true });
        console.log("Forum: Post closed successfully:", postId);
        await renderPosts();
    } catch (error) {
        console.error("Forum: Error closing post:", error);
        alert("Failed to close post.");
    }
}

function clearAllData() {
    console.warn("Forum: Dummy clearAllData function called.");
    alert("This is a placeholder button. To clear actual forum data, a secure admin function is needed.");
}

document.addEventListener('DOMContentLoaded', initializeForum);

window.handleLogout = handleLogout;
window.redirectToDashboard = redirectToDashboard;
window.createPost = createPost;
window.addReply = addReply;
window.closePost = closePost;
window.togglePostVisibility = togglePostVisibility;
window.deleteForumPost = deleteForumPost; // Make the new delete function global
window.clearAllData = clearAllData;

function handleLogin() { // Placeholder for old HTML button
    console.warn("Forum: Obsolete login form button clicked. Redirecting to main login page.");
    alert("Please login via the main Login Page.");
    window.location.href = 'login-page.html';
}
window.handleLogin = handleLogin;
