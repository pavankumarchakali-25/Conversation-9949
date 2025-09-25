import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MSG_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Utility Functions ---
const generateShortId = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- Custom Hook for Auth ---
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // check if current user UID is saved as owner in Firestore
        const ownerRef = doc(db, "appConfig", "owner");
        onSnapshot(ownerRef, (snap) => {
          if (snap.exists() && snap.data().uid === currentUser.uid) {
            setIsOwner(true);
          }
        });
      } else {
        setUser(null);
        setIsOwner(false);
      }
    });
    return unsubscribe;
  }, []);

  return { user, isOwner };
};

// --- Chat Bubble ---
const MessageBubble = ({ msg, userId }) => {
  const isSent = msg.senderId === userId;
  return (
    <div className={`max-w-[70%] p-3 my-1 rounded-xl ${isSent ? 'ml-auto bg-indigo-500 text-white' : 'mr-auto bg-gray-200 text-gray-800'}`}>
      <p className="font-bold text-sm">{isSent ? 'Me' : msg.senderName || 'Anonymous'}</p>
      <p className="text-sm mt-1">{msg.text}</p>
    </div>
  );
};

// --- Main Chat Component ---
const ChatInterface = ({ user, isOwner }) => {
  const [nickname, setNickname] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState(null);
  const chatViewRef = useRef(null);

  // --- Start Chat as Guest ---
  const startChat = async () => {
    if (!nickname) return alert("Enter nickname");

    // sign in anonymously
    const anonUser = await signInAnonymously(auth);
    const userId = anonUser.user.uid;

    // save guest info
    await setDoc(doc(db, "users", userId), { name: nickname });

    // create conversation with owner
    const ownerDoc = await getDocs(query(collection(db, "appConfig"), where("role", "==", "owner")));
    if (ownerDoc.empty) return alert("Owner not available");
    const ownerId = ownerDoc.docs[0].data().uid;

    // get or create conversation
    const convQuery = query(
      collection(db, "conversations"),
      where("participants", "array-contains", ownerId)
    );
    const convSnap = await getDocs(convQuery);

    let convId;
    if (!convSnap.empty) {
      convId = convSnap.docs[0].id;
    } else {
      const convRef = await addDoc(collection(db, "conversations"), {
        participants: [ownerId, userId],
        createdAt: serverTimestamp()
      });
      convId = convRef.id;
    }

    setActiveConversationId(convId);
    loadMessages(convId);
  };

  // --- Load messages ---
  const loadMessages = (convId) => {
    const messagesRef = collection(db, `conversations/${convId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => doc.data());
      setMessages(msgs);
      setTimeout(() => {
        if (chatViewRef.current) chatViewRef.current.scrollTop = chatViewRef.current.scrollHeight;
      }, 50);
    });
  };

  // --- Send message ---
  const sendMessage = async () => {
    if (!messageInput || !activeConversationId) return;
    const msgRef = collection(db, `conversations/${activeConversationId}/messages`);
    await addDoc(msgRef, {
      senderId: user.uid,
      senderName: nickname || "Owner",
      text: messageInput,
      timestamp: serverTimestamp()
    });
    setMessageInput('');
  };

  return (
    <div className="flex flex-col w-full max-w-3xl h-[80vh] border rounded-xl shadow-md p-4 bg-white">
      {!activeConversationId && !isOwner && (
        <div className="flex flex-col items-center">
          <input
            placeholder="Enter your nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            className="p-3 border rounded-lg w-full mb-2"
          />
          <button onClick={startChat} className="bg-indigo-500 text-white px-6 py-2 rounded-lg">Start Chat</button>
        </div>
      )}
      {activeConversationId && (
        <>
          <div ref={chatViewRef} className="flex-1 overflow-y-auto p-2 border rounded-lg mb-2">
            {messages.map((msg, idx) => <MessageBubble key={idx} msg={msg} userId={user.uid} />)}
          </div>
          <div className="flex">
            <input
              placeholder="Type a message..."
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              className="flex-1 p-2 border rounded-l-lg"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } }}
            />
            <button onClick={sendMessage} className="bg-indigo-500 text-white px-4 rounded-r-lg">Send</button>
          </div>
        </>
      )}
    </div>
  );
};

// --- Owner Login Component ---
const OwnerLogin = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = async () => {
    if (!email || !password) return alert("Enter email & password");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const ownerRef = doc(db, "appConfig", "owner");
      const snap = await ownerRef.get();
      if (!snap.exists()) {
        await setDoc(ownerRef, { uid: cred.user.uid, role: "owner" });
      } else if (snap.data().uid !== cred.user.uid) {
        return alert("Owner already exists! Login as guest.");
      }
      onLogin();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-sm mx-auto mt-24 p-6 border rounded-xl shadow-lg bg-white">
      <input placeholder="Owner Email" value={email} onChange={e => setEmail(e.target.value)} className="p-2 border rounded-lg mb-2"/>
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="p-2 border rounded-lg mb-2"/>
      <button onClick={login} className="bg-indigo-500 text-white px-4 py-2 rounded-lg">Login as Owner</button>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const { user, isOwner } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <OwnerLogin onLogin={() => {}} />
        <ChatInterface user={{ uid: "guest" }} isOwner={false} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <ChatInterface user={user} isOwner={isOwner} />
    </div>
  );
}
