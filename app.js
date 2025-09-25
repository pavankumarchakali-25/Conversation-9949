import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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

// --- Global State ---
let userId = null;
let userName = null;
let ownerId = null;       // Short owner ID
let fullOwnerUid = null;  // Full Firebase UID
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

// --- DOM Elements ---
const setupModal = document.getElementById('setup-modal');
const nicknameInput = document.getElementById('nicknameInput');
const ownerIdInput = document.getElementById('ownerIdInput');
const startChatButton = document.getElementById('startChatButton');
const mainUI = document.getElementById('main-ui');
const ownerIdSpan = document.getElementById('ownerIdSpan');
const conversationList = document.getElementById('conversationList');
const chatHeader = document.getElementById('chat-header');
const chatView = document.getElementById('chat-view');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');

// --- Short ID generator ---
function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- LocalStorage helpers ---
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

// --- Auth initialization ---
const initAuth = async () => {
    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.error("Auth error:", err);
    }
};

// --- Setup UI ---
const setupUI = async () => {
    userId = auth.currentUser.uid;

    const ownerRef = doc(db, "appConfig/owner");
    const ownerDoc = await getDoc(ownerRef);

    if (ownerDoc.exists()) {
        ownerId = ownerDoc.data().shortId;
        fullOwnerUid = ownerDoc.data().fullUid;
        isOwner = fullOwnerUid === userId;
    } else {
        // First-time user becomes owner
        isOwner = true;
        ownerId = generateShortId();
        fullOwnerUid = userId;
        await setDoc(ownerRef, { shortId: ownerId, fullUid: fullOwnerUid });
    }

    // Check if user profile exists
    const userDocRef = doc(db, "users/" + userId);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
        userName = userDoc.data().name;
        initChatUI();
    } else {
        setupModal.classList.remove("hidden");
        mainUI.classList.add("hidden");
    }
};

// --- Initialize Chat UI ---
const initChatUI = () => {
    setupModal.classList.add("hidden");
    mainUI.classList.remove("hidden");

    if (isOwner) {
        ownerIdSpan.textContent = ownerId;
        listenForConversations();
    } else {
        document.getElementById('conversation-list-pane').classList.add('hidden');
        document.getElementById('chat-pane').classList.remove('hidden');
        getOrCreateConversation(fullOwnerUid, userId).then(docRef => {
            activeConversationId = docRef.id;
            chatHeader.querySelector('h3').textContent = "Chatting with Owner";

            // Load messages from localStorage first
            const localMessages = loadMessagesLocally(activeConversationId);
            localMessages.forEach(msg => renderMessage(msg));

            // Then sync with Firestore
            listenForMessages(activeConversationId);
        });
    }
};

// --- Get or create conversation ---
const getOrCreateConversation = async (ownerUid, participantId) => {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", ownerUid));
    const snapshot = await getDocs(q);

    for (let docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.participants.includes(participantId)) return docSnap.ref;
    }

    const newDoc = await addDoc(convRef, {
        ownerId: ownerUid,
        participants: [ownerUid, participantId],
        createdAt: serverTimestamp()
    });
    return newDoc;
};

// --- Render a message in chat view ---
const renderMessage = (msg) => {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble rounded-xl p-3 max-w-[70%] shadow-sm ${msg.senderId === userId ? "sent" : "received"}`;
    const senderName = msg.senderId === userId ? "Me" : msg.senderName || "Anonymous";
    bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p class="text-gray-800 text-sm mt-1">${msg.text}</p>`;
    chatView.appendChild(bubble);
    chatView.scrollTop = chatView.scrollHeight;
};

// --- Listen for messages ---
const listenForMessages = (conversationId) => {
    if (unsubscribeMessages) unsubscribeMessages();

    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    unsubscribeMessages = onSnapshot(q, snapshot => {
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            renderMessage(msg);
            saveMessageLocally(conversationId, msg);
        });
    });
};

// --- Listen for owner conversations ---
const listenForConversations = () => {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("ownerId", "==", userId));

    onSnapshot(q, async snapshot => {
        conversationList.innerHTML = "";
        if (snapshot.empty) {
            conversationList.innerHTML = '<li class="p-3 text-sm text-gray-500">No conversations yet.</li>';
            return;
        }

        for (let docSnap of snapshot.docs) {
            const data = docSnap.data();
            const participantId = data.participants.find(id => id !== userId);
            let participantName = "Anonymous";

            if (participantId) {
                const userDoc = await getDoc(doc(db, "users/" + participantId));
                if (userDoc.exists()) participantName = userDoc.data().name;
            }

            const li = document.createElement("li");
            li.className = 'p-4 rounded-xl shadow-sm cursor-pointer hover:bg-gray-100 transition-colors duration-200 bg-white';
            li.textContent = participantName;
            li.dataset.conversationId = docSnap.id;

            li.addEventListener("click", () => {
                Array.from(conversationList.children).forEach(item => item.classList.remove('bg-gray-200'));
                li.classList.add('bg-gray-200');

                activeConversationId = docSnap.id;
                chatHeader.querySelector('h3').textContent = `Chatting with ${participantName}`;

                const localMessages = loadMessagesLocally(activeConversationId);
                chatView.innerHTML = "";
                localMessages.forEach(msg => renderMessage(msg));

                listenForMessages(activeConversationId);
            });

            conversationList.appendChild(li);
        }
    });
};

// --- Send message ---
const sendMessage = async () => {
    const text = messageInput.value.trim();
    if (!text || !activeConversationId) return;

    const msg = {
        senderId: userId,
        senderName: userName,
        text,
        timestamp: serverTimestamp()
    };

    const messagesRef = collection(db, `conversations/${activeConversationId}/messages`);
    await addDoc(messagesRef, msg);

    messageInput.value = '';
    messageInput.style.height = "auto";
};

// --- Event Listeners ---
startChatButton.addEventListener("click", async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) return alert("Please enter a nickname.");

    const userDocRef = doc(db, "users/" + userId);
    await setDoc(userDocRef, { name: nickname });

    if (ownerIdInput.value.trim()) {
        ownerId = ownerIdInput.value.trim();
        isOwner = false;
    } else {
        ownerId = generateShortId();
        isOwner = true;
    }

    setupUI();
});

sendMessageButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = `${messageInput.scrollHeight}px`;
});

// --- Auth state ---
onAuthStateChanged(auth, user => {
    if (user) setupUI();
    else initAuth();
});
