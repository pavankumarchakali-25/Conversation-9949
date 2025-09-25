import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyD_kzNCF-3fQZLxDujN_zUJlfJLErs0c0Q",
    authDomain: "conversation-9949.firebaseapp.com",
    projectId: "conversation-9949",
    storageBucket: "conversation-9949.firebasestorage.app",
    messagingSenderId: "370540129303",
    appId: "1:370540129303:web:f153894431577ca14f8052",
    measurementId: "G-166QC450CE"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);
const db = getFirestore(app);

// DOM Elements
const loginModal = document.getElementById("login-modal");
const ownerBtn = document.getElementById("owner-btn");
const guestBtn = document.getElementById("guest-btn");
const ownerForm = document.getElementById("owner-form");
const guestForm = document.getElementById("guest-form");
const ownerEmail = document.getElementById("owner-email");
const ownerPassword = document.getElementById("owner-password");
const ownerLogin = document.getElementById("owner-login");
const guestNickname = document.getElementById("guest-nickname");
const guestStart = document.getElementById("guest-start");

const chatUI = document.getElementById("chat-ui");
const chatView = document.getElementById("chat-view");
const messageInput = document.getElementById("message-input");
const sendMessage = document.getElementById("send-message");

// State
let userId = null;
let userName = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

// Show forms
ownerBtn.onclick = () => { ownerForm.classList.remove("hidden"); guestForm.classList.add("hidden"); };
guestBtn.onclick = () => { guestForm.classList.remove("hidden"); ownerForm.classList.add("hidden"); };

// Owner login
ownerLogin.onclick = async () => {
    const email = ownerEmail.value.trim();
    const password = ownerPassword.value.trim();
    if (!email || !password) return alert("Enter email & password");
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const ownerRef = doc(db, "appConfig", "owner");
        const snap = await getDocs(collection(db, "appConfig"));
        const existingOwner = snap.docs.find(d => d.id === "owner");
        if (existingOwner && existingOwner.data().uid !== cred.user.uid) {
            return alert("Owner already exists. Login as guest.");
        }
        await setDoc(ownerRef, { uid: cred.user.uid });
        userId = cred.user.uid;
        userName = "Owner";
        isOwner = true;
        loginModal.classList.add("hidden");
        chatUI.classList.remove("hidden");
        loadConversations();
    } catch (e) { alert(e.message); }
};

// Guest login
guestStart.onclick = async () => {
    const nickname = guestNickname.value.trim();
    if (!nickname) return alert("Enter nickname");
    const anon = await signInAnonymously(auth);
    userId = anon.user.uid;
    userName = nickname;
    loginModal.classList.add("hidden");
    chatUI.classList.remove("hidden");
    startGuestConversation();
};

// --- Load conversations for owner ---
async function loadConversations() {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", userId));
    onSnapshot(q, snapshot => {
        chatView.innerHTML = "";
        snapshot.forEach(docSnap => {
            const conv = docSnap.data();
            if (!conv.participants.includes(userId)) return;
            const participant = conv.participants.find(p => p !== userId);
            const div = document.createElement("div");
            div.textContent = `Chat with ${participant}`;
            div.className = "conversation-item";
            div.onclick = () => listenMessages(docSnap.id);
            chatView.appendChild(div);
        });
    });
}

// --- Guest conversation ---
async function startGuestConversation() {
    // Get owner
    const ownerSnap = await getDocs(collection(db, "appConfig"));
    const owner = ownerSnap.docs.find(d => d.id === "owner");
    if (!owner) return alert("Owner not found");
    const ownerId = owner.data().uid;

    // Get or create conversation
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", ownerId));
    const snap = await getDocs(q);
    if (!snap.empty) activeConversationId = snap.docs[0].id;
    else {
        const docRef = await addDoc(convRef, { participants: [ownerId, userId], createdAt: serverTimestamp() });
        activeConversationId = docRef.id;
    }
    listenMessages(activeConversationId);
}

// --- Listen for messages ---
function listenMessages(convId) {
    if (unsubscribeMessages) unsubscribeMessages();
    const msgRef = collection(db, `conversations/${convId}/messages`);
    const q = query(msgRef, orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(q, snapshot => {
        chatView.innerHTML = "";
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const div = document.createElement("div");
            div.className = `message-bubble ${msg.senderId === userId ? "sent" : "received"}`;
            div.innerHTML = `<p>${msg.senderName || "Anonymous"}</p><p>${msg.text}</p>`;
            chatView.appendChild(div);
        });
        chatView.scrollTop = chatView.scrollHeight;
    });
}

// --- Send message ---
sendMessage.onclick = async () => {
    if (!messageInput.value || !activeConversationId) return;
    await addDoc(collection(db, `conversations/${activeConversationId}/messages`), {
        senderId: userId,
        senderName: userName,
        text: messageInput.value,
        timestamp: serverTimestamp()
    });
    messageInput.value = "";
};
messageInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage.click(); } });
