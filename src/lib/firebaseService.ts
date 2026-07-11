import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as fbSignOut,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  setDoc, 
  doc, 
  deleteDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError, firebaseAppConfig } from './firebase';

export interface UserAccount {
  name: string;
  email: string;
  password?: string;
  avatarColor: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: {
    name: string;
    type: string;
  }[];
  groundingMetadata?: {
    groundingChunks?: {
      web?: {
        uri: string;
        title: string;
      };
    }[];
  };
}

export interface ChatSession {
  id: string;
  title: string;
  persona: string;
  model: string;
  messages: Message[];
  createdAt: number;
}

/**
 * Handles signing in or registering the user in Firebase Auth.
 * Falls back to anonymous authentication on failure to ensure data persistence works.
 */
export async function firebaseAuthSync(user: UserAccount): Promise<{ uid: string | null; error?: string }> {
  const email = user.email.toLowerCase().trim();
  const password = user.password || 'GocompuX_Secure_Password_999!';
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { uid: userCredential.user.uid };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return { uid: userCredential.user.uid };
      } catch (createError: any) {
        console.error('Firebase Auth signup failed, falling back to anonymous:', createError);
        try {
          const anonCredential = await signInAnonymously(auth);
          return { uid: anonCredential.user.uid };
        } catch (anonError: any) {
          return { uid: null, error: anonError.code || anonError.message };
        }
      }
    }
    console.error('Firebase Auth signin failed, falling back to anonymous:', error);
    try {
      const anonCredential = await signInAnonymously(auth);
      return { uid: anonCredential.user.uid };
    } catch (anonError: any) {
      return { uid: null, error: error.code || error.message };
    }
  }
}

/**
 * Logs out of Firebase Auth.
 */
export async function firebaseSignOut() {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.error('Error logging out of Firebase:', error);
  }
}

/**
 * Saves a user profile document to Firestore.
 */
export async function saveUserToFirestore(userId: string, user: UserAccount) {
  const userPath = `users/${userId}`;
  try {
    await setDoc(doc(db, userPath), {
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor || 'text-cyan-400',
      createdAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userPath);
  }
}

/**
 * Loads all chat sessions for a user, including their message subcollections.
 */
export async function loadUserSessionsFromFirestore(userId: string): Promise<ChatSession[]> {
  const sessionsPath = `users/${userId}/sessions`;
  try {
    const q = query(collection(db, sessionsPath), orderBy('createdAt', 'asc'));
    const querySnapshot = await getDocs(q);
    const sessions: ChatSession[] = [];
    
    for (const sessionDoc of querySnapshot.docs) {
      const sData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Load messages subcollection
      const messagesPath = `users/${userId}/sessions/${sessionId}/messages`;
      const mq = query(collection(db, messagesPath), orderBy('timestamp', 'asc'));
      const messageSnapshot = await getDocs(mq);
      
      const messages: Message[] = messageSnapshot.docs.map(mDoc => {
        const mData = mDoc.data();
        return {
          id: mDoc.id,
          role: mData.role,
          content: mData.content,
          timestamp: mData.timestamp?.toMillis() || Date.now(),
          attachments: mData.attachments || [],
          groundingMetadata: mData.groundingMetadata || null
        } as Message;
      });
      
      sessions.push({
        id: sessionId,
        title: sData.title || 'Untitled',
        persona: sData.persona || 'assistant',
        model: sData.model || 'gemini-3.1-flash-lite',
        createdAt: sData.createdAt?.toMillis() || Date.now(),
        messages: messages
      });
    }
    
    return sessions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, sessionsPath);
    return [];
  }
}

/**
 * Saves or updates a session metadata in Firestore.
 */
export async function saveSessionMetadataToFirestore(userId: string, session: Omit<ChatSession, 'messages'>) {
  const sessionPath = `users/${userId}/sessions/${session.id}`;
  try {
    await setDoc(doc(db, sessionPath), {
      id: session.id,
      title: session.title,
      persona: session.persona,
      model: session.model,
      createdAt: Timestamp.fromMillis(session.createdAt || Date.now()),
      updatedAt: Timestamp.now()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, sessionPath);
  }
}

/**
 * Saves a single message inside a session's message subcollection.
 */
export async function saveMessageToFirestore(userId: string, sessionId: string, message: Message) {
  const messagePath = `users/${userId}/sessions/${sessionId}/messages/${message.id}`;
  try {
    await setDoc(doc(db, messagePath), {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: Timestamp.fromMillis(message.timestamp || Date.now()),
      attachments: message.attachments || [],
      groundingMetadata: message.groundingMetadata || null
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, messagePath);
  }
}

/**
 * Deletes a session and its associated messages.
 */
export async function deleteSessionFromFirestore(userId: string, sessionId: string) {
  const sessionPath = `users/${userId}/sessions/${sessionId}`;
  try {
    // Delete message subcollection documents first
    const messagesPath = `users/${userId}/sessions/${sessionId}/messages`;
    const snapshot = await getDocs(collection(db, messagesPath));
    for (const messageDoc of snapshot.docs) {
      await deleteDoc(doc(db, `users/${userId}/sessions/${sessionId}/messages/${messageDoc.id}`));
    }
    // Delete session document
    await deleteDoc(doc(db, sessionPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, sessionPath);
  }
}

export interface ParsedFirebaseError {
  type: 'auth' | 'firestore' | 'network' | 'config' | 'unknown';
  code: string | null;
  message: string;
}

/**
 * Parses any Firebase error (Auth, Firestore, Network) into a standardized interface.
 */
export function parseFirebaseError(error: any): ParsedFirebaseError {
  if (!error) {
    return { type: 'unknown', code: null, message: 'Unknown error' };
  }

  const errorMessage = error.message || String(error);

  // Check if it's our serialized FirestoreErrorInfo JSON
  if (typeof errorMessage === 'string' && errorMessage.trim().startsWith('{') && errorMessage.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error) {
        const isPermissionDenied = parsed.error.includes('permission-denied') || 
                                   parsed.error.includes('Missing or insufficient permissions') ||
                                   parsed.error.includes('PERMISSION_DENIED');
        
        const isOffline = parsed.error.includes('offline') || 
                          parsed.error.includes('unavailable') ||
                          parsed.error.includes('network');

        return {
          type: isPermissionDenied ? 'firestore' : (isOffline ? 'network' : 'firestore'),
          code: isPermissionDenied ? 'permission-denied' : 'firestore-error',
          message: parsed.error
        };
      }
    } catch (_) {
      // Not JSON or parse failed
    }
  }

  // Check error codes if it's a FirebaseError-like object
  const code = error.code || '';
  
  if (code.startsWith('auth/') || errorMessage.includes('auth/')) {
    return {
      type: 'auth',
      code: code || 'auth-error',
      message: errorMessage
    };
  }

  if (code.includes('permission') || errorMessage.includes('permission-denied') || errorMessage.includes('Missing or insufficient permissions')) {
    return {
      type: 'firestore',
      code: code || 'permission-denied',
      message: errorMessage
    };
  }

  if (code.includes('offline') || errorMessage.includes('client is offline') || errorMessage.includes('unavailable') || errorMessage.includes('network')) {
    return {
      type: 'network',
      code: code || 'network-error',
      message: errorMessage
    };
  }

  // Fallback
  return {
    type: 'unknown',
    code: code || null,
    message: errorMessage
  };
}

/**
 * Logs the sanitized Firebase Project configuration to the console.
 */
export function logFirebaseConfig() {
  const sanitizedConfig = {
    ...firebaseAppConfig,
    apiKey: firebaseAppConfig.apiKey ? `${firebaseAppConfig.apiKey.slice(0, 8)}...[HIDDEN]...` : 'MISSING',
  };
  console.log('%c🔥 Firebase Project Configuration 🔥', 'color: #FF9100; font-weight: bold; font-size: 13px;');
  console.table(sanitizedConfig);
}

/**
 * Logs the current Firebase Authentication state to the console.
 */
export function logFirebaseAuthState() {
  const currentUser = auth.currentUser;
  const isInitialized = !!auth;
  console.log('%c🔐 Firebase Auth State 🔐', 'color: #00E676; font-weight: bold; font-size: 13px;');
  console.log(`* Auth Initialized Successfully: ${isInitialized}`);
  if (currentUser) {
    console.log(`* Current User UID: ${currentUser.uid}`);
    console.log(`* Is Anonymous: ${currentUser.isAnonymous}`);
    const providers = currentUser.providerData.map(p => p.providerId);
    console.log(`* Providers: ${JSON.stringify(providers.length > 0 ? providers : (currentUser.isAnonymous ? ['anonymous'] : []))}`);
  } else {
    console.log(`* Current User: Not authenticated (NULL)`);
  }
}
