import React, { useState, useEffect } from 'react';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp, 
    type Firestore,
    query,
    onSnapshot,
    doc,
    deleteDoc
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

// --- TypeScript Declarations ---
declare global {
  interface Window {
    gapi: any;
    google: any;
    tokenClient: any;
  }
}

// Define a type for our saved documents
interface SavedDoc {
    id: string;
    fileName: string;
    content: string;
    originalUrl: string;
    createdAt: any;
}

// --- Configuration ---
const GOOGLE_CLIENT_ID = '1051406156880-7ioino92aq49tol8kc5d4aco60p7s7h4.apps.googleusercontent.com';
const GOOGLE_API_SCOPES = "https://www.googleapis.com/auth/drive.readonly";

const firebaseConfig = {
  apiKey: "AIzaSyD-NACMu0TqWJoiSZ78yUpJ-8K0huNmpdE",
  authDomain: "driveapp-828d0.firebaseapp.com",
  projectId: "driveapp-828d0",
  storageBucket: "driveapp-828d0.firebasestorage.app",
  messagingSenderId: "320725343596",
  appId: "1:320725343596:web:498596e0520f684e56a749",
  measurementId: "G-FZ1FT32X1Z"
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let isFirebaseInitialized = false;

try {
  if (firebaseConfig && firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseInitialized = true;
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
}

// --- Main App Component ---
export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [isGsiLoaded, setIsGsiLoaded] = useState(false);

  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchedContent, setFetchedContent] = useState('');
  
  // --- New State for Features ---
  const [savedDocs, setSavedDocs] = useState<SavedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SavedDoc | null>(null);


  // --- Effect for Firebase Authentication ---
  useEffect(() => {
    if (!isFirebaseInitialized || !auth) {
      setStatusMessage("Error: Firebase configuration is missing or invalid.");
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthReady(true);
      } else {
        signInAnonymously(auth).catch((error) => {
           console.error("Firebase anonymous sign-in failed:", error);
           setStatusMessage("Error: Could not connect to the database.");
        });
      }
    });
    return () => unsubscribe();
  }, []);
  
  // --- New Effect to Fetch Saved Documents ---
  useEffect(() => {
    if (isAuthReady && userId && db) {
        const collectionPath = `/users/${userId}/documents`;
        const q = query(collection(db, collectionPath));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docsData: SavedDoc[] = [];
            querySnapshot.forEach((doc) => {
                docsData.push({ id: doc.id, ...doc.data() } as SavedDoc);
            });
            // Sort by creation date, newest first
            docsData.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
            setSavedDocs(docsData);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }
  }, [isAuthReady, userId]);


  // --- Effect for Loading Google Scripts ---
  useEffect(() => {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
      window.gapi.load('client', () => {
        window.gapi.client.init({
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        }).then(() => setIsGapiLoaded(true));
      });
    };
    document.body.appendChild(gapiScript);

    const gsiScript = document.createElement('script');
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.async = true;
    gsiScript.defer = true;
    gsiScript.onload = () => setIsGsiLoaded(true);
    document.body.appendChild(gsiScript);

    return () => {
        const gapi = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
        if (gapi) document.body.removeChild(gapi);
        const gsi = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (gsi) document.body.removeChild(gsi);
    };
  }, []);

  // --- Initialize Token Client once scripts are loaded ---
  useEffect(() => {
    if (isGsiLoaded) {
      window.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_API_SCOPES,
        callback: (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            window.gapi.client.setToken({ access_token: tokenResponse.access_token });
            setIsGoogleSignedIn(true);
          }
        },
        error_callback: (error: any) => {
            console.error("GSI Error:", error);
            setStatusMessage("Error: Google Sign-In failed.");
        }
      });
    }
  }, [isGsiLoaded]);

  // --- Effect to update status message based on state ---
  useEffect(() => {
      if (!isAuthReady || !isGapiLoaded || !isGsiLoaded) {
          setStatusMessage("Loading services...");
      } else if (!isGoogleSignedIn) {
          setStatusMessage("Please connect your Google Account.");
      } else {
          setStatusMessage("Ready. Paste a Google Drive URL to begin.");
      }
  }, [isAuthReady, isGapiLoaded, isGsiLoaded, isGoogleSignedIn]);

  // --- Core Functions ---
  const handleAuthClick = () => {
    if (isGoogleSignedIn) {
      window.gapi.client.setToken(null);
      setIsGoogleSignedIn(false);
    } else {
      if (window.tokenClient) {
        window.tokenClient.requestAccessToken({ prompt: 'consent' });
      }
    }
  };

  const extractFileIdFromUrl = (url: string): string | null => {
    const regexes = [
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
      /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/
    ];
    for (const regex of regexes) {
      const match = url.match(regex);
      if (match) return match[1];
    }
    return null;
  };

  const handleFetchAndStore = async () => {
    if (!isGoogleSignedIn || !isAuthReady || !userId || !db) {
      setStatusMessage("Cannot fetch. Services not ready.");
      return;
    }

    const fileId = extractFileIdFromUrl(driveUrl);
    if (!fileId) {
      setStatusMessage("Invalid Google Drive URL. Please check the link.");
      return;
    }

    setIsLoading(true);
    setFetchedContent('');
    setStatusMessage("Fetching file metadata...");

    try {
      const metaResponse = await window.gapi.client.drive.files.get({ fileId, fields: 'mimeType, name' });
      const { mimeType, name: fileName } = metaResponse.result;
      setStatusMessage(`Fetching content for "${fileName}"...`);

      let content = '';
      if (mimeType.includes('google-apps.document')) {
        const docResponse = await window.gapi.client.drive.files.export({ fileId, mimeType: 'text/plain' });
        content = docResponse.body;
      } else if (mimeType.includes('google-apps.spreadsheet')) {
        const sheetResponse = await window.gapi.client.drive.files.export({ fileId, mimeType: 'text/csv' });
        content = sheetResponse.body;
      } else {
        const fileResponse = await window.gapi.client.drive.files.get({ fileId, alt: 'media' });
        content = fileResponse.body;
      }

      setFetchedContent(content);
      setStatusMessage("Content fetched. Saving to database...");

      const collectionPath = `/users/${userId}/documents`;
      await addDoc(collection(db, collectionPath), {
        originalUrl: driveUrl,
        fileName,
        content,
        createdAt: serverTimestamp()
      });

      setStatusMessage(`Success! Content from "${fileName}" has been saved.`);
      setDriveUrl(''); // Clear input on success
    } catch (error: any) {
      console.error("Error during fetch/store process:", error);
      const errorMessage = error.result?.error?.message || "An unknown error occurred. Check file permissions and URL.";
      setStatusMessage(`Error: ${errorMessage}`);
      setFetchedContent('');
    } finally {
      setIsLoading(false);
    }
  };

  // --- New Function to Handle Deleting Documents ---
  const handleDelete = async (docId: string) => {
    if (!userId || !db) return;
    const docRef = doc(db, `/users/${userId}/documents`, docId);
    try {
        await deleteDoc(docRef);
        setStatusMessage("Document deleted successfully.");
        if (selectedDoc?.id === docId) {
            setSelectedDoc(null); // Clear selection if the selected doc is deleted
        }
    } catch (error) {
        console.error("Error deleting document:", error);
        setStatusMessage("Error: Could not delete document.");
    }
  };


  const areScriptsReady = isGapiLoaded && isGsiLoaded && isAuthReady;

  return (
    <div className="bg-slate-900 text-white min-h-screen font-sans p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">Drive Docket</h1>
          <p className="text-slate-400">Fetch content from a Google Drive URL and save it to your database.</p>
        </header>

        {isFirebaseInitialized ? (
          <>
            <div className="bg-slate-800 p-4 rounded-lg shadow-lg mb-6 flex items-center justify-between">
              <p className="text-sm">{isGoogleSignedIn ? "Google Account Connected" : "Connect your Google Account"}</p>
              <button
                onClick={handleAuthClick}
                disabled={!areScriptsReady}
                className={`px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 ${isGoogleSignedIn ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-500 hover:bg-cyan-600 text-slate-900'} disabled:bg-slate-600 disabled:cursor-not-allowed`}
              >
                {isGoogleSignedIn ? 'Disconnect' : 'Connect Google'}
              </button>
            </div>

            <main className="bg-slate-800/50 p-6 rounded-lg shadow-xl mb-8">
              <div className="space-y-4">
                <label htmlFor="driveUrl" className="block text-slate-300 font-medium">Google Drive Document URL</label>
                <input
                  type="text"
                  id="driveUrl"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-3 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                  disabled={isLoading || !isGoogleSignedIn}
                />
                <button
                  onClick={handleFetchAndStore}
                  disabled={isLoading || !isGoogleSignedIn || !driveUrl || !areScriptsReady}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-all duration-200 flex items-center justify-center disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Fetching...' : 'Fetch & Store Document'}
                </button>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold text-slate-400 mb-2">Status</h3>
                <div className="bg-slate-900/70 p-3 rounded-md text-sm text-cyan-300 min-h-[40px] flex items-center">
                  <p>{statusMessage}</p>
                </div>
              </div>

              {fetchedContent && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-slate-400">Fetched Content Preview</h3>
                    <button onClick={() => setFetchedContent('')} className="text-xs text-slate-400 hover:text-white">Clear</button>
                  </div>
                  <pre className="bg-slate-900/70 p-4 rounded-md text-sm text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto">{fetchedContent}</pre>
                </div>
              )}
            </main>

            {/* --- New Section to Display Saved Documents --- */}
            <section>
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Saved Documents</h2>
                {savedDocs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {savedDocs.map(doc => (
                            <div key={doc.id} className="bg-slate-800 p-4 rounded-lg shadow-lg flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-white truncate mb-2" title={doc.fileName}>{doc.fileName}</h3>
                                    <p className="text-xs text-slate-400 break-all truncate mb-1" title={doc.originalUrl}>{doc.originalUrl}</p>
                                    <p className="text-xs text-slate-500 mb-4">Saved: {new Date(doc.createdAt?.seconds * 1000).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setSelectedDoc(doc)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition">View</button>
                                    <button onClick={() => handleDelete(doc.id)} className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-slate-800/50 rounded-lg">
                        <p className="text-slate-400">No documents saved yet.</p>
                    </div>
                )}
            </section>

            <footer className="text-center mt-8 text-xs text-slate-500">
              <p>Your Firebase User ID: {userId || 'Connecting...'}</p>
            </footer>
          </>
        ) : (
           <div className="bg-slate-800 p-6 rounded-lg shadow-xl text-center">
             <h2 className="text-2xl font-bold text-red-500 mb-2">Initialization Error</h2>
             <p className="text-slate-300">Could not initialize Firebase. Please check the provided configuration.</p>
           </div>
        )}
      </div>

      {/* --- New Modal to View Full Document Content --- */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white truncate" title={selectedDoc.fileName}>{selectedDoc.fileName}</h2>
                </div>
                <div className="p-4 flex-grow overflow-y-auto">
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap">{selectedDoc.content}</pre>
                </div>
                <div className="p-4 border-t border-slate-700 text-right">
                    <button onClick={() => setSelectedDoc(null)} className="bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-semibold py-2 px-4 rounded-md transition">Close</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
