import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyD_kzNCF-3fQZLxDujN_zUJlfJLErs0c0Q",
    authDomain: "conversation-9949.firebaseapp.com",
    projectId: "conversation-9949",
    storageBucket: "conversation-9949.firebasestorage.app",
    messagingSenderId: "370540129303",
    appId: "1:370540129303:web:f153894431577ca14f8052",
    measurementId: "G-166QC450CE"
  };

// --- Firebase Init ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);

// --- DOM Elements ---
const setupModal = document.getElementById('setup-modal');
const ownerLoginBtn = document.getElementById('ownerLoginBtn');
const guestLoginBtn = document.getElementById('guestLoginBtn');
const ownerLoginForm = document.getElementById('ownerLoginForm');
const ownerLoginSubmit = document.getElementById('ownerLoginSubmit');
const ownerEmail = document.getElementById('ownerEmail');
const ownerPassword = document.getElementById('ownerPassword');
const guestLoginForm = document.getElementById('guestLoginForm');
const nicknameInput = document.getElementById('nicknameInput');
const startChatButton = document.getElementById('startChatButton');
const mainUI = document.getElementById('main-ui');
const ownerIdSpan = document.getElementById('ownerIdSpan');
const conversationList = document.getElementById('conversationList');
const chatHeader = document.getElementById('chat-header');
const chatView = document.getElementById('chat-view');
const chatPane = document.getElementById('chat-pane');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');

// --- State ---
let userId = null;
let userName = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

// --- Functions ---
function renderMessage(msg) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${msg.senderId === userId ? 'sent' : 'received'}`;
    bubble.innerHTML = `<p class="font-bold text-sm">${msg.senderName || (msg.senderId===userId ? "Me":"Anonymous")}</p>
                        <p>${msg.text}</p>`;
    chatView.appendChild(bubble);
    chatView.scrollTop = chatView.scrollHeight;
}

function listenForMessages(conversationId) {
    if (unsubscribeMessages) unsubscribeMessages();
    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(q, snapshot => {
        chatView.innerHTML = "";
        snapshot.forEach(doc => renderMessage(doc.data()));
    });
}

function listenForConversations() {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("ownerId", "==", userId));
    onSnapshot(q, snapshot => {
        conversationList.innerHTML = "";
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const participantId = data.participants.find(id => id !== userId);
            const li = document.createElement("li");
            li.textContent = participantId || "Anonymous";
            li.className = "p-2 cursor-pointer bg-white mb-1 rounded";
            li.addEventListener('click', () => {
                activeConversationId = docSnap.id;
                chatHeader.querySelector('h3').textContent = `Chatting with ${participantId}`;
                chatPane.classList.remove('hidden');
                listenForMessages(activeConversationId);
            });
            conversationList.appendChild(li);
        });
    });
}

// --- Event Listeners ---
ownerLoginBtn.addEventListener('click', () => {
    ownerLoginForm.classList.remove('hidden');
    guestLoginForm.classList.add('hidden');
});
guestLoginBtn.addEventListener('click', () => {
    guestLoginForm.classList.remove('hidden');
    ownerLoginForm.classList.add('hidden');
});

// Owner Login
ownerLoginSubmit.addEventListener('click', async () => {
    const email = ownerEmail.value.trim();
    const password = ownerPassword.value.trim();
    if (!email || !password) return alert("Enter email & password");
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        userId = cred.user.uid;
        isOwner = true;
        setupModal.classList.add('hidden');
        mainUI.classList.remove('hidden');
        listenForConversations();
    } catch(e) {
        alert("Login failed. Only the first owner allowed.");
    }
});

// Anonymous Chat
startChatButton.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) return alert("Enter nickname");
    await signInAnonymously(auth);
    userId = auth.currentUser.uid;
    userName = nickname;

    // Save profile
    await setDoc(doc(db, "users", userId), { name: nickname });

    // Create conversation with owner
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", userId));
    const convSnap = await getDocs(q);

    let convDoc;
    if (!convSnap.empty) convDoc = convSnap.docs[0].ref;
    else convDoc = await addDoc(convRef, { ownerId: "OWNER_UID", participants: ["OWNER_UID", userId], createdAt: serverTimestamp() });

    activeConversationId = convDoc.id;
    setupModal.classList.add('hidden');
    mainUI.classList.remove('hidden');
    chatPane.classList.remove('hidden');
    listenForMessages(activeConversationId);
});

// Send Message
sendMessageButton.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !activeConversationId) return;
    await addDoc(collection(db, `conversations/${activeConversationId}/messages`), {
        senderId: userId,
        senderName: userName,
        text,
        timestamp: serverTimestamp()
    });
    messageInput.value = "";
});

messageInput.addEventListener('keydown', e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessageButton.click();
    }
});
