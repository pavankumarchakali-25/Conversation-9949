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

// --- Initialize Firebase ---
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
const ownerIdInput = document.getElementById('ownerIdInput');
const startChatButton = document.getElementById('startChatButton');
const mainUI = document.getElementById('main-ui');
const ownerIdSpan = document.getElementById('ownerIdSpan');
const conversationList = document.getElementById('conversationList');
const chatHeader = document.getElementById('chat-header');
const chatView = document.getElementById('chat-view');
const chatPane = document.getElementById('chat-pane');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');

// --- Global State ---
let userId = null;
let userName = null;
let ownerId = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

// --- Local Storage Functions ---
function saveMessageLocally(conversationId, message) {
    const key = `chat_${conversationId}`;
    const existing = JSON.parse(localStorage.getItem(key)) || [];
    existing.push(message);
    localStorage.setItem(key, JSON.stringify(existing));
}

function loadMessagesLocally(conversationId) {
    const key = `chat_${conversationId}`;
    return JSON.parse(localStorage.getItem(key)) || [];
}

// --- Message Rendering ---
function renderMessage(msg) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble rounded-xl p-3 max-w-[70%] shadow-sm ${msg.senderId === userId ? "sent" : "received"}`;
    const senderName = msg.senderId === userId ? "Me" : msg.senderName || "Anonymous";
    bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p class="text-gray-800 text-sm mt-1">${msg.text}</p>`;
    chatView.appendChild(bubble);
    chatView.scrollTop = chatView.scrollHeight;
}

// --- Firebase Listeners ---
function listenForMessages(conversationId) {
    if (unsubscribeMessages) unsubscribeMessages();
    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(q, snapshot => {
        chatView.innerHTML = "";
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            renderMessage(msg);
            if (!isOwner) saveMessageLocally(conversationId, msg);
        });
    });
}

async function listenForConversations() {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("ownerId", "==", userId));
    onSnapshot(q, snapshot => {
        conversationList.innerHTML = "";
        snapshot.forEach(async docSnap => {
            const data = docSnap.data();
            const participantId = data.participants.find(id => id !== userId);
            let participantName = "Anonymous";
            if (participantId) {
                const userDoc = await getDoc(doc(db, "users", participantId));
                if (userDoc.exists()) participantName = userDoc.data().name;
            }
            const li = document.createElement("li");
            li.className = 'p-4 rounded-xl shadow-sm cursor-pointer hover:bg-gray-100 transition-colors duration-200 bg-white';
            li.textContent = participantName;
            li.dataset.conversationId = docSnap.id;
            li.addEventListener('click', () => {
                Array.from(conversationList.children).forEach(item => item.classList.remove('bg-gray-200'));
                li.classList.add('bg-gray-200');
                activeConversationId = docSnap.id;
                chatHeader.querySelector('h3').textContent = `Chatting with ${participantName}`;
                chatView.innerHTML = "";
                listenForMessages(activeConversationId);
                chatPane.classList.remove('hidden');
            });
            conversationList.appendChild(li);
        });
    });
}

// --- Event Listeners ---
// Toggle forms
ownerLoginBtn.addEventListener('click', () => {
    ownerLoginForm.classList.remove('hidden');
    guestLoginForm.classList.add('hidden');
});
guestLoginBtn.addEventListener('click', () => {
    guestLoginForm.classList.remove('hidden');
    ownerLoginForm.classList.add('hidden');
});

// Owner login
ownerLoginSubmit.addEventListener('click', async () => {
    const email = ownerEmail.value.trim();
    const password = ownerPassword.value.trim();
    if (!email || !password) return alert("Enter email & password");

    const ownerRef = doc(db, "appConfig", "owner");
    const ownerDoc = await getDoc(ownerRef);

    try {
        if (!ownerDoc.exists()) {
            // First owner
            const cred = await signInWithEmailAndPassword(auth, email, password);
            userId = cred.user.uid;
            isOwner = true;
            await setDoc(ownerRef, { ownerUid: userId, ownerEmail: email });
        } else {
            const storedEmail = ownerDoc.data().ownerEmail;
            if (email !== storedEmail) return alert("Owner exists. Login anonymously.");
            const cred = await signInWithEmailAndPassword(auth, email, password);
            userId = cred.user.uid;
            isOwner = true;
        }

        setupModal.classList.add('hidden');
        mainUI.classList.remove('hidden');
        ownerIdSpan.textContent = userId;
        listenForConversations();

    } catch (err) {
        console.error(err);
        alert("Login failed: " + err.message);
    }
});

// Guest login
startChatButton.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) return alert("Enter nickname");

    try {
        // Sign in anonymously
        await signInAnonymously(auth);
        userId = auth.currentUser.uid;
        userName = nickname;

        // Save user profile
        await setDoc(doc(db, "users", userId), { name: nickname });

        // Get or create conversation with owner
        const ownerRef = doc(db, "appConfig", "owner");
        const ownerDoc = await getDoc(ownerRef);
        if (!ownerDoc.exists()) return alert("No owner exists yet");
        ownerId = ownerDoc.data().ownerUid;

        const convRef = collection(db, "conversations");
        const q = query(convRef, where("participants", "array-contains", ownerId));
        const convSnap = await getDocs(q);

        let convDoc = null;
        convSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.participants.includes(userId)) convDoc = docSnap.ref;
        });

        if (!convDoc) {
            convDoc = await addDoc(convRef, {
                ownerId,
                participants: [ownerId, userId],
                createdAt: serverTimestamp()
            });
        }

        activeConversationId = convDoc.id;

        setupModal.classList.add('hidden');
        mainUI.classList.remove('hidden');
        chatPane.classList.remove('hidden');
        chatHeader.querySelector('h3').textContent = `Chatting with the Owner`;

        loadMessagesLocally(activeConversationId).forEach(renderMessage);
        listenForMessages(activeConversationId);

    } catch (err) {
        console.error(err);
        alert("Failed to start chat: " + err.message);
    }
});

// Send message
sendMessageButton.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !activeConversationId) return;
    const messagesRef = collection(db, `conversations/${activeConversationId}/messages`);
    await addDoc(messagesRef, {
        senderId: userId,
        text,
        timestamp: serverTimestamp(),
        senderName: userName || ""
    });
    messageInput.value = "";
});

messageInput.addEventListener('keydown', e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessageButton.click();
    }
});
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
});
