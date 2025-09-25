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
let ownerId = null;
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

// --- Functions ---

// Initialize or sign in anonymously
const initAuth = async () => {
    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.error("Auth error:", err);
    }
};

// Setup UI after auth
const setupUI = async () => {
    userId = auth.currentUser.uid;

    // Owner config stored in Firestore
    const ownerRef = doc(db, "appConfig/owner");
    const ownerDoc = await getDoc(ownerRef);

    if (ownerDoc.exists()) {
        ownerId = ownerDoc.data().ownerId;
        isOwner = ownerId === userId;
    } else {
        // First-time user becomes owner
        isOwner = true;
        ownerId = userId;
        await setDoc(ownerRef, { ownerId: userId });
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

// Initialize Chat UI based on role
const initChatUI = () => {
    setupModal.classList.add("hidden");
    mainUI.classList.remove("hidden");

    if (isOwner) {
        ownerIdSpan.textContent = userId;
        listenForConversations();
    } else {
        document.getElementById('conversation-list-pane').classList.add('hidden');
        document.getElementById('chat-pane').classList.remove('hidden');
        getOrCreateConversation(ownerId, userId).then(docRef => {
            activeConversationId = docRef.id;
            chatHeader.querySelector('h3').textContent = "Chatting with Owner";
            listenForMessages(activeConversationId);
        });
    }
};

// Get or create a conversation
const getOrCreateConversation = async (ownerId, participantId) => {
    const convRef = collection(db, "conversations");
    const q = query(convRef, where("participants", "array-contains", ownerId));
    const snapshot = await getDocs(q);

    // Search for existing conversation
    for (let docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.participants.includes(participantId)) return docSnap.ref;
    }

    // Create new conversation
    const newDoc = await addDoc(convRef, {
        ownerId,
        participants: [ownerId, participantId],
        createdAt: serverTimestamp()
    });
    return newDoc;
};

// Listen to messages
const listenForMessages = (conversationId) => {
    if (unsubscribeMessages) unsubscribeMessages();
    chatView.innerHTML = "";

    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    unsubscribeMessages = onSnapshot(q, async snapshot => {
        chatView.innerHTML = "";

        const participantIds = snapshot.docs.map(doc => doc.data().senderId);
        const uniqueIds = [...new Set(participantIds)];
        const participantNames = {};

        if (uniqueIds.length > 0) {
            const usersRef = collection(db, "users");
            const usersQuery = query(usersRef, where("__name__", "in", uniqueIds));
            const usersSnapshot = await getDocs(usersQuery);
            usersSnapshot.forEach(doc => {
                participantNames[doc.id] = doc.data().name;
            });
        }

        snapshot.forEach(doc => {
            const msg = doc.data();
            const bubble = document.createElement("div");
            bubble.className = `message-bubble rounded-xl p-3 max-w-[70%] shadow-sm ${msg.senderId === userId ? "sent" : "received"}`;
            const senderName = msg.senderId === userId ? "Me" : participantNames[msg.senderId] || "Loading...";
            bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p class="text-gray-800 text-sm mt-1">${msg.text}</p>`;
            chatView.appendChild(bubble);
        });

        chatView.scrollTop = chatView.scrollHeight;
    });
};

// Listen for all conversations (owner)
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
                document.getElementById('chat-pane').classList.remove('hidden');
                listenForMessages(activeConversationId);
            });

            conversationList.appendChild(li);
        }
    });
};

// Send Message
const sendMessage = async () => {
    const text = messageInput.value.trim();
    if (!text || !activeConversationId) return;

    const messagesRef = collection(db, `conversations/${activeConversationId}/messages`);
    await addDoc(messagesRef, { senderId: userId, text, timestamp: serverTimestamp() });
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
        ownerId = userId;
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

// --- Auth State ---
onAuthStateChanged(auth, user => {
    if (user) setupUI();
    else initAuth();
});
