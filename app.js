import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
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

// --- Utility Functions ---
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

function renderMessage(msg) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble rounded-xl p-3 max-w-[70%] shadow-sm ${msg.senderId === userId ? "sent" : "received"}`;
    const senderName = msg.senderId === userId ? "Me" : msg.senderName || "Anonymous";
    bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p class="text-gray-800 text-sm mt-1">${msg.text}</p>`;
    chatView.appendChild(bubble);
    chatView.scrollTop = chatView.scrollHeight;
}

// --- Firestore Listeners ---
async function getOrCreateConversation(ownerId, guestId) {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", ownerId));
    const snap = await getDocs(q);

    for (let docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.participants.includes(guestId)) {
            return docSnap.ref;
        }
    }

    return await addDoc(convRef, {
        ownerId,
        participants: [ownerId, guestId],
        createdAt: serverTimestamp()
    });
}

const listenForMessages = (conversationId) => {
    if (unsubscribeMessages) unsubscribeMessages();
    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(q, snapshot => {
        chatView.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            renderMessage(msg);
            if (!isOwner) saveMessageLocally(conversationId, msg);
        });
    });
};

const listenForConversations = async () => {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("ownerId", "==", userId));
    onSnapshot(q, async snapshot => {
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
                chatPane.classList.remove('hidden');
                listenForMessages(activeConversationId);
            });
            conversationList.appendChild(li);
        });
    });
};

// --- Event Listeners ---
ownerLoginBtn.addEventListener('click', () => {
    ownerLoginForm.classList.remove('hidden');
    guestLoginForm.classList.add('hidden');
});
guestLoginBtn.addEventListener('click', () => {
    guestLoginForm.classList.remove('hidden');
    ownerLoginForm.classList.add('hidden');
});

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
        ownerIdSpan.textContent = userId;
        listenForConversations();
    } catch (e) {
        alert("Login failed: " + e.message);
    }
});

startChatButton.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    const shortOwnerId = ownerIdInput.value.trim();
    if (!nickname) return alert("Enter nickname");
    if (!shortOwnerId) return alert("Enter the Owner ID");

    // Lookup owner full UID from appConfig
    const ownerQuery = query(collection(db, "appConfig"), where("shortId", "==", shortOwnerId));
    const snap = await getDocs(ownerQuery);
    if (snap.empty) return alert("Owner not found");
    ownerId = snap.docs[0].data().fullUid;
    userName = nickname;

    await signInAnonymously(auth);
    userId = auth.currentUser.uid;

    await setDoc(doc(db, "users", userId), { name: nickname });

    const convDocRef = await getOrCreateConversation(ownerId, userId);
    activeConversationId = convDocRef.id;

    setupModal.classList.add('hidden');
    mainUI.classList.remove('hidden');
    chatPane.classList.remove('hidden');
    chatHeader.querySelector('h3').textContent = `Chatting with the Owner`;

    loadMessagesLocally(activeConversationId).forEach(renderMessage);
    listenForMessages(activeConversationId);
});

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

// --- Init ---
onAuthStateChanged(auth, user => {
    if (user) userId = user.uid;
});
