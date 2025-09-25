// app.js (module)
// Replace the firebaseConfig below with your real config from the Firebase console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

// Use a stable appId for your project's data paths (replace with your identifier)
const appId = "default-app-id";

/* ------------------ Firebase imports ------------------ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  updateDoc,
  limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* ------------------ Initialize ------------------ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ------------------ UI elements ------------------ */
const setupModal = document.getElementById("setup-modal");
const nicknameInput = document.getElementById("nicknameInput");
const ownerIdInput = document.getElementById("ownerIdInput");
const isFriendCheckbox = document.getElementById("isFriendCheckbox");
const startChatButton = document.getElementById("startChatButton");

const mainUI = document.getElementById("main-ui");
const ownerIdSpan = document.getElementById("ownerIdSpan");
const conversationList = document.getElementById("conversationList");
const chatPane = document.getElementById("chat-pane");
const chatTitle = document.getElementById("chatTitle");
const chatView = document.getElementById("chat-view");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageButton");
const createPrivateBtn = document.getElementById("createPrivateBtn");
const searchConv = document.getElementById("searchConv");

/* ------------------ App state ------------------ */
let userId = null;
let userName = null;
let ownerId = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;
let conversationsUnsub = null;

/* cache for user names to minimize reads */
const nameCache = new Map();

/* helpers to get collection references for consistent paths */
const usersCollectionRef = () => collection(db, "artifacts", appId, "public", "data", "users");
const conversationsCollectionRef = () => collection(db, "artifacts", appId, "public", "data", "conversations");

/* ------------------ Auth initialization ------------------ */
async function initializeAuth() {
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInAnonymously(auth);
  } catch (err) {
    console.error("Auth init failed:", err);
  }
}

/* ------------------ Owner detection and UI setup ------------------ */
async function determineOwner() {
  // store owner config as a document: artifacts/{appId}/public/appConfig
  const ownerConfigRef = doc(db, "artifacts", appId, "public", "appConfig");
  const ownerDoc = await getDoc(ownerConfigRef);

  if (ownerDoc.exists()) {
    ownerId = ownerDoc.data().ownerId;
    isOwner = (ownerId === userId);
  } else {
    // first user becomes owner
    ownerId = userId;
    isOwner = true;
    try {
      await setDoc(ownerConfigRef, { ownerId: userId });
    } catch (err) {
      console.error("Failed to write owner config:", err);
    }
  }
}

/* ------------------ User profile check ------------------ */
async function ensureUserProfile() {
  const userDocRef = doc(db, "artifacts", appId, "public", "data", "users", userId);
  const udoc = await getDoc(userDocRef);
  return udoc.exists();
}

/* ------------------ Utilities ------------------ */
async function getUserName(uid) {
  if (!uid) return "Unknown";
  if (nameCache.has(uid)) return nameCache.get(uid);
  try {
    const udoc = await getDoc(doc(db, "artifacts", appId, "public", "data", "users", uid));
    const name = udoc.exists() && udoc.data().name ? udoc.data().name : "Anonymous";
    nameCache.set(uid, name);
    return name;
  } catch (err) {
    console.warn("getUserName err", err);
    return "Anonymous";
  }
}

/* build the deterministic participantKey to query unique conversation */
function makeParticipantKey(a, b) {
  return [a, b].sort().join("_");
}

/* ------------------ Conversations listening (owner view) ------------------ */
function listenForConversations() {
  if (conversationsUnsub) conversationsUnsub();

  const convRef = conversationsCollectionRef();
  const q = query(convRef, where("ownerId", "==", userId), orderBy("lastMessageTimestamp", "desc"));
  conversationsUnsub = onSnapshot(q, async (snapshot) => {
    conversationList.innerHTML = "";
    if (snapshot.empty) {
      conversationList.innerHTML = '<li class="p-3 text-sm text-gray-500">No conversations yet.</li>';
      return;
    }

    // show each conversation — fetch participant name as needed
    for (const docSnap of snapshot.docs) {
      const conv = docSnap.data();
      const convId = docSnap.id;
      const participantId = conv.participants?.find(id => id !== userId) || null;
      let participantName = "Anonymous";
      if (participantId) participantName = await getUserName(participantId);

      const lastMsg = conv.lastMessage || "";
      const li = document.createElement("li");
      li.className = 'p-4 rounded-xl shadow-sm cursor-pointer hover:bg-gray-100 transition-colors duration-200 bg-white';
      li.dataset.conversationId = convId;

      li.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <div class="font-semibold">${participantName}</div>
            <div class="text-xs text-gray-500 mt-1 truncate max-w-[12rem]">${lastMsg}</div>
          </div>
          <div class="text-xs text-gray-400 ml-2">${conv.type || "anonymous"}</div>
        </div>
      `;

      li.addEventListener("click", () => {
        // highlight
        Array.from(conversationList.children).forEach(it => it.classList.remove("bg-gray-200"));
        li.classList.add("bg-gray-200");

        // open conversation
        activeConversationId = convId;
        chatTitle.textContent = `Chatting with ${participantName}`;
        document.getElementById("chat-pane").classList.remove("hidden");
        listenForMessages(activeConversationId);
      });

      conversationList.appendChild(li);
    }
  }, (err) => {
    console.error("conversation listener error:", err);
  });
}

/* ------------------ Create or get conversation ------------------ */
async function getOrCreateConversation(ownerIdArg, participantIdArg, type = "anonymous") {
  const convsRef = conversationsCollectionRef();
  const participantKey = makeParticipantKey(ownerIdArg, participantIdArg);

  // query by participantKey (single equality filter)
  const q = query(convsRef, where("participantKey", "==", participantKey));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].ref;
  }

  // create new conversation
  const newDocRef = await addDoc(convsRef, {
    ownerId: ownerIdArg,
    participants: [ownerIdArg, participantIdArg],
    participantKey,
    type,
    createdAt: serverTimestamp(),
    lastMessage: "",
    lastMessageTimestamp: serverTimestamp()
  });

  return newDocRef;
}

/* ------------------ Listen messages for conversation ------------------ */
function listenForMessages(conversationId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatView.innerHTML = "";
  const messagesRef = collection(db, "artifacts", appId, "public", "data", "conversations", conversationId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"));

  unsubscribeMessages = onSnapshot(q, async (snapshot) => {
    chatView.innerHTML = "";

    // gather unique senderIds to ensure names cached
    const senderIds = new Set();
    snapshot.forEach(d => {
      const data = d.data();
      if (data.senderId) senderIds.add(data.senderId);
    });

    // fetch names for any unknown ids
    const toFetch = [...senderIds].filter(id => !nameCache.has(id));
    for (const id of toFetch) {
      await getUserName(id); // caches internally
    }

    // render messages
    snapshot.forEach(d => {
      const m = d.data();
      const isSender = m.senderId === userId;
      const wrapper = document.createElement("div");
      wrapper.className = `message-bubble ${isSender ? "sent" : "received"} rounded-xl p-3 max-w-[70%]`;
      const senderName = isSender ? "Me" : (nameCache.get(m.senderId) || "Anonymous");
      const time = m.timestamp && m.timestamp.toDate ? formatTime(m.timestamp.toDate()) : "";

      wrapper.innerHTML = `
        <div class="font-bold text-sm">${senderName}</div>
        <div class="text-sm text-gray-800 mt-1">${escapeHtml(m.text || "")}</div>
        <div class="message-meta">${time}</div>
      `;
      chatView.appendChild(wrapper);
    });

    chatView.scrollTop = chatView.scrollHeight;
  }, (err) => {
    console.error("message listener error:", err);
  });
}

/* ------------------ Send a message ------------------ */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !activeConversationId) return;

  try {
    const messagesRef = collection(db, "artifacts", appId, "public", "data", "conversations", activeConversationId, "messages");
    await addDoc(messagesRef, {
      senderId: userId,
      text,
      timestamp: serverTimestamp()
    });

    // update conversation metadata for list ordering
    const convRef = doc(db, "artifacts", appId, "public", "data", "conversations", activeConversationId);
    await updateDoc(convRef, {
      lastMessage: text,
      lastMessageTimestamp: serverTimestamp()
    });

    messageInput.value = "";
    messageInput.style.height = "auto";
  } catch (err) {
    console.error("sendMessage error:", err);
  }
}

/* ------------------ Small helpers ------------------ */
function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTime(date) {
  // simple local time short
  try {
    return date.toLocaleString();
  } catch (e) {
    return "";
  }
}

/* ------------------ UI events ------------------ */
startChatButton.addEventListener("click", async () => {
  const nick = nicknameInput.value.trim();
  if (!nick) {
    alert("Please enter a nickname.");
    return;
  }

  // Save user profile
  try {
    await setDoc(doc(db, "artifacts", appId, "public", "data", "users", userId), { name: nick });
    nameCache.set(userId, nick);
    userName = nick;
  } catch (err) {
    console.error("Failed to save user profile:", err);
  }

  // If current user is owner -> show owner UI
  if (isOwner) {
    setupOwnerUI();
    return;
  }

  // Not owner: determine ownerId to connect to
  const inputOwnerId = ownerIdInput.value.trim();
  const markedFriend = isFriendCheckbox.checked;

  // if user pasted an ownerId and marked friend -> use that ownerId
  // otherwise use the canonical ownerId determined earlier (determineOwner())
  let targetOwnerId = ownerId;
  if (inputOwnerId) targetOwnerId = inputOwnerId;

  // Create or fetch conversation (type 'private' if friend checkbox set, else 'anonymous')
  try {
    const convRef = await getOrCreateConversation(targetOwnerId, userId, markedFriend ? "private" : "anonymous");
    activeConversationId = convRef.id;
    chatTitle.textContent = `Chatting with the Owner`;
    setupParticipantUI();
    listenForMessages(activeConversationId);
  } catch (err) {
    console.error("Failed to get/create conversation:", err);
    alert("Could not open chat. Check Owner ID and try again.");
  }
});

sendMessageButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    sendMessage();
  }
});
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${messageInput.scrollHeight}px`;
});

/* optional helper: owner creates a private conversation for a friend */
createPrivateBtn?.addEventListener("click", async () => {
  const friendUid = prompt("Enter friend's UID to create a private conversation:");
  if (!friendUid) return;
  try {
    const convRef = await getOrCreateConversation(userId, friendUid, "private");
    alert("Private conversation created. It will appear in your list.");
  } catch (err) {
    console.error("create private conv error", err);
    alert("Failed to create private conversation.");
  }
});

searchConv?.addEventListener("input", () => {
  const q = (searchConv.value || "").toLowerCase();
  Array.from(conversationList.children).forEach(li => {
    const txt = li.textContent?.toLowerCase() || "";
    li.style.display = txt.includes(q) ? "" : "none";
  });
});

/* ------------------ UI helpers for showing/hiding panes ------------------ */
function setupOwnerUI() {
  setupModal.classList.add("hidden");
  mainUI.classList.remove("hidden");
  document.getElementById("conversation-list-pane").classList.remove("hidden");
  document.getElementById("chat-pane").classList.remove("hidden");

  ownerIdSpan.textContent = userId;
  listenForConversations();
}

function setupParticipantUI() {
  setupModal.classList.add("hidden");
  mainUI.classList.remove("hidden");
  // participants don't need the left conversation list
  document.getElementById("conversation-list-pane").classList.add("hidden");
  document.getElementById("chat-pane").classList.remove("hidden");
}

/* ------------------ Auth state handling ------------------ */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    userId = user.uid;
    try {
      await determineOwner();
    } catch (err) {
      console.error("determineOwner err", err);
    }

    const hasProfile = await ensureUserProfile();
    if (hasProfile) {
      // load saved name
      const ud = await getDoc(doc(db, "artifacts", appId, "public", "data", "users", userId));
      if (ud.exists()) {
        userName = ud.data().name;
        nameCache.set(userId, userName);
      }

      // show UI depending on role
      if (isOwner) {
        setupOwnerUI();
      } else {
        // If user is not owner and already has a profile, auto-create a convo with the owner
        // This mirrors the "anonymous visitor" flow (they didn't re-open modal).
        try {
          const convRef = await getOrCreateConversation(ownerId, userId, "anonymous");
          activeConversationId = convRef.id;
          setupParticipantUI();
          chatTitle.textContent = `Chatting with Owner`;
          listenForMessages(activeConversationId);
        } catch (err) {
          console.error("auto conversation for participant failed", err);
          // show modal so user can fill values manually
          setupModal.classList.remove("hidden");
        }
      }
    } else {
      // No profile -> show setup modal for nickname etc.
      setupModal.classList.remove("hidden");
      mainUI.classList.add("hidden");
    }

  } else {
    // Not signed in - initialize anonymous sign-in
    initializeAuth();
  }
});

/* ------------------ Initialize if not already ------------------ */
initializeAuth().catch(err => {
  console.error("Initial auth error", err);
});
