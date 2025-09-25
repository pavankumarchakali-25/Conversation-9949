import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* Firebase config */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);

/* DOM Elements */
const setupModal = document.getElementById('setup-modal');
const ownerLoginBtn = document.getElementById('ownerLoginBtn');
const guestLoginBtn = document.getElementById('guestLoginBtn');
const ownerLoginForm = document.getElementById('ownerLoginForm');
const guestLoginForm = document.getElementById('guestLoginForm');
const ownerLoginSubmit = document.getElementById('ownerLoginSubmit');
const ownerEmail = document.getElementById('ownerEmail');
const ownerPassword = document.getElementById('ownerPassword');
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

/* State */
let userId = null;
let userName = null;
let ownerId = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

/* Helpers */
function renderMessage(msg) {
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${msg.senderId === userId ? "sent" : "received"}`;
  const senderName = msg.senderName || (msg.senderId === userId ? "Me" : "Anonymous");
  bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p>${msg.text}</p>`;
  chatView.appendChild(bubble);
  chatView.scrollTop = chatView.scrollHeight;
}

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

/* Firebase Listeners */
function listenForMessages(conversationId) {
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
      li.className = 'p-2 cursor-pointer bg-white rounded shadow-sm hover:bg-gray-100';
      li.textContent = participantName;
      li.dataset.conversationId = docSnap.id;
      li.addEventListener('click', () => {
        Array.from(conversationList.children).forEach(item => item.classList.remove('bg-gray-200'));
        li.classList.add('bg-gray-200');
        activeConversationId = docSnap.id;
        chatHeader.querySelector('h3').textContent = `Chatting with ${participantName}`;
        chatPane.classList.remove('hidden');
        listenForMessages(activeConversationId);
      });
      conversationList.appendChild(li);
    });
  });
}

/* Event Listeners */
ownerLoginBtn.onclick = () => { ownerLoginForm.classList.remove('hidden'); guestLoginForm.classList.add('hidden'); };
guestLoginBtn.onclick = () => { guestLoginForm.classList.remove('hidden'); ownerLoginForm.classList.add('hidden'); };

ownerLoginSubmit.onclick = async () => {
  const email = ownerEmail.value.trim();
  const password = ownerPassword.value.trim();
  if (!email || !password) { alert("Enter email & password"); return; }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    userId = cred.user.uid;
    isOwner = true;
    setupModal.classList.add('hidden');
    mainUI.classList.remove('hidden');
    ownerIdSpan.textContent = userId;
    listenForConversations();
  } catch(e) { alert("Owner login failed: " + e.message); }
};

startChatButton.onclick = async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) { alert("Enter nickname"); return; }
  userName = nickname;
  await signInAnonymously(auth);
  userId = auth.currentUser.uid;
  await setDoc(doc(db, "users", userId), { name: nickname });

  // Create 1-on-1 conversation with owner (single owner logic)
  const ownerQuery = query(collection(db,"appConfig"), where("isOwner", "==", true));
  const snap = await getDocs(ownerQuery);
  if (snap.empty) { alert("Owner not registered yet"); return; }
  ownerId = snap.docs[0].data().uid;

  const convRef = collection(db,"conversations");
  const q = query(convRef, where("participants","array-contains",ownerId), where("participants","array-contains",userId));
  const convSnap = await getDocs(q);
  let convDoc;
  if (!convSnap.empty) convDoc = convSnap.docs[0].ref;
  else convDoc = await addDoc(convRef,{ ownerId, participants:[ownerId,userId], createdAt: serverTimestamp() });
  activeConversationId = convDoc.id;

  setupModal.classList.add('hidden');
  mainUI.classList.remove('hidden');
  chatPane.classList.remove('hidden');
  chatHeader.querySelector('h3').textContent = "Chatting with Owner";

  loadMessagesLocally(activeConversationId).forEach(renderMessage);
  listenForMessages(activeConversationId);
};

sendMessageButton.onclick = async () => {
  const text = messageInput.value.trim();
  if (!text || !activeConversationId) return;
  await addDoc(collection(db,`conversations/${activeConversationId}/messages`),{
    senderId:userId,
    text,
    senderName:userName,
    timestamp:serverTimestamp()
  });
  messageInput.value="";
};

messageInput.addEventListener('keydown', e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessageButton.click(); } });
