/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Plus, 
  Trash2, 
  Terminal, 
  PenTool, 
  HelpCircle, 
  Smile, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Menu, 
  X, 
  RefreshCw, 
  ArrowDown, 
  Zap,
  CheckCircle,
  AlertCircle,
  Sun,
  Moon,
  Paperclip,
  LogIn,
  LogOut,
  Globe,
  ShoppingBag,
  Eye,
  EyeOff,
  ShieldCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  UserPlus,
  Check,
  Copy,
  Share,
  Mic,
  MicOff,
  Play,
  Square,
  Camera,
  Phone,
  MessageSquare,
  BookOpen,
  Search,
  Bookmark
} from 'lucide-react';

import CursorTrail from './components/CursorTrail';

// Firebase Firestore & Authentication integration
import { testConnection, firebaseAppConfig } from './lib/firebase';
import {
  firebaseAuthSync,
  firebaseSignOut,
  saveUserToFirestore,
  loadUserSessionsFromFirestore,
  saveSessionMetadataToFirestore,
  saveMessageToFirestore,
  deleteSessionFromFirestore,
  parseFirebaseError,
  logFirebaseConfig,
  logFirebaseAuthState
} from './lib/firebaseService';

// Define structures for our application state
interface FileAttachment {
  name: string;
  size: number;
  type: string;
  data: string; // base64 representation
}

interface Message {
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

interface ChatSession {
  id: string;
  title: string;
  persona: string;
  model: string;
  messages: Message[];
  createdAt: number;
}

interface PersonaConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  systemInstruction: string;
  avatarColor: string;
  avatarBg: string;
  accentColor: string;
  badgeBg: string;
  icon: React.ComponentType<any>;
  suggestedPrompts: string[];
}

interface UserAccount {
  name: string;
  email: string;
  password?: string;
  avatarColor: string;
}

// Prompt Template Interface and Predefined structures
export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
  category: 'Developer' | 'Writing' | 'Business' | 'Creative' | 'Custom';
  isCustom?: boolean;
}

export const PREDEFINED_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl_refactor',
    title: 'Code Optimizer & Refactorer',
    description: 'Refactor complex code to improve performance, readability, and type safety.',
    category: 'Developer',
    content: `You are a Senior Principal Software Architect. Please refactor the following block of code.
Your goals:
1. Reduce time complexity and memory allocations.
2. Maximize readability and remove redundant logic.
3. Keep the logic fully type-safe.

Code to Refactor:
\`\`\`typescript
// Paste your code here
\`\`\`

Explain the specific structural optimizations made and provide the complete clean code.`
  },
  {
    id: 'tpl_explain',
    title: 'First Principles Explainer',
    description: 'Break down highly complex technical or conceptual subjects from absolute first principles.',
    category: 'Creative',
    content: `I want to understand [Insert Topic / Subject Here] deeply.
Please break this down for me using first principles thinking:
1. What are the core fundamental truths we know to be true about this?
2. How do we build up the entire complex concept from those foundational pieces?
3. Use a clear, real-world metaphor.
4. Conclude with a 1-sentence executive distillation.`
  },
  {
    id: 'tpl_socratic',
    title: 'Socratic Code Reviewer',
    description: 'Examine code for edge cases, security flaws, race conditions, or unhandled exceptions.',
    category: 'Developer',
    content: `Examine the code below for:
- Race conditions or concurrency issues
- Security bugs (injection, memory leaks, unvalidated inputs)
- Unhandled edge cases or crash loops

Code to Analyze:
\`\`\`
// Paste code here
\`\`\`

Ask me 3 strategic questions that will force me to think about edge cases in this implementation.`
  },
  {
    id: 'tpl_seo',
    title: 'SEO Copywriter & Editor',
    description: 'Optimize written content for readability, search relevance, and engagement rate.',
    category: 'Writing',
    content: `You are an expert SEO Content Strategist. Please optimize the following article copy.
Ensure:
- High readability scores with engaging subheadings.
- Intentional density of primary and secondary target search keywords.
- Compelling hooks in the intro paragraph.

Content to Optimize:
[Paste text here]`
  },
  {
    id: 'tpl_summary',
    title: 'Ultra-Actionable Summarizer',
    description: 'Distill transcripts, articles, or notes into strict, high-priority actionable bullet points.',
    category: 'Business',
    content: `Extract the core information from the text below.
Synthesize the details into:
1. **Critical Actions**: Top 3-5 immediate tasks with owners/timelines (if mentioned).
2. **Key Decisions**: Crucial choices or alignment points decided.
3. **Strategic Insight**: 1 powerful synthesis of why this matters.

Source Text:
[Paste text here]`
  },
  {
    id: 'tpl_prd',
    title: 'Agile Feature PRD Builder',
    description: 'Generate a complete, standard Product Requirement Document for agile development sprints.',
    category: 'Business',
    content: `I need a complete Product Requirement Document (PRD) for the following feature concept:
"Feature Name / Concept: [Insert Concept Here]"

Please draft the following sections:
- **Executive Summary & Goal**: The "Why" behind this feature.
- **User Stories**: 3-5 critical user stories with acceptance criteria.
- **Functional Requirements**: Detailed outline of technical behavior.
- **Out of Scope**: What we should NOT build in the first release.`
  }
];

// Premium AI personas with specialized "Genuine Product Finder"
const PERSONAS: Record<string, PersonaConfig> = {
  assistant: {
    id: 'assistant',
    name: 'gocompuX',
    title: 'Intellectual Portal Core',
    description: 'Polite, accurate, and multi-functional partner for daily tasks.',
    systemInstruction: 'You are gocompuX, a highly capable, general-purpose AI assistant. Provide highly organized, polite, and comprehensive answers. Break complex concepts into readable paragraphs and lists.',
    avatarColor: 'text-[#00F0FF]',
    avatarBg: 'bg-[#00F0FF]/10 border-[#00F0FF]/30',
    accentColor: '#00F0FF',
    badgeBg: 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20',
    icon: Sparkles,
    suggestedPrompts: [
      "Suggest 5 unique creative hobbies for someone who loves science and art.",
      "Explain how blockchain works using a metaphor of an old dusty library.",
      "Draft a friendly invitation email for a local neighborhood clean-up.",
      "Help me brainstorm 5 names for an eco-friendly clothing store."
    ]
  },
  product: {
    id: 'product',
    name: 'Genuine Finder',
    title: 'Product & Web Authenticator',
    description: 'Verifies website credibility, checks seller scores, and suggests genuine original products.',
    systemInstruction: 'You are Veritas, a Shopping Advisor and Product Authenticator. Your primary goal is to analyze websites, inspect credibility, find genuine deals, verify authentic products vs counterfeits, and check trust parameters. Utilize the live web search grounding results to verify prices, trusted domains, and authentic manufacturer pages. Highlight authentic/verified stores with confidence.',
    avatarColor: 'text-[#F59E0B]',
    avatarBg: 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
    accentColor: '#F59E0B',
    badgeBg: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    icon: ShoppingBag,
    suggestedPrompts: [
      "Analyze the web reviews for wireless earbuds under $150 and recommend genuine authentic models.",
      "Is the website 'https://www.apple.com' the only authentic portal for genuine replacement parts?",
      "Suggest three genuine mechanical keyboard brands known for durability and robust parts.",
      "How do I spot fake listings when shopping on third-party resale marketplaces?"
    ]
  },
  tech: {
    id: 'tech',
    name: 'Apex Coder',
    title: 'Expert Software Engineer',
    description: 'Technical, focused on precise code blocks and optimization.',
    systemInstruction: 'You are Apex, a senior software engineer and systems architect. Focus strictly on clean, production-ready, modular code snippets, optimal data structures, and highly precise technical explanations. Format your output clearly.',
    avatarColor: 'text-[#A05CFF]',
    avatarBg: 'bg-[#A05CFF]/10 border-[#A05CFF]/30',
    accentColor: '#A05CFF',
    badgeBg: 'bg-[#A05CFF]/10 text-[#A05CFF] border-[#A05CFF]/20',
    icon: Terminal,
    suggestedPrompts: [
      "Write a highly optimized TypeScript utility to check if a sentence is a palindrome.",
      "How do I configure and optimize composite indexes in PostgreSQL for complex queries?",
      "Explain the rendering difference between Client Components and Server Components.",
      "Provide a robust regex pattern to match complex secure passwords."
    ]
  },
  writer: {
    id: 'writer',
    name: 'Creative Quill',
    title: 'Master Storyteller',
    description: 'Imaginative writer specializing in descriptive prose and dialogue.',
    systemInstruction: 'You are Quill, an artistic Creative Writer. Answer with storytelling elements, vivid sensory descriptions, and engaging narratives.',
    avatarColor: 'text-[#FF5294]',
    avatarBg: 'bg-[#FF5294]/10 border-[#FF5294]/30',
    accentColor: '#FF5294',
    badgeBg: 'bg-[#FF5294]/10 text-[#FF5294] border-[#FF5294]/20',
    icon: PenTool,
    suggestedPrompts: [
      "Write the opening paragraph of a gothic mystery set in a mountain-top observatory.",
      "Compose a reflective poem about the absolute silence of a forest snowfall.",
      "Describe a bustling, floating solar marketplace in a futuristic sky city."
    ]
  }
};

// Web Audio API Sound Synthesizer (No external asset dependency)
let audioCtx: AudioContext | null = null;

function playSynthesizedSound(type: 'send' | 'receive' | 'click') {
  try {
    const soundPref = localStorage.getItem('sound_enabled');
    if (soundPref === 'false') return;

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.12); // C6
      gainNode.gain.setValueAtTime(0.06, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'receive') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.setValueAtTime(392.00, now + 0.05); // G4
      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.setValueAtTime(0.08, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gainNode.gain.setValueAtTime(0.015, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch (err) {
    console.debug('Sound synthesis blocked/unsupported:', err);
  }
}

export default function App() {
  // Navigation & Theme & UI controls
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // File Upload states
  const [uploadedFiles, setUploadedFiles] = useState<FileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User Auth & Accounts States
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'phone'>('signin');
  
  // Phone sign-in states
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<1 | 2>(1);
  const [otpTimer, setOtpTimer] = useState(300);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  // Google sign-in custom picker states
  const [showGooglePicker, setShowGooglePicker] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [selectedGoogleAccount, setSelectedGoogleAccount] = useState<any>(null);

  // Dynamic model-routing notification feedback
  const [routingFeedback, setRoutingFeedback] = useState<string>('');

  // Template Library states
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<PromptTemplate[]>(() => {
    try {
      const stored = localStorage.getItem('gocompux_custom_templates');
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  });
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<string>('All');
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  
  // Custom Template form values
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [newTemplateCat, setNewTemplateCat] = useState<'Developer' | 'Writing' | 'Business' | 'Creative' | 'Custom'>('Custom');
  
  // Sign In inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up inputs
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerAvatarColor, setRegisterAvatarColor] = useState('text-[#00F0FF]');
  
  // Tilt angles for Auth card mouse hover 3D effect
  const [authTilt, setAuthTilt] = useState({ x: 0, y: 0 });
  const authCardRef = useRef<HTMLDivElement>(null);

  // Auth feedback message
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Chat bot states
  const [selectedPersona, setSelectedPersona] = useState<string>('assistant');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite');
  const [streamEnabled, setStreamEnabled] = useState<boolean>(true);
  const [speedMode, setSpeedMode] = useState<boolean>(true);
  const [webSearchGrounding, setWebSearchGrounding] = useState<boolean>(true);
  const [lowBandwidthMode, setLowBandwidthMode] = useState<boolean>(false);
  const [autoDetectedSlowNetwork, setAutoDetectedSlowNetwork] = useState<boolean>(false);
  const [lastRequestLatency, setLastRequestLatency] = useState<number | null>(null);
  const [promptTokenHistory, setPromptTokenHistory] = useState<number[]>([]);
  const [responseTokenHistory, setResponseTokenHistory] = useState<number[]>([]);
  const [latencyStats, setLatencyStats] = useState<{
    timeToApi: number;
    apiDuration: number;
    ttft: number;
    serverOverhead?: number;
    geminiTtft?: number;
    geminiGenerationTime?: number;
    serverTotalTime?: number;
    modelUsed: string;
    promptTokens?: number;
    responseTokens?: number;
    cached?: boolean;
  } | null>(null);

  // Chat message container states
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [firebaseConfigError, setFirebaseConfigError] = useState<string | null>(null);
  const [firebaseDiagnostics, setFirebaseDiagnostics] = useState<{
    authInitialized: boolean;
    currentUserUid: string | null;
    authProviders: string[];
    errorType: 'auth' | 'firestore' | 'network' | 'config' | 'unknown' | null;
    errorCode: string | null;
    errorMessage: string | null;
    projectName: string;
    projectId: string;
  } | null>(null);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showScrollDown, setShowScrollDown] = useState<boolean>(false);

  // New Voice, Screenshot, and Sharing States/Refs
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [isCapturingScreen, setIsCapturingScreen] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const speechUtteranceRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Auto-resize the chat textarea based on its content.
   * Collapses to a single row when empty, grows up to MAX_TEXTAREA_HEIGHT,
   * then switches to internal scroll. Called on every input change.
   */
  const MAX_TEXTAREA_HEIGHT = 200; // ~8-10 lines
  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Reset height to auto so scrollHeight recalculates from content
    ta.style.height = 'auto';
    // Clamp to max height; CSS overflow-y handles scrolling beyond this
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  // Apply Light/Dark mode classes to index.html root
  useEffect(() => {
    const savedTheme = localStorage.getItem('gocompux_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('gocompux_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    playSynthesizedSound('click');
  };

  // Initialize and load user & chat history from localStorage
  useEffect(() => {
    // Load current active session user
    const savedUser = localStorage.getItem('gocompux_current_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error loading active user session');
      }
    }

    const savedSessions = localStorage.getItem('ai_chat_sessions');
    const savedSoundPref = localStorage.getItem('sound_enabled');
    const savedSpeedPref = localStorage.getItem('speed_mode_enabled');
    
    if (savedSoundPref !== null) {
      setSoundEnabled(savedSoundPref === 'true');
    }

    if (savedSpeedPref !== null) {
      setSpeedMode(savedSpeedPref === 'true');
    }

    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions) as ChatSession[];
        if (parsed.length > 0) {
          setChatSessions(parsed);
          setActiveSessionId(parsed[0].id);
          setSelectedPersona(parsed[0].persona || 'assistant');
          setSelectedModel(parsed[0].model || 'gemini-3.1-flash-lite');
          return;
        }
      } catch (e) {
        console.error('Error reading cache:', e);
      }
    }

    // Default initializer if no sessions exist
    const defaultSessionId = `session_${Date.now()}`;
    const defaultSession: ChatSession = {
      id: defaultSessionId,
      title: 'New Chat',
      persona: 'assistant',
      model: 'gemini-3.1-flash-lite',
      messages: [],
      createdAt: Date.now()
    };
    setChatSessions([defaultSession]);
    setActiveSessionId(defaultSessionId);
  }, []);

  // Sync state with Firebase Firestore when user changes
  useEffect(() => {
    testConnection(); // Verify connection on boot

    // Dynamic Network quality auto-detection
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      const isSlow = conn.saveData || ['cellular', '2g', '3g'].includes(conn.effectiveType) || (conn.downlink && conn.downlink < 1.5);
      if (isSlow) {
        setAutoDetectedSlowNetwork(true);
        setLowBandwidthMode(true);
        console.log(`[NETWORK OPT] Auto-detected low bandwidth connection (${conn.effectiveType || 'slow speed'}). Enabled low-bandwidth optimizations.`);
      }
    }
  }, []);

  useEffect(() => {
    const syncFirebase = async () => {
      // 1. Initial check for missing configuration
      if (!firebaseAppConfig || !firebaseAppConfig.projectId || !firebaseAppConfig.apiKey) {
        setFirebaseDiagnostics({
          authInitialized: false,
          currentUserUid: null,
          authProviders: [],
          errorType: 'config',
          errorCode: 'missing-config',
          errorMessage: 'Firebase configuration is incomplete or missing in firebase-applet-config.json.',
          projectName: 'Unknown',
          projectId: 'Unknown'
        });
        setFirebaseConfigError('missing-config');
        return;
      }

      if (!currentUser) {
        setFirebaseUid(null);
        setFirebaseConfigError(null);
        setFirebaseDiagnostics(null);
        return;
      }

      setIsSyncingFirebase(true);
      
      // Log the sanitized config (hides secrets such as API keys)
      logFirebaseConfig();

      try {
        const { uid, error } = await firebaseAuthSync(currentUser);
        
        // Log actual Auth state to the console
        logFirebaseAuthState();

        if (error) {
          console.warn("[FIREBASE CONFIG WARNING] Firebase auth sync returned warning:", error);
          const parsed = parseFirebaseError(error);
          setFirebaseDiagnostics({
            authInitialized: true, // Attempted to initialize and returned a warning/fallback status
            currentUserUid: uid,
            authProviders: uid ? ['anonymous'] : [],
            errorType: parsed.type === 'unknown' ? 'auth' : parsed.type,
            errorCode: parsed.code || 'auth-error',
            errorMessage: parsed.message,
            projectName: firebaseAppConfig.projectId,
            projectId: firebaseAppConfig.projectId
          });
          setFirebaseConfigError(parsed.message);
        } else {
          setFirebaseConfigError(null);
          setFirebaseDiagnostics({
            authInitialized: true,
            currentUserUid: uid,
            authProviders: uid ? ['password'] : [],
            errorType: null,
            errorCode: null,
            errorMessage: null,
            projectName: firebaseAppConfig.projectId,
            projectId: firebaseAppConfig.projectId
          });
        }

        if (uid) {
          setFirebaseUid(uid);
          
          // Save profile to users collection with isolated try-catch to detect Firestore permission errors
          try {
            await saveUserToFirestore(uid, currentUser);
          } catch (firestoreError: any) {
            console.error("Firestore Save User profile failed:", firestoreError);
            const parsed = parseFirebaseError(firestoreError);
            setFirebaseDiagnostics(prev => ({
              ...(prev || {
                authInitialized: true,
                currentUserUid: uid,
                authProviders: [],
                projectName: firebaseAppConfig.projectId,
                projectId: firebaseAppConfig.projectId
              }),
              errorType: parsed.type,
              errorCode: parsed.code || 'permission-denied',
              errorMessage: parsed.message
            }));
            setFirebaseConfigError(parsed.message);
            setIsSyncingFirebase(false);
            return; // Fail gracefully without clearing local sessions
          }
          
          // Load sessions from Firestore with isolated try-catch to detect Firestore permission errors
          try {
            const cloudSessions = await loadUserSessionsFromFirestore(uid);
            if (cloudSessions && cloudSessions.length > 0) {
              setChatSessions(cloudSessions);
              setActiveSessionId(cloudSessions[0].id);
              setSelectedPersona(cloudSessions[0].persona || 'assistant');
              setSelectedModel(cloudSessions[0].model || 'gemini-3.1-flash-lite');
            } else {
              // No sessions in Firestore yet, back up current localStorage sessions to Firestore
              for (const s of chatSessions) {
                await saveSessionMetadataToFirestore(uid, s);
                for (const msg of s.messages) {
                  await saveMessageToFirestore(uid, s.id, msg);
                }
              }
            }
          } catch (firestoreError: any) {
            console.error("Firestore Load Sessions failed:", firestoreError);
            const parsed = parseFirebaseError(firestoreError);
            setFirebaseDiagnostics(prev => ({
              ...(prev || {
                authInitialized: true,
                currentUserUid: uid,
                authProviders: [],
                projectName: firebaseAppConfig.projectId,
                projectId: firebaseAppConfig.projectId
              }),
              errorType: parsed.type,
              errorCode: parsed.code || 'permission-denied',
              errorMessage: parsed.message
            }));
            setFirebaseConfigError(parsed.message);
          }
        }
      } catch (error: any) {
        console.error("Failed to sync with Firebase Firestore (Outer Catch):", error);
        const parsed = parseFirebaseError(error);
        setFirebaseDiagnostics({
          authInitialized: true,
          currentUserUid: null,
          authProviders: [],
          errorType: parsed.type,
          errorCode: parsed.code || 'unknown-error',
          errorMessage: parsed.message,
          projectName: firebaseAppConfig.projectId,
          projectId: firebaseAppConfig.projectId
        });
        setFirebaseConfigError(parsed.message);
      } finally {
        setIsSyncingFirebase(false);
      }
    };

    syncFirebase();
  }, [currentUser]);

  // Sync sessions with localStorage and Firebase Firestore
  const saveSessionsToStorage = async (updatedSessions: ChatSession[]) => {
    setChatSessions(updatedSessions);
    localStorage.setItem('ai_chat_sessions', JSON.stringify(updatedSessions));

    if (currentUser && firebaseUid) {
      try {
        for (const s of updatedSessions) {
          const currentS = chatSessions.find(prev => prev.id === s.id);
          
          // 1. If session is new or metadata changed, save/update metadata
          if (!currentS || currentS.title !== s.title || currentS.persona !== s.persona || currentS.model !== s.model) {
            await saveSessionMetadataToFirestore(firebaseUid, s);
          }
          
          // 2. Save any new messages
          const prevMessages = currentS ? currentS.messages : [];
          const newMessages = s.messages.filter(msg => !prevMessages.some(prevMsg => prevMsg.id === msg.id));
          
          for (const msg of newMessages) {
            await saveMessageToFirestore(firebaseUid, s.id, msg);
          }
        }
      } catch (error) {
        console.error("Failed to sync session write with Firestore:", error);
      }
    }
  };

  const getActiveSession = (): ChatSession | undefined => {
    return chatSessions.find(s => s.id === activeSessionId);
  };

  // Import Shared Chat from URL query parameter
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedChatData = params.get('shared_chat');
      if (sharedChatData) {
        const decodedString = decodeURIComponent(atob(sharedChatData));
        const decoded = JSON.parse(decodedString);
        if (decoded && decoded.messages) {
          const importedSessionId = `shared_${Date.now()}`;
          const importedSession: ChatSession = {
            id: importedSessionId,
            title: `Shared: ${decoded.title || 'Conversation'}`,
            persona: decoded.persona || 'assistant',
            model: decoded.model || 'gemini-3.5-flash',
            messages: decoded.messages,
            createdAt: Date.now()
          };

          setChatSessions(prev => {
            const exists = prev.some(s => JSON.stringify(s.messages) === JSON.stringify(importedSession.messages));
            if (exists) return prev;
            const updated = [importedSession, ...prev];
            localStorage.setItem('ai_chat_sessions', JSON.stringify(updated));
            return updated;
          });
          
          setActiveSessionId(importedSessionId);
          setSelectedPersona(importedSession.persona || 'assistant');
          setSelectedModel(importedSession.model || 'gemini-3.5-flash');

          // Clean parameters so reloading doesn't duplicate
          window.history.replaceState({}, document.title, window.location.pathname);

          setAuthSuccess('Successfully imported shared conversation!');
          setTimeout(() => setAuthSuccess(''), 4000);
        }
      }
    } catch (err) {
      console.error('Failed to parse shared chat parameter', err);
    }
  }, []);

  const handleShareChat = () => {
    playSynthesizedSound('click');
    const active = getActiveSession();
    if (!active || active.messages.length === 0) {
      alert("Please send a message first to generate a shareable URL!");
      return;
    }

    try {
      const shareData = {
        title: active.title,
        persona: active.persona,
        model: active.model,
        messages: active.messages
      };

      const base64Str = btoa(encodeURIComponent(JSON.stringify(shareData)));
      const shareUrl = `${window.location.origin}${window.location.pathname}?shared_chat=${base64Str}`;

      navigator.clipboard.writeText(shareUrl).then(() => {
        setShareCopied(true);
        setAuthSuccess('Share URL copied to clipboard!');
        setTimeout(() => {
          setShareCopied(false);
          setAuthSuccess('');
        }, 3000);
      });
    } catch (err) {
      console.error('Failed to copy share link', err);
    }
  };

  const startVoiceInput = () => {
    playSynthesizedSound('click');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome/Edge/Safari.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(prev => prev + (prev ? ' ' : '') + transcript);
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error', event);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const speakText = (text: string, messageId: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking === messageId) {
        window.speechSynthesis.cancel();
        setIsSpeaking(null);
        return;
      }
      window.speechSynthesis.cancel();

      // Strip markdown syntax
      const cleanText = text.replace(/[*#`_\-]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);

      utterance.onend = () => {
        setIsSpeaking(null);
      };
      utterance.onerror = () => {
        setIsSpeaking(null);
      };

      setIsSpeaking(messageId);
      speechUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in this browser.");
    }
  };

  const captureScreenshot = async () => {
    playSynthesizedSound('click');
    setIsCapturingScreen(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser"
        },
        audio: false
      });

      const video = document.createElement('video');
      video.autoplay = true;
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      await new Promise((r) => setTimeout(r, 200));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      stream.getTracks().forEach(track => track.stop());

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64String = dataUrl.split(',')[1];

      const newAttachment: FileAttachment = {
        name: `screenshot_${Date.now()}.jpg`,
        size: Math.round((base64String.length * 3) / 4),
        type: 'image/jpeg',
        data: base64String
      };

      setUploadedFiles(prev => [...prev, newAttachment]);
      setAuthSuccess('Screen captured and attached successfully!');
      setTimeout(() => setAuthSuccess(''), 3000);
      playSynthesizedSound('receive');
    } catch (err: any) {
      console.error('Screenshot capture failed:', err);
    } finally {
      setIsCapturingScreen(false);
    }
  };

  // 3D Auth hover tilt physics handler
  const handleAuthMouseMove = (e: React.MouseEvent) => {
    if (!authCardRef.current) return;
    const rect = authCardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;
    // Map coordinates to 15 degrees max tilt
    const tiltX = -(mouseY / (height / 2)) * 12;
    const tiltY = (mouseX / (width / 2)) * 12;
    setAuthTilt({ x: tiltX, y: tiltY });
  };

  const handleAuthMouseLeave = () => {
    setAuthTilt({ x: 0, y: 0 });
  };

  // Sign In submit
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Please enter both email and password.');
      return;
    }

    const registeredUsersString = localStorage.getItem('gocompux_registered_users') || '[]';
    let users: UserAccount[] = [];
    try {
      users = JSON.parse(registeredUsersString);
    } catch (_) {}

    const foundUser = users.find(u => u.email.toLowerCase() === loginEmail.trim().toLowerCase());
    
    if (!foundUser || foundUser.password !== loginPassword) {
      setAuthError('Invalid credentials. Double check or Sign Up!');
      playSynthesizedSound('click');
      return;
    }

    setAuthSuccess(`Welcome back, ${foundUser.name}!`);
    playSynthesizedSound('receive');
    
    setTimeout(() => {
      const activeUserSession: UserAccount = {
        name: foundUser.name,
        email: foundUser.email,
        avatarColor: foundUser.avatarColor
      };
      setCurrentUser(activeUserSession);
      localStorage.setItem('gocompux_current_user', JSON.stringify(activeUserSession));
      setAuthSuccess('');
    }, 1000);
  };

  // Sign Up submit
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!registerName.trim() || !registerEmail.trim() || !registerPassword.trim()) {
      setAuthError('All registration fields are required.');
      return;
    }

    if (registerPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    const registeredUsersString = localStorage.getItem('gocompux_registered_users') || '[]';
    let users: UserAccount[] = [];
    try {
      users = JSON.parse(registeredUsersString);
    } catch (_) {}

    const emailExists = users.some(u => u.email.toLowerCase() === registerEmail.trim().toLowerCase());
    if (emailExists) {
      setAuthError('An account with this email already exists.');
      return;
    }

    const newUser: UserAccount = {
      name: registerName.trim(),
      email: registerEmail.trim(),
      password: registerPassword,
      avatarColor: registerAvatarColor
    };

    users.push(newUser);
    localStorage.setItem('gocompux_registered_users', JSON.stringify(users));

    setAuthSuccess('Registration completed! Redirecting...');
    playSynthesizedSound('receive');

    setTimeout(() => {
      const activeUserSession: UserAccount = {
        name: newUser.name,
        email: newUser.email,
        avatarColor: newUser.avatarColor
      };
      setCurrentUser(activeUserSession);
      localStorage.setItem('gocompux_current_user', JSON.stringify(activeUserSession));
      setAuthSuccess('');
      // Clean up fields
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
    }, 1200);
  };

  // Google Single-Sign-On Simulation
  const handleGoogleSignIn = () => {
    setAuthError('');
    setAuthSuccess('');
    playSynthesizedSound('click');
    setShowGooglePicker(true);
  };

  const selectGoogleAccount = (account: { name: string; email: string; avatarColor: string }) => {
    setSelectedGoogleAccount(account);
    setIsGoogleSigningIn(true);
    playSynthesizedSound('send');
    
    setTimeout(() => {
      const googleUser: UserAccount = {
        name: account.name,
        email: account.email,
        avatarColor: account.avatarColor
      };
      
      const registeredUsersString = localStorage.getItem('gocompux_registered_users') || '[]';
      let users: UserAccount[] = [];
      try { users = JSON.parse(registeredUsersString); } catch (_) {}
      
      if (!users.some(u => u.email === googleUser.email)) {
        users.push(googleUser);
        localStorage.setItem('gocompux_registered_users', JSON.stringify(users));
      }
      
      setAuthSuccess(`Google Authentication successful! Welcome, ${account.name}.`);
      playSynthesizedSound('receive');
      
      setTimeout(() => {
        setCurrentUser(googleUser);
        localStorage.setItem('gocompux_current_user', JSON.stringify(googleUser));
        setAuthSuccess('');
        setShowGooglePicker(false);
        setIsGoogleSigningIn(false);
        setSelectedGoogleAccount(null);
      }, 1000);
    }, 1500);
  };

  // Format countdown timer nicely as m:ss (or s if small)
  const formatOtpTimer = (seconds: number) => {
    if (seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Phone Authentication Initiator
  const handlePhoneInitiate = () => {
    setAuthMode('phone');
    setPhoneStep(1);
    setPhoneNumber('');
    setPhoneOtp('');
    setOtpTimer(300); // 5 minutes expiration
    setAuthError('');
    setAuthSuccess('');
    playSynthesizedSound('click');
  };

  // Phone Step 1: Send Secure OTP via Server-side SMS Dispatcher
  const handlePhoneSendOtp = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneNumber.trim()) {
      setAuthError('Please enter a valid phone number.');
      return;
    }
    setAuthError('');
    setIsSendingOtp(true);
    playSynthesizedSound('send');

    // Combine prefix and digits
    const fullPhone = countryCode + phoneNumber.trim();

    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone })
      });

      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.error || 'Failed to dispatch verification code.');
        playSynthesizedSound('click');
        return;
      }

      setPhoneStep(2);
      setOtpTimer(300); // 5 minutes expiration on success

      if (data.warning) {
        setAuthSuccess(data.warning);
      } else {
        setAuthSuccess('Secure OTP verification code sent successfully via SMS!');
      }

      playSynthesizedSound('receive');
      setTimeout(() => setAuthSuccess(''), 5000);
    } catch (err) {
      console.error('Error sending SMS OTP:', err);
      setAuthError('Unable to connect to the secure authentication server.');
      playSynthesizedSound('click');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Phone Step 2: Verify OTP via Server-side Validation
  const handlePhoneVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneOtp.trim()) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }
    if (otpTimer <= 0) {
      setAuthError('Your verification code has expired. Please request a new OTP.');
      playSynthesizedSound('click');
      return;
    }
    setAuthError('');
    playSynthesizedSound('send');
    setAuthSuccess('Verifying Secure Token...');

    const fullPhone = countryCode + phoneNumber.trim();

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone, code: phoneOtp.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.error || 'Invalid verification code.');
        setAuthSuccess('');
        playSynthesizedSound('click');
        return;
      }

      setAuthSuccess('Phone verification complete! Synchronizing profile...');
      playSynthesizedSound('receive');

      const phoneUser: UserAccount = {
        name: `Mobile Cadet ${phoneNumber.slice(-4) || '77'}`,
        email: `phone_${fullPhone.replace(/\D/g, '') || 'user'}@gocompux.com`,
        avatarColor: 'text-[#A05CFF]' // Beautiful cyber purple accent!
      };

      const registeredUsersString = localStorage.getItem('gocompux_registered_users') || '[]';
      let users: UserAccount[] = [];
      try { users = JSON.parse(registeredUsersString); } catch (_) {}

      if (!users.some(u => u.email === phoneUser.email)) {
        users.push(phoneUser);
        localStorage.setItem('gocompux_registered_users', JSON.stringify(users));
      }

      setTimeout(() => {
        setCurrentUser(phoneUser);
        localStorage.setItem('gocompux_current_user', JSON.stringify(phoneUser));
        setAuthSuccess('');
      }, 1000);
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setAuthError('Failed to communicate with verification server.');
      setAuthSuccess('');
      playSynthesizedSound('click');
    }
  };

  // Sign Out
  const handleSignOut = () => {
    setCurrentUser(null);
    setFirebaseUid(null);
    firebaseSignOut();
    setChatSessions([]);
    localStorage.removeItem('gocompux_current_user');
    playSynthesizedSound('click');
  };

  // Template Library Handlers
  const handleSaveCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplateContent.trim()) {
      return;
    }

    const tpl: PromptTemplate = {
      id: editingTemplate && editingTemplate.isCustom ? editingTemplate.id : `tpl_${Date.now()}`,
      title: newTemplateTitle.trim(),
      description: newTemplateDesc.trim(),
      content: newTemplateContent.trim(),
      category: newTemplateCat,
      isCustom: true
    };

    let nextTemplates: PromptTemplate[];
    const isEditing = editingTemplate && editingTemplate.isCustom;
    if (isEditing) {
      nextTemplates = customTemplates.map(t => t.id === editingTemplate.id ? tpl : t);
    } else {
      nextTemplates = [...customTemplates, tpl];
    }

    setCustomTemplates(nextTemplates);
    localStorage.setItem('gocompux_custom_templates', JSON.stringify(nextTemplates));
    
    // Reset Form
    setEditingTemplate(null);
    setNewTemplateTitle('');
    setNewTemplateDesc('');
    setNewTemplateContent('');
    setNewTemplateCat('Custom');
    
    playSynthesizedSound('receive');
  };

  const handleDeleteCustomTemplate = (id: string) => {
    const nextTemplates = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(nextTemplates);
    localStorage.setItem('gocompux_custom_templates', JSON.stringify(nextTemplates));
    playSynthesizedSound('click');
  };

  const handleApplyTemplate = (content: string) => {
    setInputMessage(content);
    setTemplatesOpen(false);
    playSynthesizedSound('send');
    
    // Auto-focus input textarea
    setTimeout(() => {
      const el = document.getElementById('chat-input');
      if (el) {
        el.focus();
      }
    }, 100);
  };

  const startEditTemplate = (tpl: PromptTemplate) => {
    setEditingTemplate(tpl);
    setNewTemplateTitle(tpl.title);
    setNewTemplateDesc(tpl.description);
    setNewTemplateContent(tpl.content);
    setNewTemplateCat(tpl.category);
    playSynthesizedSound('click');
  };

  const cancelEditTemplate = () => {
    setEditingTemplate(null);
    setNewTemplateTitle('');
    setNewTemplateDesc('');
    setNewTemplateContent('');
    setNewTemplateCat('Custom');
    playSynthesizedSound('click');
  };

  // Drag & drop / file picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(Array.from(files));
  };

  const processFiles = (files: File[]) => {
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert("File size limit is 10MB to maintain low bandwidth speed.");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        const newAttachment: FileAttachment = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64String
        };
        setUploadedFiles(prev => [...prev, newAttachment]);
        playSynthesizedSound('click');
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachedFile = (idx: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
    playSynthesizedSound('click');
  };

  // Toggle sound state
  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    localStorage.setItem('sound_enabled', String(newState));
    if (newState) {
      setTimeout(() => playSynthesizedSound('click'), 100);
    }
  };

  // Change Active Persona & preserve configuration inside current session if empty
  const handlePersonaChange = (personaId: string) => {
    setSelectedPersona(personaId);
    playSynthesizedSound('click');
    
    // Automatically turn search grounding ON when product authenticator is chosen
    if (personaId === 'product') {
      setWebSearchGrounding(true);
    }

    const active = getActiveSession();
    if (active && active.messages.length === 0) {
      const updated = chatSessions.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, persona: personaId };
        }
        return s;
      });
      saveSessionsToStorage(updated);
    }
  };

  // Change Active Model & preserve in empty session
  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    playSynthesizedSound('click');
    
    const active = getActiveSession();
    if (active && active.messages.length === 0) {
      const updated = chatSessions.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, model: modelName };
        }
        return s;
      });
      saveSessionsToStorage(updated);
    }
  };

  // Create a brand new empty session
  const createNewChat = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `${PERSONAS[selectedPersona].name} Chat`,
      persona: selectedPersona,
      model: selectedModel,
      messages: [],
      createdAt: Date.now()
    };
    
    saveSessionsToStorage([newSession, ...chatSessions]);
    setActiveSessionId(newId);
    setSidebarOpen(false);
    playSynthesizedSound('click');
  };

  // Keyboard Shortcuts: Ctrl+Enter (handled on textarea), Ctrl+N, Esc
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Escape closes panels/settings/templates
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setSettingsOpen(false);
        setTemplatesOpen(false);
        setEditingTemplate(null);
      }

      // Ctrl+N / Cmd+N starts a new chat
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewChat();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [chatSessions, selectedPersona, selectedModel]);

  // Phone Auth OTP countdown timer
  useEffect(() => {
    if (authMode === 'phone' && phoneStep === 2 && otpTimer > 0) {
      const interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [authMode, phoneStep, otpTimer]);

  // Delete a session
  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSynthesizedSound('click');

    const remaining = chatSessions.filter(s => s.id !== sessionId);
    
    if (currentUser && firebaseUid) {
      deleteSessionFromFirestore(firebaseUid, sessionId).catch(err => {
        console.error("Failed to delete session from Firestore:", err);
      });
    }
    
    if (remaining.length === 0) {
      const resetId = `session_${Date.now()}`;
      const defaultSession: ChatSession = {
        id: resetId,
        title: 'New Chat',
        persona: 'assistant',
        model: 'gemini-3.1-flash-lite',
        messages: [],
        createdAt: Date.now()
      };
      saveSessionsToStorage([defaultSession]);
      setActiveSessionId(resetId);
    } else {
      saveSessionsToStorage(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0].id);
        setSelectedPersona(remaining[0].persona || 'assistant');
        setSelectedModel(remaining[0].model || 'gemini-3.1-flash-lite');
      }
    }
  };

  // Switch session context
  const selectSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setSelectedPersona(session.persona || 'assistant');
    setSelectedModel(session.model || 'gemini-3.1-flash-lite');
    setSidebarOpen(false);
    playSynthesizedSound('click');
  };

  // Scroll logic helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 300;
    setShowScrollDown(isScrolledUp);
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeSessionId]);

  // Main input submission
  const handleSubmit = async (textToSend?: string) => {
    const userSubmitTime = Date.now();
    const messageContent = (textToSend || inputMessage).trim();
    if (!messageContent && uploadedFiles.length === 0) return;
    if (isGenerating) return;

    playSynthesizedSound('send');
    setInputMessage('');
    // Reset textarea height back to single line after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    const currentAttachments = [...uploadedFiles];
    setUploadedFiles([]); // clear attachment queue immediately

    setIsGenerating(true);

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      attachments: currentAttachments.map(f => ({ name: f.name, type: f.type }))
    };

    const active = getActiveSession();
    if (!active) return;

    // Append user message immediately
    const updatedMessages = [...active.messages, userMsg];
    let updatedSessionTitle = active.title;

    // Auto rename 'New Chat'
    if (active.messages.length === 0) {
      updatedSessionTitle = messageContent.length > 22 
        ? messageContent.substring(0, 20) + '...' 
        : messageContent || (currentAttachments.length > 0 ? `Uploaded: ${currentAttachments[0].name}` : 'New Session');
    }

    const nextSessions = chatSessions.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: updatedSessionTitle,
          messages: updatedMessages,
          persona: selectedPersona,
          model: selectedModel
        };
      }
      return s;
    });
    
    saveSessionsToStorage(nextSessions);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Prepare reply message block
    const botMsgId = `msg_${Date.now() + 1}`;
    const botMsg: Message = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1
    };

    // Insert empty reply shell
    const sessionsWithPlaceholder = chatSessions.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [...updatedMessages, botMsg], title: updatedSessionTitle };
      }
      return s;
    });
    setChatSessions(sessionsWithPlaceholder);

    const personaInfo = PERSONAS[selectedPersona];
    
    // 1. DYNAMIC AUTO-ROUTING ENGINE (Intelligent latency optimization based on prompt complexity)
    let finalModel = selectedModel;
    const lowerInput = messageContent.toLowerCase();
    
    // Check complexity criteria (lengths, heavy reasoning, coding terms)
    const complexIndicators = [
      'code', 'program', 'function', 'class', 'develop', 'write', 'implement',
      'algorithm', 'solve', 'math', 'calculate', 'formula', 'explain in detail',
      'deep study', 'analyze', 'reason', 'why', 'how to build', 'architecture'
    ];
    
    const isComplex = 
      messageContent.length > 180 || 
      complexIndicators.some(ind => lowerInput.includes(ind)) || 
      currentAttachments.length > 0;

    // Auto-routing model selector
    if (!isComplex) {
      // Simple, short conversational messages bypass heavyweight models to run on flash-lite at 500%+ speed
      finalModel = 'gemini-3.1-flash-lite';
      setRoutingFeedback('⚡ gocompuX Ultra-Fast Engine (Near Zero Latency)');
    } else {
      // Complex questions get routed to gemini-3.5-flash or user-selected premium model
      finalModel = selectedModel === 'gemini-3.1-flash-lite' ? 'gemini-3.5-flash' : selectedModel;
      setRoutingFeedback(`🧠 Deep Intelligence Engine (${finalModel})`);
    }
    
    // Auto-hide routing feedback after a brief delay
    setTimeout(() => setRoutingFeedback(''), 4000);

    // 2. DYNAMIC REAL-TIME & POST-CUTOFF GROUNDING DETECTOR
    // Automatically forces Google Search Grounding for queries about events/dates
    // after the model's creation, real-time data, or any information that may be stale.
    // Expanded keyword set per the Intelligent Knowledge & Automatic Web Search Policy.
    const postCutoffIndicators = [
      // Temporal / post-cutoff date references
      '2025', '2026', '2027', '2028',
      'today', 'yesterday', 'now', 'current', 'currently', 'latest', 'recent', 'recently',
      'live', 'real-time', 'breaking', 'daily updates',
      // News & events
      'news', 'announced', 'announcement', 'launched', 'released', 'discovered',
      'happened after', 'knowledge cutoff', 'model created',
      // People & politics
      'president', 'prime minister', 'election', 'government',
      // Sports & entertainment
      'champion', 'winner', 'score', 'match', 'game',
      // Financial & market data
      'stock', 'price', 'cost', 'availability', 'cryptocurrency', 'crypto',
      // Weather
      'weather', 'forecast', 'temperature',
      // Software & tech
      'update', 'updated', 'version', 'release', 'download', 'documentation',
      'api', 'github', 'official', 'changelog', 'patch', 'upgrade',
      // Search directives
      'search', 'google', 'find', 'look up', 'who is', 'what is the current', 'update on'
    ];
    
    const isPostCutoffQuery = postCutoffIndicators.some(indicator => lowerInput.includes(indicator)) || /\b(25|26)\b/.test(lowerInput);
    const finalUseWebSearch = webSearchGrounding || isPostCutoffQuery;
    
    if (isPostCutoffQuery && !webSearchGrounding) {
      setRoutingFeedback('🔍 Auto-Triggered Google Search Grounding (Post-Cutoff / Real-time Query)');
      setTimeout(() => setRoutingFeedback(''), 4000);
    }

    const finalStream = true; // Stream is ALWAYS true for instantaneous visual feedback chunk-by-chunk!

    // Build conversation array including current attachments
    // Optimize request context size on client side to reduce upload payload overhead (vital on low bandwidth)
    const clientHistoryLimit = lowBandwidthMode ? 5 : 10;
    const relevantClientMessages = updatedMessages.slice(-clientHistoryLimit);

    const backendMessages = relevantClientMessages.map((m, i) => {
      // For the last user message, we append the base64 attachments as expected by our express API
      if (i === relevantClientMessages.length - 1 && currentAttachments.length > 0) {
        return {
          role: m.role,
          content: m.content,
          attachments: currentAttachments.map(att => ({
            data: att.data,
            mimeType: att.type
          }))
        };
      }
      return {
        role: m.role,
        content: m.content
      };
    });

    const startTime = Date.now();
    const timeToApi = startTime - userSubmitTime;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Connection': 'keep-alive',
        'X-Client-Click-Time': String(userSubmitTime)
      };
      
      if (lowBandwidthMode) {
        headers['X-Low-Bandwidth'] = 'true';
      }
      if (autoDetectedSlowNetwork) {
        headers['X-Slow-Connection'] = 'true';
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: backendMessages,
          model: finalModel,
          systemInstruction: (() => {
            // Build the system instruction with persona context + knowledge/search policy
            let context = personaInfo.systemInstruction;
            if (lowBandwidthMode) {
              context = `You are ${personaInfo.name}. Prioritize extreme brevity and respond under 2 sentences.`;
            } else {
              if (currentUser) {
                context += ` The user is ${currentUser.name}.`;
              }
              // Append the Intelligent Knowledge & Automatic Web Search Policy.
              // This instructs the model HOW to reason about its own knowledge vs web results.
              context += `

## Knowledge & Web Search Policy
- Always answer from internal knowledge first for timeless, educational, mathematical, programming, scientific, writing, translation, and brainstorming tasks.
- When web search grounding results are provided, prioritize official websites, documentation, government sites, academic sources, and trusted news organizations.
- Compare information across multiple sources before answering. Never fabricate information.
- Clearly distinguish verified facts from assumptions.
- If internal knowledge is sufficient and accurate, use it directly. If it may be outdated or incomplete, rely on the web search grounding results.
- Structure answers with clear headings: Answer, Details, Sources (list URLs of sources used from grounding results when available).
- When discussing a person, place, landmark, product, company, or similar entity, mention that visual references may be available if relevant.`;
            }
            return context;
          })(),
          stream: finalStream,
          useWebSearch: finalUseWebSearch,
          thinkingLevel: speedMode ? 'MINIMAL' : undefined
        })
      });

      // Record first byte latency for adaptive auto-tuning
      const firstByteTime = Date.now() - startTime;
      setLastRequestLatency(firstByteTime);

      if (firstByteTime > 4000 && !lowBandwidthMode) {
        console.warn(`[LATENCY NOTICE] Slow connection detected (${firstByteTime}ms). Enabling adaptive Low-Bandwidth mode.`);
        setLowBandwidthMode(true);
        setAutoDetectedSlowNetwork(true);
      }

      if (!response.ok) {
        let errMsg = `Server returned HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {
          // Keep default error message if parsing fails
        }
        throw new Error(errMsg);
      }

      if (finalStream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let streamContent = '';
        let finalGroundingMetadata: any = null;
        let firstTokenTime = 0;
        
        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const innerData = line.substring(6).trim();
                if (innerData === '[DONE]') {
                  break;
                }
                try {
                  const parsed = JSON.parse(innerData);
                  
                  if (parsed.error) {
                    streamContent = parsed.error;
                  }
                  
                  if (parsed.text) {
                    if (firstTokenTime === 0) {
                      firstTokenTime = Date.now();
                    }
                    streamContent += parsed.text;
                  }
                  
                  if (parsed.groundingMetadata) {
                    finalGroundingMetadata = parsed.groundingMetadata;
                  }

                  if (parsed.stats) {
                    const routeDuration = Date.now() - startTime;
                    const ttft = firstTokenTime > 0 ? firstTokenTime - startTime : routeDuration;
                    
                    console.log('%c⚡ GEMINI LATENCY OPTIMIZATION REPORT ⚡', 'color: #00F0FF; font-weight: bold; font-size: 13px;');
                    console.log(`%c* Model Used: %c${parsed.stats.model}`, 'color: #8A99AD', 'color: #FFF; font-weight: bold;');
                    console.log(`%c* Click-to-API delay: %c${timeToApi}ms`, 'color: #8A99AD', 'color: #38BDF8;');
                    console.log(`%c* Server-side startup overhead: %c${parsed.stats.serverOverhead}ms`, 'color: #8A99AD', 'color: #A78BFA;');
                    console.log(`%c* Gemini API TTFT: %c${parsed.stats.geminiTtft}ms`, 'color: #8A99AD', 'color: #34D399; font-weight: bold;');
                    console.log(`%c* Client-side TTFT (inc. network): %c${ttft}ms`, 'color: #8A99AD', 'color: #34D399; font-weight: bold;');
                    console.log(`%c* Gemini API Generation time: %c${parsed.stats.geminiGenerationTime}ms`, 'color: #8A99AD', 'color: #FBBF24;');
                    console.log(`%c* Total Request duration: %c${routeDuration}ms`, 'color: #8A99AD', 'color: #FB7185; font-weight: bold;');
                    
                    if (parsed.stats.usageMetadata) {
                      console.log(`%c* Prompt tokens: %c${parsed.stats.usageMetadata.promptTokenCount}`, 'color: #8A99AD', 'color: #FFF;');
                      console.log(`%c* Response tokens: %c${parsed.stats.usageMetadata.candidatesTokenCount}`, 'color: #8A99AD', 'color: #FFF;');
                    }

                    setLatencyStats({
                      timeToApi,
                      apiDuration: routeDuration,
                      ttft,
                      serverOverhead: parsed.stats.serverOverhead,
                      geminiTtft: parsed.stats.geminiTtft,
                      geminiGenerationTime: parsed.stats.geminiGenerationTime,
                      serverTotalTime: parsed.stats.serverTotalTime,
                      modelUsed: parsed.stats.model,
                      promptTokens: parsed.stats.usageMetadata?.promptTokenCount,
                      responseTokens: parsed.stats.usageMetadata?.candidatesTokenCount,
                      cached: parsed.stats.cached
                    });

                    if (parsed.stats.usageMetadata) {
                      setPromptTokenHistory(prev => [...prev, parsed.stats.usageMetadata.promptTokenCount].slice(-20));
                      setResponseTokenHistory(prev => [...prev, parsed.stats.usageMetadata.candidatesTokenCount].slice(-20));
                    }
                  }

                  // Update active placeholder content incrementally
                  setChatSessions(currentSessions => 
                    currentSessions.map(s => {
                      if (s.id === activeSessionId) {
                        const modifiedMessages = s.messages.map(m => {
                          if (m.id === botMsgId) {
                            return { 
                              ...m, 
                              content: streamContent,
                              groundingMetadata: finalGroundingMetadata || m.groundingMetadata
                            };
                          }
                          return m;
                        });
                        return { ...s, messages: modifiedMessages };
                      }
                      return s;
                    })
                  );
                  scrollToBottom('smooth');
                } catch (e) {
                  // Fallback for incomplete fragments
                }
              }
            }
          }
        }
        
        // Finalize state save in local storage
        const finalizedSessions = chatSessions.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [
                ...updatedMessages,
                { 
                  ...botMsg, 
                  content: streamContent,
                  groundingMetadata: finalGroundingMetadata 
                }
              ],
              title: updatedSessionTitle
            };
          }
          return s;
        });
        saveSessionsToStorage(finalizedSessions);
        playSynthesizedSound('receive');
      } else {
        const result = await response.json();
        const finalAnswer = result.text || 'No response generated.';
        const groundingMetadata = result.groundingMetadata || null;
        
        if (result.stats) {
          const routeDuration = Date.now() - startTime;
          setLatencyStats({
            timeToApi,
            apiDuration: routeDuration,
            ttft: routeDuration,
            serverOverhead: result.stats.serverOverhead,
            geminiTtft: result.stats.geminiTtft,
            geminiGenerationTime: 0,
            serverTotalTime: result.stats.serverTotalTime,
            modelUsed: result.stats.model,
            promptTokens: result.stats.usageMetadata?.promptTokenCount,
            responseTokens: result.stats.usageMetadata?.candidatesTokenCount
          });
          if (result.stats.usageMetadata) {
            setPromptTokenHistory(prev => [...prev, result.stats.usageMetadata.promptTokenCount].slice(-20));
            setResponseTokenHistory(prev => [...prev, result.stats.usageMetadata.candidatesTokenCount].slice(-20));
          }
        }

        const finalSessions = chatSessions.map(s => {
          if (s.id === activeSessionId) {
            const modified = s.messages.map(m => {
              if (m.id === botMsgId) {
                return { ...m, content: finalAnswer, groundingMetadata };
              }
              return m;
            });
            return { ...s, messages: modified, title: updatedSessionTitle };
          }
          return s;
        });
        saveSessionsToStorage(finalSessions);
        playSynthesizedSound('receive');
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    } catch (err: any) {
      console.error('Fetch reply failed:', err);
      const errMessage = `Error: ${err.message || 'Unable to fetch reply. Verify your backend service and API credentials.'}`;
      
      const errorSessions = chatSessions.map(s => {
        if (s.id === activeSessionId) {
          const modified = s.messages.map(m => {
            if (m.id === botMsgId) {
              return { ...m, content: errMessage };
            }
            return m;
          });
          return { ...s, messages: modified };
        }
        return s;
      });
      saveSessionsToStorage(errorSessions);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle retrying a failed message connection
  const handleRetry = async (errorMsgIdx: number) => {
    const active = getActiveSession();
    if (!active) return;
    
    const userMsg = active.messages[errorMsgIdx - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    
    playSynthesizedSound('click');
    const cleanedMessages = active.messages.slice(0, errorMsgIdx - 1);
    
    const tempSessions = chatSessions.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: cleanedMessages };
      }
      return s;
    });
    setChatSessions(tempSessions);
    
    await handleSubmit(userMsg.content);
  };

  const activeSession = getActiveSession();
  const currentPersonaInfo = PERSONAS[selectedPersona];
  const isDark = theme === 'dark';

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#0A0E1A] text-slate-100' : 'bg-[#F8FAFC] text-slate-800'
    }`}>
      <CursorTrail />
      
      {/* AUTHENTICATION ROUTE / 3D PORTAL (IF NOT LOGGED IN) */}
      <AnimatePresence mode="wait">
        {!currentUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-gradient-to-tr from-[#020617] via-[#0b1329] to-[#030712] overflow-y-auto"
          >
            {/* Background floating particle blobs */}
            <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-500/10 blur-[130px] pointer-events-none [animation-delay:2s]"></div>
            
            {/* 3D Perspective Card Container */}
            <div 
              className="w-full max-w-md perspective-1000 py-2 sm:py-6 my-auto"
              onMouseMove={handleAuthMouseMove}
              onMouseLeave={handleAuthMouseLeave}
            >
              {/* Outer 3D Rotatable Box */}
              <motion.div
                ref={authCardRef}
                style={{
                  transform: `rotateX(${authTilt.x}deg) rotateY(${authTilt.y}deg)`,
                  transition: authTilt.x === 0 ? 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)' : 'none'
                }}
                className="relative w-full max-h-[94vh] overflow-y-auto custom-scrollbar rounded-2xl bg-[#111930]/90 backdrop-blur-2xl border border-white/10 p-4 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform-style-3d hover:border-blue-500/30 transition-all duration-300"
              >
                {/* Logo & Portal Header */}
                <div className="flex flex-col items-center text-center space-y-1 mb-3 sm:mb-5 select-none">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-float">
                    <Bot className="w-5.5 h-5.5 text-white" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white bg-gradient-to-r from-white to-cyan-300 bg-clip-text text-transparent">
                    gocompuX Portal Core
                  </h2>
                  <p className="text-[10px] text-slate-400 max-w-[280px]">
                    To access the premium interactive AI portal, please authenticate below.
                  </p>
                </div>

                {/* Switcher Tab */}
                <div className="flex p-0.5 bg-[#090d1a]/80 border border-white/5 rounded-lg mb-4">
                  <button
                    onClick={() => {
                      setAuthMode('signin');
                      setAuthError('');
                      setAuthSuccess('');
                      playSynthesizedSound('click');
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-md text-[11px] font-semibold tracking-wide transition duration-200 cursor-pointer ${
                      authMode === 'signin'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    SIGN IN
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthError('');
                      setAuthSuccess('');
                      playSynthesizedSound('click');
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-md text-[11px] font-semibold tracking-wide transition duration-200 cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    CREATE ACCOUNT
                  </button>
                </div>

                {/* Form Elements */}
                <AnimatePresence mode="wait">
                  {authMode === 'signin' ? (
                    <motion.form
                      key="signin-form"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      onSubmit={handleSignIn}
                      className="space-y-3"
                    >
                      {/* Email input */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Email Address
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            name="email"
                            required
                            autoComplete="username"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            placeholder="name@gocompux.com"
                            className="w-full bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                          />
                        </div>
                      </div>

                      {/* Password Input */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Portal Password
                        </label>
                        <div className="relative">
                          <input
                            type={showLoginPassword ? 'text' : 'password'}
                            name="password"
                            required
                            autoComplete="current-password"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl pl-3 pr-10 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                          >
                            {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Sign In Button */}
                      <button
                        type="submit"
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold text-xs tracking-wide shadow-lg shadow-blue-500/20 hover:shadow-cyan-500/30 active:scale-[0.98] transition duration-200 cursor-pointer flex items-center justify-center gap-2 mt-1"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Initialize Connection</span>
                      </button>

                      {/* Federated Identity & Phone OTP */}
                      <div className="relative my-2 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-white/5"></div>
                        </div>
                        <span className="relative bg-[#111930] px-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                          Or Connect Via
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[11px] transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                          title="Continue with Google Account"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span>Google</span>
                        </button>
                        <button
                          type="button"
                          onClick={handlePhoneInitiate}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[11px] transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                          title="Verify using Phone OTP"
                        >
                          <Phone className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Phone OTP</span>
                        </button>
                      </div>
                    </motion.form>
                  ) : authMode === 'signup' ? (
                    <motion.form
                      key="signup-form"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onSubmit={handleSignUp}
                      className="space-y-3"
                    >
                      {/* Name input */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Full Name
                        </label>
                        <input
                          type="text"
                          name="name"
                          required
                          autoComplete="name"
                          value={registerName}
                          onChange={(e) => setRegisterName(e.target.value)}
                          placeholder="Your Name"
                          className="w-full bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                        />
                      </div>

                      {/* Email input */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Email Address
                        </label>
                        <input
                          type="email"
                          name="email"
                          required
                          autoComplete="email"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          placeholder="newbie@gocompux.com"
                          className="w-full bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                        />
                      </div>

                      {/* Password Input */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Password (Min 6 chars)
                        </label>
                        <div className="relative">
                          <input
                            type={showRegisterPassword ? 'text' : 'password'}
                            name="password"
                            required
                            autoComplete="new-password"
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl pl-3 pr-10 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                          >
                            {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Color badge theme picker */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Choose Core Color Accent
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { color: 'text-[#00F0FF]', label: 'Cyan' },
                            { color: 'text-[#FF5294]', label: 'Pink' },
                            { color: 'text-[#F59E0B]', label: 'Amber' },
                            { color: 'text-[#A05CFF]', label: 'Purple' }
                          ].map(col => (
                            <button
                              key={col.color}
                              type="button"
                              onClick={() => setRegisterAvatarColor(col.color)}
                              className={`py-1 px-1 rounded-lg text-[9px] font-medium border text-center cursor-pointer transition ${
                                registerAvatarColor === col.color
                                  ? 'bg-blue-950/40 border-cyan-400 text-white'
                                  : 'bg-transparent border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {col.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sign Up Button */}
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold text-xs tracking-wide shadow-lg shadow-blue-500/20 hover:shadow-cyan-500/30 active:scale-[0.98] transition duration-200 cursor-pointer flex items-center justify-center gap-2 mt-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Register Account</span>
                      </button>

                      {/* Federated Identity & Phone OTP */}
                      <div className="relative my-2 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-white/5"></div>
                        </div>
                        <span className="relative bg-[#111930] px-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                          Or Connect Via
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[11px] transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                          title="Continue with Google Account"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span>Google</span>
                        </button>
                        <button
                          type="button"
                          onClick={handlePhoneInitiate}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[11px] transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                          title="Verify using Phone OTP"
                        >
                          <Phone className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Phone OTP</span>
                        </button>
                      </div>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="phone-form"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      onSubmit={phoneStep === 1 ? handlePhoneSendOtp : handlePhoneVerifyOtp}
                      className="space-y-3"
                    >
                      <h3 className="text-xs font-bold text-[#00F0FF] tracking-wider uppercase flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span>Phone OTP Verification</span>
                      </h3>
                      
                      {phoneStep === 1 ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                              Mobile Number
                            </label>
                            <div className="flex gap-1.5">
                              <select 
                                value={countryCode}
                                onChange={(e) => setCountryCode(e.target.value)}
                                className="bg-[#070b14]/70 border border-white/10 rounded-xl px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 transition"
                              >
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+91">🇮🇳 +91</option>
                                <option value="+44">🇬🇧 +44</option>
                                <option value="+81">🇯🇵 +81</option>
                                <option value="+49">🇩🇪 +49</option>
                                <option value="+33">🇫🇷 +33</option>
                                <option value="+61">🇦🇺 +61</option>
                                <option value="+65">🇸🇬 +65</option>
                                <option value="+82">🇰🇷 +82</option>
                                <option value="+971">🇦🇪 +971</option>
                              </select>
                              <input
                                type="tel"
                                required
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="987 654 3210"
                                className="flex-1 bg-[#070b14]/70 text-white placeholder-slate-500 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={isSendingOtp}
                            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold text-xs tracking-wide shadow-lg shadow-cyan-500/10 active:scale-[0.98] transition duration-200 cursor-pointer flex items-center justify-center gap-2"
                          >
                            {isSendingOtp ? 'Sending code...' : 'Send OTP Verification Code'}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                              6-Digit Verification Code
                            </label>
                            <input
                              type="text"
                              maxLength={6}
                              required
                              value={phoneOtp}
                              onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                              placeholder="123456"
                              className="w-full bg-[#070b14]/70 text-center tracking-[12px] text-lg font-bold text-white placeholder-slate-600 border border-white/10 rounded-xl px-3 py-2 focus:border-cyan-400 focus:outline-none transition"
                            />
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
                            {otpTimer > 0 ? (
                              <span>Code expires in: <span className="font-bold text-cyan-400">{formatOtpTimer(otpTimer)}</span></span>
                            ) : (
                              <span className="text-rose-400 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                                Code expired!
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={otpTimer > 180} // rate limit/cooldown resends so they can't spam it (min 2 minutes remaining)
                              onClick={handlePhoneSendOtp}
                              className={`font-semibold ${otpTimer > 180 ? 'text-slate-600' : 'text-cyan-400 hover:underline cursor-pointer'}`}
                            >
                              Resend OTP
                            </button>
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-xs tracking-wide shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition duration-200 cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Verify & Connect Profile</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signin');
                          setAuthError('');
                          setAuthSuccess('');
                        }}
                        className="w-full text-center text-[10px] text-slate-400 hover:text-white pt-2 block"
                      >
                        Back to Core Sign In
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Error and Success alerts with smooth entry */}
                <AnimatePresence>
                  {authError && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{authError}</span>
                    </motion.div>
                  )}
                  {authSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{authSuccess}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Google Account Selection Modal Overlay */}
                <AnimatePresence>
                  {showGooglePicker && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full max-w-sm bg-white text-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-100 relative"
                      >
                        <div className="flex flex-col items-center text-center space-y-2 mb-4 select-none">
                          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <h3 className="text-lg font-bold text-slate-800">Choose an account</h3>
                          <p className="text-[11px] text-slate-500">
                            to continue to <span className="font-semibold text-slate-700">gocompuX Portal</span>
                          </p>
                        </div>

                        {isGoogleSigningIn ? (
                          <div className="flex flex-col items-center justify-center py-8 space-y-3">
                            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-semibold text-slate-600">
                              Signing you in to gocompuX...
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                            {[
                              { name: 'Kempegowda KV', email: 'kempegowdakv77@gmail.com', avatarColor: 'text-[#FF5294]' },
                              { name: 'Kempegowda KV (Work)', email: 'kempegowda.kv@gocompux.com', avatarColor: 'text-[#A05CFF]' }
                            ].map((account) => (
                              <button
                                key={account.email}
                                type="button"
                                onClick={() => selectGoogleAccount(account)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 border border-slate-100 rounded-xl transition text-left cursor-pointer active:scale-[0.99]"
                              >
                                <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm shrink-0">
                                  {account.name[0]}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-800 truncate">{account.name}</div>
                                  <div className="text-[11px] text-slate-500 truncate">{account.email}</div>
                                </div>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold border border-slate-200 shrink-0">
                                  Signed In
                                </span>
                              </button>
                            ))}

                            <button
                              type="button"
                              onClick={() => {
                                playSynthesizedSound('click');
                                alert("In this sandbox environment, you can sign in instantly with any of the detected active accounts listed above.");
                              }}
                              className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 border border-transparent rounded-xl transition text-left cursor-pointer active:scale-[0.99] mt-1"
                            >
                              <div className="w-9 h-9 rounded-full bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-slate-500 shrink-0">
                                <UserPlus className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-slate-600">Use another account</div>
                              </div>
                            </button>
                          </div>
                        )}

                        <div className="text-[9px] text-slate-400 mt-5 pt-3 border-t border-slate-100 leading-relaxed text-center select-none">
                          To continue, Google will share your name, email address, language preference, and profile picture with gocompuX. Before using this app, you can review its <a href="#" className="text-blue-500 hover:underline">privacy policy</a> and <a href="#" className="text-blue-500 hover:underline">terms of service</a>.
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            playSynthesizedSound('click');
                            setShowGooglePicker(false);
                          }}
                          className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-[11px] transition cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>



              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SIDEBAR CONTAINER */}
      <aside 
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r flex flex-col transition-transform duration-300 transform md:translate-x-0 md:static md:z-0 ${
          isDark 
            ? 'bg-[#101626] border-[#1F2C4C]' 
            : 'bg-slate-100 border-slate-200 text-slate-800'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDark ? 'border-[#1F2C4C]' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center shadow-lg shadow-blue-500/10">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className={`font-bold text-base tracking-wide bg-gradient-to-r ${
              isDark ? 'from-white to-[#00F0FF]' : 'from-slate-800 to-blue-600'
            } bg-clip-text text-transparent`}>
              gocompuX Portal
            </span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className={`md:hidden p-1.5 rounded-lg transition ${
              isDark ? 'hover:bg-[#1C263F] text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Button */}
        <div className="p-4 shrink-0">
          <button
            id="btn-new-chat"
            onClick={createNewChat}
            className={`w-full py-3 px-4 rounded-xl border font-medium flex items-center justify-center gap-2 shadow-lg transition duration-300 cursor-pointer text-sm ${
              isDark
                ? 'bg-gradient-to-r from-[#1E293B] to-[#1E293B] hover:from-[#3B82F6] hover:to-[#2563EB] border-[#2D3F69] hover:border-[#3B82F6] text-white hover:shadow-blue-500/10'
                : 'bg-white hover:bg-blue-600 hover:text-white border-slate-300 hover:border-blue-600 text-slate-700 shadow-slate-100'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Session</span>
          </button>
        </div>

        {/* Sessions scroll list */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5 custom-scrollbar">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider select-none">
            Recent Convos
          </div>
          {chatSessions.map((session) => {
            const isSelected = session.id === activeSessionId;
            const sessionPersona = PERSONAS[session.persona || 'assistant'];
            const PersonaIcon = sessionPersona ? sessionPersona.icon : Sparkles;
            const avatarColor = sessionPersona ? sessionPersona.avatarColor : 'text-[#00F0FF]';

            return (
              <div
                key={session.id}
                onClick={() => selectSession(session)}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition duration-200 select-none ${
                  isSelected 
                    ? isDark ? 'bg-[#1D2844] border border-[#2C3E6B]' : 'bg-white border border-slate-300 shadow-sm'
                    : isDark ? 'hover:bg-[#161F33] border border-transparent' : 'hover:bg-slate-200/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`p-1.5 rounded-lg shrink-0 ${
                    isSelected ? isDark ? 'bg-slate-900' : 'bg-slate-50' : isDark ? 'bg-[#1C263F]' : 'bg-slate-200'
                  }`}>
                    <PersonaIcon className={`w-4 h-4 ${avatarColor}`} />
                  </div>
                  <div className={`truncate text-sm font-medium ${
                    isDark ? 'text-slate-200 group-hover:text-white' : 'text-slate-700 group-hover:text-slate-900'
                  }`}>
                    {session.title}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteSession(session.id, e)}
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition duration-150 ml-1.5 shrink-0`}
                  title="Delete chat session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* User Account / Sign Out Section */}
        {currentUser && (
          <div className={`p-4 border-t ${
            isDark ? 'border-[#1F2C4C] bg-[#0E1322]/50' : 'border-slate-200 bg-slate-200/30'
          } space-y-3 shrink-0`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-full bg-slate-800 border flex items-center justify-center shrink-0 text-sm font-bold ${currentUser.avatarColor}`}>
                  {currentUser.name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {currentUser.email}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className={`p-1.5 rounded-lg transition ${
                  isDark ? 'hover:bg-[#1E294B] text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-600 hover:text-slate-800'
                }`}
                title="Disconnect Core Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Secure Tunnel Active
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        ></div>
      )}

      {/* MAIN VIEW AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* HEADER */}
        <header className={`h-16 border-b flex items-center justify-between px-4 md:px-6 z-20 shrink-0 transition-colors duration-300 ${
          isDark ? 'bg-[#0E1424] border-[#1F2C4C]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                playSynthesizedSound('click');
                setSidebarOpen(true);
              }}
              className={`md:hidden p-2 rounded-lg transition ${
                isDark ? 'hover:bg-[#1E294B] text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 min-w-0">
              <div className={`p-1.5 rounded-lg border shrink-0 ${
                isDark ? 'bg-slate-900 border-[#2B3B5E]' : 'bg-slate-50 border-slate-200'
              }`}>
                {(() => {
                  const IconComp = currentPersonaInfo ? currentPersonaInfo.icon : Sparkles;
                  const avatarColor = currentPersonaInfo ? currentPersonaInfo.avatarColor : 'text-[#00F0FF]';
                  return <IconComp className={`w-5 h-5 ${avatarColor}`} />;
                })()}
              </div>
              <div className="min-w-0">
                <h1 className={`font-semibold text-sm md:text-base flex items-center gap-1.5 ${
                  isDark ? 'text-slate-100' : 'text-slate-800'
                }`}>
                  <span className="truncate">{currentPersonaInfo ? currentPersonaInfo.name : 'gocompuX'}</span>
                  {currentPersonaInfo && (
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border shrink-0 ${currentPersonaInfo.badgeBg}`}>
                      {currentPersonaInfo.title}
                    </span>
                  )}
                </h1>
                <p className={`text-[10px] md:text-[11px] truncate hidden sm:block ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {currentPersonaInfo ? currentPersonaInfo.description : 'Your AI partner.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Share conversation button */}
            <button
              onClick={handleShareChat}
              className={`p-2 rounded-lg transition duration-200 cursor-pointer ${
                shareCopied
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : isDark ? 'hover:bg-[#1E294B] text-slate-300 hover:text-[#00F0FF]' : 'hover:bg-slate-100 text-slate-600 hover:text-blue-600'
              }`}
              title="Share entire conversation"
            >
              {shareCopied ? <Check className="w-5 h-5" /> : <Share className="w-5 h-5" />}
            </button>

            {/* Dark/Light mode toggler */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition duration-200 cursor-pointer ${
                isDark ? 'hover:bg-[#1E294B] text-amber-400' : 'hover:bg-slate-100 text-indigo-600'
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Sound Synthesizer toggler */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-lg transition duration-200 cursor-pointer ${
                soundEnabled 
                  ? isDark ? 'hover:bg-[#1E294B] text-[#00F0FF]' : 'hover:bg-slate-100 text-blue-600'
                  : 'hover:bg-slate-100 text-slate-400'
              }`}
              title={soundEnabled ? "Mute interface feedback" : "Unmute interface feedback"}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Quick settings gear */}
            <button
              onClick={() => {
                playSynthesizedSound('click');
                setSettingsOpen(!settingsOpen);
              }}
              className={`p-2 rounded-lg transition duration-200 cursor-pointer ${
                settingsOpen 
                  ? isDark ? 'bg-[#1E294B] text-[#00F0FF]' : 'bg-slate-100 text-blue-600'
                  : isDark ? 'hover:bg-[#1E294B] text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
              title="Assistant Parameters"
            >
              <Sliders className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* DYNAMIC FIREBASE DIAGNOSTICS BANNER */}
        {firebaseDiagnostics && firebaseDiagnostics.errorType && (
          <div className={`px-4 py-3 border-b text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 ${
            firebaseDiagnostics.errorType === 'firestore'
              ? (isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-800')
              : firebaseDiagnostics.errorType === 'network'
              ? (isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800')
              : (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800')
          }`}>
            <div className="flex items-start gap-2.5">
              <span className="text-sm shrink-0 mt-0.5">
                {firebaseDiagnostics.errorType === 'firestore' ? '🔒' : firebaseDiagnostics.errorType === 'network' ? '🌐' : '⚠️'}
              </span>
              <div>
                <p className="font-semibold mb-0.5">
                  {firebaseDiagnostics.errorType === 'config' && 'Firebase Config Required'}
                  {firebaseDiagnostics.errorType === 'auth' && 'Firebase Authentication Warning'}
                  {firebaseDiagnostics.errorType === 'firestore' && 'Firestore Access Error (Permission Denied)'}
                  {firebaseDiagnostics.errorType === 'network' && 'Firebase Cloud Sync Offline'}
                  {firebaseDiagnostics.errorType === 'unknown' && 'Firebase Sync Warning'}
                </p>
                <p className="opacity-90 leading-relaxed">
                  {firebaseDiagnostics.errorType === 'config' && (
                    <span>The application cannot initialize because the Firebase configuration is missing or incomplete. Please provide a valid <code className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">firebase-applet-config.json</code> file.</span>
                  )}
                  {firebaseDiagnostics.errorType === 'auth' && (
                    <span>
                      Authentication returned code <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.errorCode}</strong>. The Email/Password, Anonymous, or Google sign-in methods might not be enabled in your Firebase Console for project <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.projectId}</strong>. Enable them to enable sync. (Error: {firebaseDiagnostics.errorMessage})
                    </span>
                  )}
                  {firebaseDiagnostics.errorType === 'firestore' && (
                    <span>
                      Firestore returned code <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.errorCode}</strong>. Access to write profile or session documents was denied. Please make sure Firestore Security Rules are deployed and your database is provisioned in project <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.projectId}</strong>. (Error: {firebaseDiagnostics.errorMessage})
                    </span>
                  )}
                  {firebaseDiagnostics.errorType === 'network' && (
                    <span>
                      The network connection to the Firebase backend for <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.projectId}</strong> failed. Your chat history and preferences are safely preserved offline in local storage. (Error: {firebaseDiagnostics.errorMessage})
                    </span>
                  )}
                  {firebaseDiagnostics.errorType === 'unknown' && (
                    <span>
                      An error occurred during cloud sync with project <strong className="font-mono bg-black/10 px-1 py-0.5 rounded text-[10px]">{firebaseDiagnostics.projectId}</strong>: {firebaseDiagnostics.errorMessage}
                    </span>
                  )}
                </p>
              </div>
            </div>
            
            {firebaseDiagnostics.errorType !== 'network' && (
              <a
                href={
                  firebaseDiagnostics.errorType === 'firestore'
                    ? `https://console.firebase.google.com/project/${firebaseDiagnostics.projectId}/firestore`
                    : `https://console.firebase.google.com/project/${firebaseDiagnostics.projectId}/authentication/providers`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase tracking-wider transition shrink-0 inline-flex items-center gap-1 ${
                  firebaseDiagnostics.errorType === 'firestore'
                    ? (isDark ? 'bg-rose-500 hover:bg-rose-400 text-slate-950' : 'bg-rose-600 hover:bg-rose-700 text-white')
                    : (isDark ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-amber-600 hover:bg-amber-700 text-white')
                }`}
              >
                {firebaseDiagnostics.errorType === 'firestore' ? 'Go to Firestore' : 'Configure Firebase Auth'}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* FLOATING OPTIONS POPUP PANEL */}
        {settingsOpen && (
          <div className={`absolute top-16 right-4 z-30 w-72 p-4 border rounded-2xl shadow-xl animate-fade-in space-y-4 ${
            isDark ? 'bg-[#11182B] border-[#23335A] shadow-black/40' : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}>
            <div className={`flex justify-between items-center pb-2 border-b ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <span className={`font-semibold text-sm tracking-wide flex items-center gap-1.5 ${
                isDark ? 'text-slate-200' : 'text-slate-700'
              }`}>
                <Sliders className="w-4 h-4 text-blue-500" /> Session Parameters
              </span>
              <button 
                onClick={() => setSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Model switch */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Model Core
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleModelChange('gemini-3.5-flash')}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border transition cursor-pointer text-center ${
                    selectedModel === 'gemini-3.5-flash'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-500 shadow-sm'
                      : isDark ? 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  X-Core Prime
                </button>
                <button
                  onClick={() => handleModelChange('gemini-3.1-flash-lite')}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border transition cursor-pointer text-center ${
                    selectedModel === 'gemini-3.1-flash-lite'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-500 shadow-sm'
                      : isDark ? 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  X-Core Turbo
                </button>
              </div>
            </div>

            {/* Genuine Search Grounding Toggle */}
            <div className={`flex items-center justify-between py-2 border-t ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <div className="space-y-0.5">
                <span className={`text-xs font-semibold block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Live Search Grounding</span>
                <span className="text-[9px] text-slate-400 block">Verify brands & genuine products live.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={webSearchGrounding}
                  onChange={(e) => {
                    playSynthesizedSound('click');
                    setWebSearchGrounding(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all peer-checked:bg-blue-600 ${
                  isDark ? 'bg-[#1A233D] border border-[#2B3B5E] after:bg-[#4F5B7C]' : 'bg-slate-200 border border-slate-300 after:bg-slate-400'
                } peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:rounded-full after:h-[12px] after:w-[12px] after:transition-all peer-checked:after:bg-white`}></div>
              </label>
            </div>

            {/* Streaming option */}
            <div className={`flex items-center justify-between py-2 border-t ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <div className="space-y-0.5">
                <span className={`text-xs font-semibold block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Stream Output</span>
                <span className="text-[9px] text-slate-400 block">Render responses word-by-word.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={streamEnabled}
                  onChange={(e) => {
                    playSynthesizedSound('click');
                    setStreamEnabled(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all peer-checked:bg-blue-600 ${
                  isDark ? 'bg-[#1A233D] border border-[#2B3B5E] after:bg-[#4F5B7C]' : 'bg-slate-200 border border-slate-300 after:bg-slate-400'
                } peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:rounded-full after:h-[12px] after:w-[12px] after:transition-all peer-checked:after:bg-white`}></div>
              </label>
            </div>

            {/* Low-Bandwidth Mode option */}
            <div className={`flex items-center justify-between py-2 border-t ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-semibold block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Low-Bandwidth Mode</span>
                  {autoDetectedSlowNetwork && (
                    <span className="px-1 py-0.2 text-[7px] leading-none font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-full animate-pulse">Slow Connection</span>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 block">Trim context, request short responses & save tokens.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={lowBandwidthMode}
                  onChange={(e) => {
                    playSynthesizedSound('click');
                    setLowBandwidthMode(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all peer-checked:bg-amber-500 ${
                  isDark ? 'bg-[#1A233D] border border-[#2B3B5E] after:bg-[#4F5B7C]' : 'bg-slate-200 border border-slate-300 after:bg-slate-400'
                } peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:rounded-full after:h-[12px] after:w-[12px] after:transition-all peer-checked:after:bg-white`}></div>
              </label>
            </div>

            {/* Latency Telemetry Panel */}
            <div className={`py-3 border-t flex flex-col gap-1.5 ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>⚡ Latency Diagnostics</span>
                <span className="px-1 py-0.2 text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono font-normal">Active</span>
              </div>

              {/* Exact model */}
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Engine Model:</span>
                <span className="text-[10px] font-bold font-mono text-cyan-400">
                  {latencyStats?.modelUsed || selectedModel}
                </span>
              </div>

              {/* Click-to-API delay */}
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Frontend Prep:</span>
                <span className="font-mono text-slate-300">
                  {latencyStats ? `${latencyStats.timeToApi}ms` : '0ms'}
                </span>
              </div>

              {/* Gemini API TTFT */}
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>API TTFT (First Token):</span>
                <span className={`font-mono font-bold ${
                  !latencyStats ? 'text-slate-500' :
                  latencyStats.ttft < 1200 ? 'text-emerald-400' :
                  latencyStats.ttft < 3000 ? 'text-yellow-400' : 'text-rose-400'
                }`}>
                  {latencyStats ? `${latencyStats.ttft}ms` : lastRequestLatency ? `${lastRequestLatency}ms` : 'N/A'}
                </span>
              </div>

              {/* Total request duration */}
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Generation Time:</span>
                <span className="font-mono text-slate-300">
                  {latencyStats ? `${latencyStats.apiDuration}ms` : 'N/A'}
                </span>
              </div>

              {/* Largest Latency Source */}
              {latencyStats && (
                <div className="p-1.5 rounded bg-slate-950/40 border border-[#23335A]/50 text-[9px] space-y-0.5 mt-0.5 animate-fade-in">
                  <div className="text-slate-400 font-semibold">Largest Latency Source:</div>
                  <div className="text-amber-400 font-mono font-bold">
                    {(() => {
                      const sources = [
                        { name: 'Frontend Overhead', value: latencyStats.timeToApi },
                        { name: 'Gemini API TTFT', value: latencyStats.geminiTtft || (latencyStats.ttft - 80) },
                        { name: 'Network Transit', value: Math.max(0, latencyStats.apiDuration - (latencyStats.serverTotalTime || latencyStats.apiDuration * 0.8)) },
                        { name: 'Gemini Generation Time', value: latencyStats.geminiGenerationTime || (latencyStats.apiDuration - latencyStats.ttft) }
                      ];
                      sources.sort((a, b) => b.value - a.value);
                      return `${sources[0].name} (${sources[0].value.toFixed(0)}ms)`;
                    })()}
                  </div>
                </div>
              )}

              {/* Prompt and Response Token Counts */}
              <div className="grid grid-cols-2 gap-1 text-[9px] mt-0.5 pt-1.5 border-t border-[#23335A]/50">
                <div className="flex flex-col gap-0.5 p-1 rounded bg-slate-900/40">
                  <span className="text-slate-400 block">Prompt Tokens:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {latencyStats?.promptTokens ? latencyStats.promptTokens : 'N/A'} 
                    <span className="text-[8px] text-slate-500 font-normal ml-1">
                      (avg: {promptTokenHistory.length ? Math.round(promptTokenHistory.reduce((a,b)=>a+b, 0)/promptTokenHistory.length) : 'N/A'})
                    </span>
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 p-1 rounded bg-slate-900/40">
                  <span className="text-slate-400 block">Response Tokens:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {latencyStats?.responseTokens ? latencyStats.responseTokens : 'N/A'} 
                    <span className="text-[8px] text-slate-500 font-normal ml-1">
                      (avg: {responseTokenHistory.length ? Math.round(responseTokenHistory.reduce((a,b)=>a+b, 0)/responseTokenHistory.length) : 'N/A'})
                    </span>
                  </span>
                </div>
              </div>

              {/* Recommendation Field */}
              <div className="mt-1 p-1.5 rounded bg-blue-500/5 border border-blue-500/10 text-[9px] text-slate-300">
                <div className="font-bold text-blue-400 flex items-center gap-1 mb-0.5">
                  <span>💡 Smart Optimization Recommendation</span>
                </div>
                {selectedModel === 'gemini-3.5-flash' ? (
                  <span>Select the <strong>⚡ gocompuX Ultra-Fast Engine</strong> (Gemini 3.1 Flash Lite) to reduce TTFT by ~40-60% and trim token payloads.</span>
                ) : (
                  <span><strong>Maximum Speed Mode Active!</strong> Gemini 3.1 Flash Lite is currently the lowest-latency model suitable for general text tasks.</span>
                )}
              </div>
            </div>

            {/* Active Persona switches */}
            <div className={`space-y-1.5 pt-2 border-t ${
              isDark ? 'border-[#23335A]' : 'border-slate-100'
            }`}>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Switch Portal Mode
              </label>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {Object.values(PERSONAS).map((p) => {
                  const PersonaIcon = p.icon;
                  const isCurrent = p.id === selectedPersona;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePersonaChange(p.id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-xl border text-left transition duration-150 cursor-pointer ${
                        isCurrent
                          ? isDark ? 'bg-[#1E2945] border-[#2C3E6B]' : 'bg-blue-50 border-blue-200'
                          : isDark ? 'bg-slate-900/40 border-transparent hover:bg-[#151D33]' : 'bg-transparent border-transparent hover:bg-slate-100'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${isDark ? 'bg-slate-900' : 'bg-slate-200'} ${p.avatarColor}`}>
                        <PersonaIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{p.name}</div>
                        <div className="text-[9px] text-slate-400 truncate max-w-[170px]">{p.title}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CHAT MESSAGES PANEL */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto px-4 py-6 md:px-6 space-y-6 relative custom-scrollbar ${
            isDark 
              ? 'bg-radial-[circle_at_bottom] from-[#0E1528] via-[#0A0D18] to-[#0A0D18]' 
              : 'bg-slate-50'
          }`}
        >
          {activeSession && activeSession.messages.length === 0 ? (
            
            // EMPTY WELCOME LANDING CARD
            <div className="max-w-2xl mx-auto h-full flex flex-col justify-center py-6 md:py-12 space-y-8">
              
              <div className="text-center space-y-3">
                <div className={`inline-flex p-3 border rounded-2xl animate-pulse ${
                  isDark ? 'bg-[#11192E] border-[#22335C]' : 'bg-white border-slate-200'
                }`}>
                  {(() => {
                    const TargetIcon = currentPersonaInfo ? currentPersonaInfo.icon : Sparkles;
                    const avatarColor = currentPersonaInfo ? currentPersonaInfo.avatarColor : 'text-[#00F0FF]';
                    return <TargetIcon className={`w-8 h-8 ${avatarColor}`} />;
                  })()}
                </div>
                
                <h2 className={`text-2xl md:text-4xl font-bold tracking-tight ${
                  isDark ? 'bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent' : 'text-slate-800'
                }`}>
                  {currentPersonaInfo ? currentPersonaInfo.name : 'gocompuX Portal'}
                </h2>
                <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentPersonaInfo ? currentPersonaInfo.description : 'Welcome! Let us start compiling ideas.'} Customize parameters or toggle Search Grounding in the parameters menu above.
                </p>
              </div>

              {/* Suggestions panels */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center select-none">
                  Quick suggestions
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentPersonaInfo?.suggestedPrompts.map((promptText, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      whileHover={{ scale: 1.012, y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => handleSubmit(promptText)}
                      className={`text-left p-4 rounded-xl border text-xs md:text-sm shadow-sm cursor-pointer transition ${
                        isDark 
                          ? 'bg-[#121A2F]/80 border-[#213155] hover:border-[#334A7E] text-slate-300 hover:text-white' 
                          : 'bg-white border-slate-200 hover:border-blue-400 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {promptText}
                    </motion.button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            
            // ACTIVE MESSAGES STREAM
            <div className="max-w-3xl mx-auto space-y-6">
              {activeSession?.messages.map((msg, idx) => {
                const isBot = msg.role === 'assistant';
                const sessionPersona = PERSONAS[activeSession.persona || 'assistant'];
                const PersonaIcon = sessionPersona ? sessionPersona.icon : Sparkles;
                const avatarColor = sessionPersona ? sessionPersona.avatarColor : 'text-[#00F0FF]';
                const avatarBg = sessionPersona ? sessionPersona.avatarBg : 'bg-[#00F0FF]/10 border-[#00F0FF]/30';

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className={`flex gap-3 md:gap-4 ${
                      isBot ? 'items-start' : 'items-start flex-row-reverse'
                    }`}
                  >
                    {/* Character Avatar */}
                    <div className={`w-8 h-8 md:w-9 md:h-9 rounded-xl shrink-0 flex items-center justify-center border text-xs md:text-sm select-none shadow-md ${
                      isBot 
                        ? avatarBg
                        : 'bg-[#1E294E] border-[#2E3F72] text-[#00F0FF]'
                    }`}>
                      {isBot ? (
                        <PersonaIcon className={`w-4 h-4 md:w-5 md:h-5 ${avatarColor}`} />
                      ) : (
                        <User className="w-4 h-4 md:w-5 md:h-5 text-[#00F0FF]" />
                      )}
                    </div>

                    {/* Chat Bubble card container */}
                    <div className={`max-w-[85%] md:max-w-[78%] rounded-2xl px-4 py-3 md:px-5 md:py-3.5 border flex flex-col space-y-1.5 shadow-md ${
                      isBot
                        ? isDark 
                          ? 'bg-[#151D33]/95 border-[#213159] text-slate-100 self-start' 
                          : 'bg-white border-slate-200 text-slate-800 self-start'
                        : 'bg-gradient-to-br from-[#1E294E] to-[#121A30] border-[#2C3E6C] text-slate-100 self-end shadow-indigo-900/10'
                    }`}>
                      <div className="flex items-center justify-between gap-6 mb-1 text-[9px] text-slate-400 font-bold tracking-wider select-none">
                        <span>{isBot ? (sessionPersona ? sessionPersona.name : 'gocompuX') : (currentUser ? currentUser.name : 'You')}</span>
                        <div className="flex items-center gap-2">
                          {isBot && msg.content && !msg.content.startsWith('Error:') && (
                            <button
                              onClick={() => speakText(msg.content, msg.id)}
                              className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer text-slate-400 hover:text-blue-500 dark:hover:text-white ${
                                isSpeaking === msg.id ? 'text-[#00F0FF] animate-pulse bg-blue-500/10' : ''
                              }`}
                              title={isSpeaking === msg.id ? "Stop Speaking" : "Read Response Aloud"}
                            >
                              {isSpeaking === msg.id ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            </button>
                          )}
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Display attachments if present */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.attachments.map((att, attIdx) => (
                            <div 
                              key={attIdx} 
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                                isDark 
                                  ? 'bg-[#0b1021] border-white/10 text-slate-300' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600'
                              }`}
                            >
                              <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                              <span className="truncate max-w-[120px]">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                        {isBot ? (
                          msg.content === '' ? (
                            // Typing animation
                            <div className="flex items-center gap-1.5 py-1.5 select-none">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></span>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></span>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
                            </div>
                          ) : msg.content.startsWith('Error:') ? (
                            <div className="space-y-3 p-3.5 bg-rose-950/10 border border-rose-900/40 rounded-xl text-rose-200">
                              <div className="flex items-start gap-2.5">
                                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                                <div className="text-xs md:text-sm leading-relaxed">{msg.content}</div>
                              </div>
                              <button
                                onClick={() => handleRetry(idx)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 text-white text-xs font-semibold transition cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Retry Connection</span>
                              </button>
                            </div>
                          ) : (
                            <MessageContent text={msg.content} isDark={isDark} />
                          )
                        ) : (
                          <p className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.content}</p>
                        )}
                      </div>

                      {/* Display Grounding Metadata / Sources & Genuine product finder references */}
                      {isBot && msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                        <div className={`mt-4 pt-3 border-t space-y-2 ${
                          isDark ? 'border-white/5' : 'border-slate-100'
                        }`}>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest select-none">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span>Verified Web Sources & Genuine Product References</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {msg.groundingMetadata.groundingChunks.map((chunk, chunkIdx) => {
                              if (!chunk.web?.uri) return null;
                              return (
                                <a
                                  key={chunkIdx}
                                  href={chunk.web.uri}
                                  target="_blank"
                                  rel="noopener noreferrer referrerPolicy=no-referrer"
                                  className={`flex items-center justify-between p-2.5 rounded-xl border transition text-xs ${
                                    isDark 
                                      ? 'bg-slate-950/40 border-white/10 hover:border-blue-500/30 hover:bg-slate-900/60' 
                                      : 'bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-slate-100'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                                    <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span className={`font-semibold truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                      {chunk.web.title || 'Genuine Product Portal'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-slate-400 shrink-0 text-[10px]">
                                    <span className="hidden sm:inline">Verify Brand</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                  </motion.div>
                );
              })}

              {/* Bot thinking indicator if server is fetching */}
              {isGenerating && activeSession?.messages[activeSession.messages.length - 1]?.role === 'user' && (
                <div className="flex gap-3 md:gap-4 items-start">
                  <div className={`w-8 h-8 md:w-9 md:h-9 rounded-xl shrink-0 flex items-center justify-center border ${
                    currentPersonaInfo ? currentPersonaInfo.avatarBg : 'bg-[#00F0FF]/10'
                  }`}>
                    {(() => {
                      const IconC = currentPersonaInfo ? currentPersonaInfo.icon : Sparkles;
                      const avatarColor = currentPersonaInfo ? currentPersonaInfo.avatarColor : 'text-[#00F0FF]';
                      return <IconC className={`w-4 h-4 md:w-5 md:h-5 ${avatarColor}`} />;
                    })()}
                  </div>
                  <div className={`rounded-2xl px-4 py-3 md:px-5 md:py-3.5 border ${
                    isDark ? 'bg-[#151D33]/95 border-[#213159]' : 'bg-white border-slate-200'
                  } self-start shadow-md`}>
                    <div className="flex items-center gap-1.5 py-1.5 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* SCROLL BACK TO BOTTOM BUTTON */}
        {showScrollDown && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className={`absolute bottom-28 right-6 z-20 p-2.5 rounded-full border shadow-lg animate-bounce transition cursor-pointer ${
              isDark 
                ? 'bg-[#16213B] hover:bg-[#202E53] border-[#2D3F68] text-[#00F0FF] hover:text-white' 
                : 'bg-white hover:bg-slate-100 border-slate-200 text-blue-500'
            }`}
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        {/* FOOTER INPUT CONTROLS */}
        <footer className={`p-4 border-t shrink-0 z-10 transition-colors duration-300 ${
          isDark ? 'bg-[#0E1424] border-[#1F2C4C]' : 'bg-white border-slate-200'
        }`}>
          <div className="max-w-3xl mx-auto space-y-2">
            
            {/* Attachment preview panel */}
            <AnimatePresence>
              {uploadedFiles.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 pb-2"
                >
                  {uploadedFiles.map((file, fileIdx) => {
                    const isImg = file.type.startsWith('image/');
                    return (
                      <div 
                        key={fileIdx}
                        className={`flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-xl text-xs font-medium border relative ${
                          isDark 
                            ? 'bg-[#13192B] border-[#23355C] text-slate-300' 
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        {isImg ? (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span className="truncate max-w-[130px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachedFile(fileIdx)}
                          className="p-1 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="flex items-end gap-2.5 relative"
            >
              {/* Invisible file input picker */}
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                className="hidden"
                accept="image/*,text/*,.json,.ts,.js,.py,.pdf"
              />

              {/* Clip attachment trigger */}
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  playSynthesizedSound('click');
                }}
                className={`p-3 rounded-xl border transition duration-200 cursor-pointer ${
                  isDark 
                    ? 'bg-[#13192B] border-[#23355C] hover:border-slate-500 text-slate-400 hover:text-white' 
                    : 'bg-slate-50 border-slate-200 hover:border-slate-400 text-slate-500 hover:text-slate-800'
                }`}
                title="Attach Images, text or code files (Max 10MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Screenshot / Screen Capture trigger */}
              <button
                type="button"
                onClick={captureScreenshot}
                disabled={isCapturingScreen}
                className={`p-3 rounded-xl border transition duration-200 cursor-pointer ${
                  isCapturingScreen
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse'
                    : isDark 
                      ? 'bg-[#13192B] border-[#23355C] hover:border-slate-500 text-slate-400 hover:text-white' 
                      : 'bg-slate-50 border-slate-200 hover:border-slate-400 text-slate-500 hover:text-slate-800'
                }`}
                title="Capture Screenshot from Tab/Window/Screen"
              >
                <Camera className="w-4 h-4" />
              </button>

              {/* Voice recognition input trigger */}
              <button
                type="button"
                onClick={startVoiceInput}
                className={`p-3 rounded-xl border transition duration-200 cursor-pointer ${
                  isListening
                    ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                    : isDark 
                      ? 'bg-[#13192B] border-[#23355C] hover:border-slate-500 text-slate-400 hover:text-white' 
                      : 'bg-slate-50 border-slate-200 hover:border-slate-400 text-slate-500 hover:text-slate-800'
                }`}
                title={isListening ? "Listening... Click to stop" : "Voice Input (Speech-to-Text)"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Template Library Sidebar trigger */}
              <button
                type="button"
                onClick={() => {
                  setTemplatesOpen(true);
                  playSynthesizedSound('click');
                }}
                className={`p-3 rounded-xl border transition duration-200 cursor-pointer ${
                  templatesOpen
                    ? 'bg-blue-500/20 border-blue-500 text-[#00F0FF]'
                    : isDark 
                      ? 'bg-[#13192B] border-[#23355C] hover:border-slate-500 text-slate-400 hover:text-white' 
                      : 'bg-slate-50 border-slate-200 hover:border-slate-400 text-slate-500 hover:text-slate-800'
                }`}
                title="Open Template Library"
              >
                <BookOpen className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                id="chat-input"
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  // Auto-resize after React updates the value
                  requestAnimationFrame(autoResizeTextarea);
                }}
                onKeyDown={(e) => {
                  // Enter sends the message; Shift+Enter inserts a newline
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={`Ask ${currentPersonaInfo ? currentPersonaInfo.name : 'gocompuX'}...`}
                rows={1}
                disabled={isGenerating}
                className={`flex-1 pl-4 pr-12 py-3 resize-none text-sm leading-relaxed custom-scrollbar outline-none transition-[border,box-shadow] duration-200 rounded-xl border overflow-y-auto ${
                  isDark 
                    ? 'bg-[#13192B] text-slate-100 placeholder-slate-400 border-[#23355C] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]' 
                    : 'bg-slate-50 text-slate-800 placeholder-slate-500 border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
                style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
              />
              
              <button
                type="submit"
                id="btn-submit"
                disabled={isGenerating || (!inputMessage.trim() && uploadedFiles.length === 0)}
                className={`absolute right-2 bottom-2 p-2 rounded-lg transition duration-200 cursor-pointer flex items-center justify-center ${
                  (!inputMessage.trim() && uploadedFiles.length === 0) || isGenerating
                    ? 'text-slate-500 bg-transparent'
                    : 'text-white bg-[#3B82F6] hover:bg-[#2563EB] shadow-md shadow-blue-500/10'
                }`}
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-1 gap-2 text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1 select-none">
                  <Zap className="w-3.5 h-3.5 text-blue-500 animate-pulse" /> 
                  Powered by gocompuX Core
                </span>
                
                {/* Genuine Product Finder mode highlight */}
                {webSearchGrounding && (
                  <span className="flex items-center gap-1 text-emerald-500 select-none">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Genuine Product Grounding ACTIVE
                  </span>
                )}

                {/* Routing Feedback Engine Status */}
                {routingFeedback && (
                  <span className="flex items-center gap-1 text-cyan-400 font-medium select-none animate-pulse">
                    <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    {routingFeedback}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 font-mono text-slate-500">
                <span>{inputMessage.length} chars</span>
              </div>
            </div>

          </div>
        </footer>

      </main>

      {/* TEMPLATE LIBRARY SIDEBAR / DRAWER */}
      <AnimatePresence>
        {templatesOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setTemplatesOpen(false);
                setEditingTemplate(null);
              }}
              className="fixed inset-0 bg-[#020617] z-40 cursor-pointer"
            />

            {/* Slide-over Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={`fixed right-0 top-0 h-full w-full max-w-lg z-50 shadow-2xl flex flex-col border-l transition-colors duration-300 ${
                isDark ? 'bg-[#111930] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              {/* Header */}
              <div className={`p-4 md:p-6 border-b flex items-center justify-between shrink-0 ${
                isDark ? 'border-white/10' : 'border-slate-200'
              }`}>
                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-400" />
                    <span>Prompt Template Library</span>
                  </h3>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Save, modify, and instantly apply structured prompts.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setTemplatesOpen(false);
                    setEditingTemplate(null);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    isDark ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main scrollable body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 custom-scrollbar">
                
                {/* Create / Edit Custom Template Form */}
                {editingTemplate !== null ? (
                  <motion.form
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl border space-y-4 ${
                      isDark ? 'bg-[#0a0f21] border-[#23355C]' : 'bg-slate-50 border-slate-200'
                    }`}
                    onSubmit={handleSaveCustomTemplate}
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      {editingTemplate.id === 'new' ? 'Create Custom Template' : 'Edit Custom Template'}
                    </h4>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                        Template Title
                      </label>
                      <input
                        type="text"
                        required
                        value={newTemplateTitle}
                        onChange={(e) => setNewTemplateTitle(e.target.value)}
                        placeholder="e.g., Code Reviewer, Content Synthesizer"
                        className={`w-full text-xs rounded-xl border px-3 py-2 outline-none transition ${
                          isDark 
                            ? 'bg-[#13192B] text-slate-100 placeholder-slate-500 border-[#23355C] focus:border-blue-500' 
                            : 'bg-white text-slate-800 border-slate-200 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Category
                        </label>
                        <select
                          value={newTemplateCat}
                          onChange={(e) => setNewTemplateCat(e.target.value as any)}
                          className={`w-full text-xs rounded-xl border px-2 py-2 outline-none transition ${
                            isDark 
                              ? 'bg-[#13192B] text-slate-100 border-[#23355C]' 
                              : 'bg-white text-slate-800 border-slate-200'
                          }`}
                        >
                          <option value="Developer">Developer</option>
                          <option value="Writing">Writing</option>
                          <option value="Business">Business</option>
                          <option value="Creative">Creative</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Short Description
                        </label>
                        <input
                          type="text"
                          value={newTemplateDesc}
                          onChange={(e) => setNewTemplateDesc(e.target.value)}
                          placeholder="Briefly state what it does..."
                          className={`w-full text-xs rounded-xl border px-3 py-2 outline-none transition ${
                            isDark 
                              ? 'bg-[#13192B] text-slate-100 placeholder-slate-500 border-[#23355C] focus:border-blue-500' 
                              : 'bg-white text-slate-800 border-slate-200 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Template Content (Prompt Structure)
                        </label>
                        <span className="text-[8px] text-slate-500 font-mono">Use placeholders like [Paste code here]</span>
                      </div>
                      <textarea
                        required
                        value={newTemplateContent}
                        onChange={(e) => setNewTemplateContent(e.target.value)}
                        rows={5}
                        placeholder="Type your prompt skeleton here..."
                        className={`w-full text-xs rounded-xl border px-3 py-2 outline-none font-mono transition resize-y ${
                          isDark 
                            ? 'bg-[#13192B] text-slate-100 placeholder-slate-500 border-[#23355C] focus:border-blue-500' 
                            : 'bg-white text-slate-800 border-slate-200 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={cancelEditTemplate}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                          isDark ? 'border-white/10 hover:bg-white/5 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#3B82F6] hover:bg-[#2563EB] text-white cursor-pointer shadow-md shadow-blue-500/10 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Template</span>
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  // Default header block when not editing
                  <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-blue-400">Save Your Custom Workflows</h4>
                      <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Create common structures you use every day.</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingTemplate({
                          id: 'new',
                          title: '',
                          description: '',
                          content: '',
                          category: 'Custom',
                          isCustom: true
                        });
                        playSynthesizedSound('click');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New</span>
                    </button>
                  </div>
                )}

                {/* Filters & Search Row */}
                <div className="space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={templateSearchQuery}
                      onChange={(e) => setTemplateSearchQuery(e.target.value)}
                      placeholder="Search templates by title or content..."
                      className={`w-full pl-8 pr-4 py-2 text-xs rounded-xl border outline-none transition ${
                        isDark 
                          ? 'bg-[#13192B] text-slate-100 placeholder-slate-500 border-[#23355C] focus:border-blue-500' 
                          : 'bg-slate-50 text-slate-800 border-slate-200 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  {/* Category Tabs */}
                  <div className="flex flex-wrap gap-1 select-none">
                    {['All', 'Developer', 'Writing', 'Business', 'Creative', 'Custom'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedTemplateCategory(cat);
                          playSynthesizedSound('click');
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border transition duration-150 cursor-pointer ${
                          selectedTemplateCategory === cat
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-sm'
                            : isDark 
                              ? 'bg-transparent border-white/5 text-slate-400 hover:text-white' 
                              : 'bg-transparent border-slate-200 text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Cards List */}
                <div className="space-y-3">
                  {(() => {
                    const allTemplates = [...customTemplates, ...PREDEFINED_TEMPLATES];
                    const filtered = allTemplates.filter(t => {
                      const matchesCat = selectedTemplateCategory === 'All' || t.category === selectedTemplateCategory;
                      const text = (t.title + ' ' + t.description + ' ' + t.content).toLowerCase();
                      const matchesSearch = text.includes(templateSearchQuery.toLowerCase());
                      return matchesCat && matchesSearch;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className={`text-center py-10 rounded-2xl border border-dashed ${
                          isDark ? 'border-white/10 text-slate-500' : 'border-slate-200 text-slate-400'
                        }`}>
                          <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-400/50" />
                          <p className="text-xs">No prompt templates matching your criteria.</p>
                        </div>
                      );
                    }

                    return filtered.map(t => (
                      <div
                        key={t.id}
                        className={`p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md flex flex-col space-y-3.5 ${
                          isDark 
                            ? 'bg-[#151d33] border-white/5 hover:border-white/10' 
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h5 className="text-xs font-bold leading-snug">{t.title}</h5>
                            <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {t.description}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            t.category === 'Developer' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/10' :
                            t.category === 'Writing' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10' :
                            t.category === 'Business' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                            t.category === 'Creative' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/10' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                          }`}>
                            {t.category}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2.5 select-none">
                          <div className="flex gap-2">
                            {t.isCustom && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditTemplate(t)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    isDark ? 'hover:bg-white/5 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomTemplate(t.id)}
                                  className="px-2 py-1 rounded text-[10px] font-bold text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyTemplate(t.content)}
                            className="px-3 py-1 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-[10px] tracking-wide shadow-md shadow-blue-500/10 transition cursor-pointer"
                          >
                            Use Template
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>

              </div>

              {/* Footer Help Card */}
              <div className={`p-4 border-t text-[10px] flex items-start gap-2.5 shrink-0 ${
                isDark ? 'border-white/10 bg-[#0c1224] text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}>
                <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                <p className="leading-relaxed">
                  <b>High-Speed Tip</b>: These templates are calibrated for our <b>1-2 seconds Instant Output Response Engine</b>. Selecting them outputs immediate stream tokens with high reliability.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

// Markdown Formatter Helper Components
interface FormattedPart {
  type: 'text' | 'code-block' | 'inline-code';
  content: string;
  language?: string;
}

function parseMarkdown(text: string): FormattedPart[] {
  const parts: FormattedPart[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parseInlineCode(textBefore, parts);
    }

    parts.push({
      type: 'code-block',
      language: match[1] || 'plaintext',
      content: match[2],
    });

    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parseInlineCode(text.slice(lastIndex), parts);
  }

  return parts;
}

function parseInlineCode(text: string, parts: FormattedPart[]) {
  const inlineRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: 'inline-code',
      content: match[1],
    });

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }
}

function MessageContent({ text, isDark }: { text: string; isDark: boolean }) {
  const parts = parseMarkdown(text);

  return (
    <div className="space-y-3 leading-relaxed break-words text-sm md:text-base">
      {parts.map((part, idx) => {
        if (part.type === 'code-block') {
          return <CodeBlock key={idx} language={part.language} code={part.content} isDark={isDark} />;
        } else if (part.type === 'inline-code') {
          return (
            <code key={idx} className={`px-1.5 py-0.5 rounded text-xs md:text-sm font-mono break-all inline-block ${
              isDark ? 'bg-[#1C263F] text-[#00F0FF]' : 'bg-slate-100 text-indigo-600 border border-slate-200'
            }`}>
              {part.content}
            </code>
          );
        } else {
          return <TextPart key={idx} text={part.content} isDark={isDark} />;
        }
      })}
    </div>
  );
}

function TextPart({ text, isDark }: { text: string; isDark: boolean; key?: any }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
        const isNumbered = /^\d+\.\s/.test(line.trim());

        const renderLineContent = (str: string) => {
          const boldRegex = /\*\*([\s\S]*?)\*\*/g;
          const elements: React.ReactNode[] = [];
          let lastIdx = 0;
          let match;

          while ((match = boldRegex.exec(str)) !== null) {
            if (match.index > lastIdx) {
              elements.push(str.slice(lastIdx, match.index));
            }
            elements.push(<strong key={match.index} className={`font-semibold shadow-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{match[1]}</strong>);
            lastIdx = boldRegex.lastIndex;
          }
          if (lastIdx < str.length) {
            elements.push(str.slice(lastIdx));
          }
          return elements.length > 0 ? elements : str;
        };

        if (isBullet) {
          const content = line.trim().replace(/^[\*\-]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-blue-500 mt-1.5 shrink-0 select-none">•</span>
              <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{renderLineContent(content)}</span>
            </div>
          );
        }

        if (isNumbered) {
          const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-blue-500 font-semibold mt-0.5 shrink-0 select-none">{numMatch[1]}.</span>
                <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{renderLineContent(numMatch[2])}</span>
              </div>
            );
          }
        }

        if (line.trim() === '') {
          return <div key={idx} className="h-2" />;
        }

        return <p key={idx} className={isDark ? 'text-slate-200' : 'text-slate-700'}>{renderLineContent(line)}</p>;
      })}
    </div>
  );
}

function CodeBlock({ language, code, isDark }: { language?: string; code: string; isDark: boolean; key?: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    playSynthesizedSound('click');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-3.5 rounded-xl overflow-hidden border font-mono text-xs md:text-sm shadow-lg max-w-full ${
      isDark ? 'border-[#23355C] bg-[#0E1322]' : 'border-slate-200 bg-slate-50'
    }`}>
      <div className={`flex items-center justify-between px-4 py-2.5 select-none shrink-0 border-b ${
        isDark ? 'bg-[#141C30] border-[#23355C] text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
      }`}>
        <span className="lowercase text-blue-500 font-semibold tracking-wider flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2 py-1 rounded transition duration-150 cursor-pointer ${
            isDark ? 'bg-[#1C263F] hover:bg-[#263456] text-slate-300' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 text-[11px] font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={`p-4 overflow-x-auto selection:bg-blue-500/20 leading-relaxed max-w-full custom-scrollbar ${
        isDark ? 'text-slate-100' : 'text-slate-800'
      }`}>
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}
