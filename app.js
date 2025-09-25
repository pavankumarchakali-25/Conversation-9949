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
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');

// --- Global State ---
let userId = null;
let userName = null;
let ownerId = null;
let fullOwnerUid = null;
let isOwner = false;
let activeConversationId = null;
let unsubscribeMessages = null;

// --- Utility Functions ---
function generateShortId(length = 6){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for(let i=0;i<length;i++){ result += chars.charAt(Math.floor(Math.random()*chars.length)); }
    return result;
}

function saveMessageLocally(conversationId, message){
    const key = `chat_${conversationId}`;
    const existing = JSON.parse(localStorage.getItem(key)) || [];
    existing.push(message);
    localStorage.setItem(key, JSON.stringify(existing));
}

function loadMessagesLocally(conversationId){
    const key = `chat_${conversationId}`;
    return JSON.parse(localStorage.getItem(key)) || [];
}

function renderMessage(msg){
    const bubble = document.createElement("div");
    bubble.className = `message-bubble rounded-xl p-3 max-w-[70%] shadow-sm ${msg.senderId===userId?"sent":"received"}`;
    const senderName = msg.senderId===userId?"Me":msg.senderName||"Anonymous";
    bubble.innerHTML = `<p class="font-bold text-sm">${senderName}</p><p class="text-gray-800 text-sm mt-1">${msg.text}</p>`;
    chatView.appendChild(bubble);
    chatView.scrollTop = chatView.scrollHeight;
}

// --- Firebase Listeners ---
const listenForMessages = (conversationId) => {
    if(unsubscribeMessages) unsubscribeMessages();
    const messagesRef = collection(db, `conversations/${conversationId}/messages`);
    const q = query(messagesRef, orderBy("timestamp","asc"));
    unsubscribeMessages = onSnapshot(q, snapshot=>{
        chatView.innerHTML="";
        snapshot.forEach(doc=>{
            const msg = doc.data();
            renderMessage(msg);
            if(!isOwner) saveMessageLocally(conversationId,msg);
        });
    });
};

// Owner listens for all conversations
const listenForConversations = async () => {
    const convRef = collection(db,"conversations");
    const q = query(convRef, where("ownerId","==",userId));
    onSnapshot(q, snapshot=>{
        conversationList.innerHTML="";
        snapshot.forEach(async doc=>{
            const data = doc.data();
            const participantId = data.participants.find(id=>id!==userId);
            let participantName = "Anonymous";
            if(participantId){
                const userDoc = await getDoc(doc(db,"users",participantId));
                if(userDoc.exists()) participantName = userDoc.data().name;
            }
            const li = document.createElement("li");
            li.className='p-4 rounded-xl shadow-sm cursor-pointer hover:bg-gray-100 transition-colors duration-200 bg-white';
            li.textContent = participantName;
            li.dataset.conversationId = doc.id;
            li.addEventListener('click', ()=>{
                Array.from(conversationList.children).forEach(item=>item.classList.remove('bg-gray-200'));
                li.classList.add('bg-gray-200');
                activeConversationId = doc.id;
                chatHeader.querySelector('h3').textContent=`Chatting with ${participantName}`;
                chatView.innerHTML="";
                listenForMessages(activeConversationId);
            });
            conversationList.appendChild(li);
        });
    });
};

// --- Event Listeners ---
ownerLoginBtn.addEventListener('click',()=>{
    ownerLoginForm.classList.remove('hidden');
    guestLoginForm.classList.add('hidden');
});
guestLoginBtn.addEventListener('click',()=>{
    guestLoginForm.classList.remove('hidden');
    ownerLoginForm.classList.add('hidden');
});

// Owner login
ownerLoginSubmit.addEventListener('click', async ()=>{
    const email = ownerEmail.value.trim();
    const password = ownerPassword.value.trim();
    if(!email||!password){ alert("Enter email & password"); return; }
    try{
        const cred = await signInWithEmailAndPassword(auth,email,password);
        userId = cred.user.uid;
        isOwner = true;
        setupModal.classList.add('hidden');
        mainUI.classList.remove('hidden');
        ownerIdSpan.textContent = userId;
        listenForConversations();
    }catch(e){ alert("Login failed: "+e.message); }
});

// Guest login
startChatButton.addEventListener('click',async ()=>{
    const nickname = nicknameInput.value.trim();
    const shortOwnerId = ownerIdInput.value.trim();
    if(!nickname){ alert("Enter nickname"); return; }
    let ownerUid = userId; // fallback
    if(shortOwnerId){
        const ownerQuery = query(collection(db,"appConfig"),where("shortId","==",shortOwnerId));
        const snap = await getDocs(ownerQuery);
        if(!snap.empty) ownerUid = snap.docs[0].data().fullUid;
        else alert("Owner not found");
    }
    ownerId = ownerUid;
    userName = nickname;
    await signInAnonymously(auth);
    userId = auth.currentUser.uid;
    // Save user profile
    await setDoc(doc(db,"users",userId),{name:nickname});
    // Get or create conversation
    const convRef = collection(db,"conversations");
    const q = query(convRef, where("participants","array-contains",ownerId));
    const snap = await getDocs(q);
    let convDoc;
    if(!snap.empty){
        convDoc = snap.docs[0].ref;
    }else{
        convDoc = await addDoc(convRef,{
            ownerId,
            participants:[ownerId,userId],
            createdAt:serverTimestamp()
        });
    }
    activeConversationId = convDoc.id;
    setupModal.classList.add('hidden');
    mainUI.classList.remove('hidden');
    chatHeader.querySelector('h3').textContent = `Chatting with the Owner`;
    // Load local messages first
    const localMsgs = loadMessagesLocally(activeConversationId);
    localMsgs.forEach(renderMessage);
    // Listen to Firestore
    listenForMessages(activeConversationId);
});

// Send message
sendMessageButton.addEventListener('click',async ()=>{
    const text = messageInput.value.trim();
    if(!text||!activeConversationId) return;
    const messagesRef = collection(db,`conversations/${activeConversationId}/messages`);
    await addDoc(messagesRef,{senderId:userId,text,timestamp:serverTimestamp(),senderName:userName||""});
    messageInput.value="";
});
messageInput.addEventListener('keydown',e=>{
    if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessageButton.click(); }
});
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
});
