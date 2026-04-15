import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Home,
  ScanLine,
  Gift,
  User,
  ChevronRight,
  Sparkles,
  CalendarCheck,
  MessageSquareHeart,
  Users,
  Lock,
  Unlock,
  LogOut
} from 'lucide-react';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  collection,
  increment,
  serverTimestamp
} from "firebase/firestore";
import { addDoc } from "firebase/firestore";

// 🟡 [ISSUE 8] Extract constants:
const GOOGLE_REVIEW_URL = "https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review"; // Replace with actual business Google review link
const SHARE_TITLE = "Join & Earn Rewards";
const SHARE_TEXT = "Earn rewards with this app!";
const SHARE_URL = typeof window !== 'undefined' ? window.location.origin : '';

const BIZ_ID = "caffeto123"; // Business ID for loyalty program

// Premium Loyalty Card Progress Setup
const LOYALTY_REWARD = {
  nextTitle: 'Free Coffee',
  nextThreshold: 100,
  stampCount: 5,
  cardLabel: 'LUMIÈRE PREMIUM',
  memberLevel: 'Rose Gold'
};

// ---- Success Sound for iPhone fix ----
const playSuccessSound = () => {
  const audio = new Audio("https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3");
  audio.volume = 1;
  audio.play().catch(() => {});
};

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // === Camera Scanner State ===
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // ==== Real-time timer for review rewards ====
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  // ============================================

  const html5QrcodeScannerRef = useRef<any>(null);
  const scannerMountedRef = useRef(false);

  // === NEW: Ref to prevent duplicate QR claim logic
  const hasScannedRef = useRef(false);

  const [activeRedemption, setActiveRedemption] = useState<any>(null);
  const [existingRedemption, setExistingRedemption] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  // --- QR Claim: ATOMIC Firestore update + Visit History ---
  // 1 scan = 1 visit. Add a "visits" doc, update stats atomically.
  const claimVisit = async (isValidScan = false) => {
    if (!user) return;
    if (!isValidScan) {
      alert("Unauthorized action blocked ❌");
      return;
    }

    // Prevent running logic twice per scan even if somehow called - double-lock.
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    const statsId = `${user.uid}_${BIZ_ID}`;
    const statsRef = doc(db, 'userBusinessStats', statsId);

    try {
      // Create new visit document for analytics (visit history)
      await addDoc(collection(db, "visits"), {
        userId: user.uid,
        bizId: BIZ_ID,
        createdAt: serverTimestamp(),
      });

      // Atomically increment points and visitsCount, update lastVisitAt
      await updateDoc(statsRef, {
        userId: user.uid,
        bizId: BIZ_ID,
        totalPoints: increment(10),
        lastVisitAt: new Date().toISOString(),
        visitsCount: increment(1)
      });

      // Update local state based on actual numbers (prevents UI lag/race but doesn't block Firestore correctness)
      setStats((prev: any) => ({
        ...prev,
        totalPoints: (prev?.totalPoints ?? 0) + 10,
        lastVisitAt: new Date().toISOString(),
        visitsCount: (prev?.visitsCount ?? 0) + 1
      }));

      alert("☕ +10 points for visiting the cafe!");
    } catch (err) {
      alert("Error awarding visit points.");
    }
  };

  // STEP 5: ADD handleCompleteRedemption function (unchanged)
  const handleCompleteRedemption = async () => {
    if (!activeRedemption || !user || !stats) return;
    try {
      if (timeLeft <= 0) {
        alert("Code expired");
        return;
      }
      await updateDoc(doc(db, "redemptions", activeRedemption.id), {
        status: "completed"
      });
      const statsId = `${user.uid}_${BIZ_ID}`;
      const statsRef = doc(db, "userBusinessStats", statsId);
      const newPoints = Math.max(
        0,
        (stats.totalPoints ?? 0) - activeRedemption.pointsUsed
      );
      await updateDoc(statsRef, {
        totalPoints: newPoints
      });
      setStats((prev: any) => ({
        ...prev,
        totalPoints: newPoints
      }));
      setActiveRedemption(null);
      alert("Reward Redeemed 🎉");
    } catch (error) {
      console.error("Completion error:", error);
      alert("Something went wrong");
    }
  };

  // Firebase listeners and user logic: unchanged
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && isAuthReady) {
      const unsubscribe = onSnapshot(
        doc(db, 'users', user.uid),
        (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          } else {
            setUserData(null);
          }
        },
        (error) => {
          console.error("Firestore Error:", error);
        }
      );
      return () => unsubscribe();
    } else {
      setUserData(null);
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (user && isAuthReady) {
      const statsId = `${user.uid}_${BIZ_ID}`;
      const statsRef = doc(db, 'userBusinessStats', statsId);
      const unsubscribe = onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
          setStats(docSnap.data());
        } else {
          setStats({
            userId: user.uid,
            bizId: BIZ_ID,
            totalPoints: 0,
            lastVisitAt: ""
          });
        }
      }, (error) => {
        console.error("Stats Firestore Error:", error);
      });
      return () => unsubscribe();
    } else {
      setStats(null);
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!activeRedemption) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(activeRedemption.expiresAt).getTime();
      const secondsLeft = Math.max(0, Math.floor((expiry - now) / 1000));

      setTimeLeft(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(interval);
        updateDoc(doc(db, "redemptions", activeRedemption.id), {
          status: "expired"
        }).catch(() => {});

        alert("Code expired ⏱️");
        setActiveRedemption(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRedemption]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "redemptions"),
      where("userId", "==", user.uid),
      where("businessId", "==", BIZ_ID),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docData = snapshot.docs[0];
        setExistingRedemption({
          id: docData.id,
          ...docData.data()
        });
      } else {
        setExistingRedemption(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);
    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        const nowStr = new Date().toISOString();
        await setDoc(doc(db, 'users', newUser.uid), {
          uid: newUser.uid,
          name: name || 'User',
          email: newUser.email,
          createdAt: nowStr
        });
        const statsId = `${newUser.uid}_${BIZ_ID}`;
        await setDoc(
          doc(db, 'userBusinessStats', statsId),
          {
            userId: newUser.uid,
            bizId: BIZ_ID,
            totalPoints: 0,
            lastVisitAt: ""
          },
          { merge: true }
        );
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setAuthError(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const openReview = async () => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);

    setUserData((prev: any) => ({
      ...prev,
      reviewClickedAt: new Date().toISOString(),
      reviewCompleted: false,
    }));

    try {
      await updateDoc(userRef, {
        reviewClickedAt: new Date().toISOString()
      });
    } catch (err) {}
    window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer");
  };

  const claimReviewPoints = async () => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const statsId = `${user.uid}_${BIZ_ID}`;
    const statsRef = doc(db, 'userBusinessStats', statsId);

    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const clickedAt = data.reviewClickedAt ? new Date(data.reviewClickedAt) : null;
        if (!clickedAt) return;
        const diffMinutes = (now.getTime() - clickedAt.getTime()) / (1000 * 60);
        if (diffMinutes >= 2) {
          await setDoc(
            statsRef,
            {
              userId: user.uid,
              bizId: BIZ_ID,
              totalPoints: (stats?.totalPoints ?? 0) + 20,
            },
            { merge: true }
          );
          await updateDoc(userRef, {
            reviewClickedAt: null,
            reviewCompleted: true
          });

          setUserData((prev: any) => ({
            ...prev,
            reviewClickedAt: null,
            reviewCompleted: true
          }));
        }
      }
    } catch (error) {
      alert("Error claiming review reward.");
    }
  };

  const claimDailyReward = async () => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const statsId = `${user.uid}_${BIZ_ID}`;
    const statsRef = doc(db, 'userBusinessStats', statsId);

    let userSnap;
    try {
      userSnap = await getDoc(userRef);
    } catch (err) {
      alert("Could not read user data.");
      return;
    }
    let lastClaimISO: string | null | undefined = null;
    if (userSnap && userSnap.exists()) {
      const data = userSnap.data();
      lastClaimISO = data.lastDailyClaimAt as string | null;
    }
    const nowDate = new Date();
    let eligible = false;
    if (!lastClaimISO) {
      eligible = true;
    } else {
      const lastClaim = new Date(lastClaimISO);
      const diffHours = (nowDate.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      eligible = diffHours >= 24;
    }

    if (eligible) {
      try {
        await setDoc(
          statsRef,
          {
            userId: user.uid,
            bizId: BIZ_ID,
            totalPoints: (stats?.totalPoints ?? 0) + 5,
          },
          { merge: true }
        );
        await setDoc(
          userRef,
          {
            lastDailyClaimAt: nowDate.toISOString(),
          },
          { merge: true }
        );
        setUserData((prev: any) => ({
          ...prev,
          lastDailyClaimAt: nowDate.toISOString()
        }));
        alert("🎉 +5 points claimed!");
      } catch (err) {
        alert("Error claiming daily reward.");
      }
    } else {
      const last = lastClaimISO ? new Date(lastClaimISO) : null;
      const diffHours = last ? ((nowDate.getTime() - last.getTime()) / (1000 * 60 * 60)) : 999;
      const remaining = Math.ceil(24 - diffHours);
      alert(`Come back in ${remaining} hrs`);
    }
  };

  // ----------- Premium Loyalty Card Calculations ------------
  const userPoints = stats?.totalPoints ?? 0;
  const userName = userData?.name || 'User';
  const rewards = [
    {
      id: 1,
      title: 'Free Coffee',
      points: 100,
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93',
    },
    {
      id: 2,
      title: 'Free Croissant',
      points: 200,
      image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a',
    },
    {
      id: 3,
      title: 'Free Combo Meal',
      points: 400,
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5',
    },
  ];

  const handleRedeem = async (reward: any) => {
    if (!user || !stats) return;

    if ((stats.totalPoints ?? 0) < reward.points) {
      alert("Not enough points");
      return;
    }

    try {
      const q = query(
        collection(db, "redemptions"),
        where("userId", "==", user.uid),
        where("businessId", "==", BIZ_ID),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        alert("You already have an active reward. Please use it first.");
        return;
      }

      const confirmRedeem = window.confirm(
        `Redeem ${reward.title} for ${reward.points} points?`
      );

      if (!confirmRedeem) return;

      const code = Math.floor(100000 + Math.random() * 900000).toString();

      const redemptionData = {
        userId: user.uid,
        businessId: BIZ_ID,
        rewardId: reward.id,
        rewardName: reward.title,
        pointsUsed: reward.points,
        status: "pending",
        redemptionCode: code,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };

      const docRef = await addDoc(collection(db, "redemptions"), redemptionData);

      setActiveRedemption({
        id: docRef.id,
        ...redemptionData
      });

      setTimeLeft(15 * 60);

      console.log("Redemption created:", redemptionData);
    } catch (error) {
      console.error("Redemption error:", error);
      alert("Something went wrong");
    }
  };

  const nextReward =
    rewards.find(r => r.points > userPoints) ||
    { points: LOYALTY_REWARD.nextThreshold, title: LOYALTY_REWARD.nextTitle };

  const pointsToward = Math.min(userPoints, nextReward.points);
  const pointsNeeded = nextReward.points - userPoints > 0 ? nextReward.points - userPoints : 0;
  const progress = Math.min(userPoints / nextReward.points, 1);
  const stampCount = LOYALTY_REWARD.stampCount;
  const stampsFilled = Math.floor(progress * stampCount);

  const earnOptions = [
    { id: 'refer', title: 'Refer a Friend', points: 50, icon: Users, color: 'bg-rose-100 text-rose-700' },
    { id: 'login', title: 'Daily Login', points: 5, icon: CalendarCheck, color: 'bg-amber-100 text-amber-700' },
    { id: 'review', title: 'Leave a Review', points: 20, icon: MessageSquareHeart, color: 'bg-stone-200 text-stone-700' },
    { id: 'visit', title: 'Visit Cafe', points: 'Scan QR', icon: ScanLine, color: 'bg-emerald-100 text-emerald-700' },
  ];

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: SHARE_TITLE,
          text: SHARE_TEXT,
          url: SHARE_URL
        });
      } else {
        await navigator.clipboard.writeText(SHARE_URL);
        alert("Copied link to clipboard! Paste to share.");
      }
    } catch (e) {
      alert("Couldn't share.");
    }
  };

  const handleEarnClick = async (id: string, extra?: { isReview: boolean; clickedAt?: Date | null; isClaimable?: boolean; reviewCompleted?: boolean }) => {
    if (!user) return;
    switch (id) {
      case 'review': {
        if (extra?.reviewCompleted) return;
        if (!extra?.clickedAt) {
          await openReview();
        } else if (extra?.isClaimable) {
          await claimReviewPoints();
        }
        break;
      }
      case 'visit': {
        setActiveTab('scan');
        break;
      }
      case 'refer': {
        await handleShare();
        break;
      }
      case 'login': {
        await claimDailyReward();
        break;
      }
      default:
        break;
    }
  };

  // [SECURE QR SCAN HANDLER: 1 scan = 1 visit, atomic, no race/duplication]
  useEffect(() => {
    const runScanner = async () => {
      if (activeTab !== 'scan') {
        // On leaving scan tab, stop scanner and reset scanning state
        if (scannerMountedRef.current && html5QrcodeScannerRef.current) {
          try {
            await html5QrcodeScannerRef.current.stop();
          } catch {}
          html5QrcodeScannerRef.current.clear();
        }
        scannerMountedRef.current = false;
        hasScannedRef.current = false;
        return;
      }
      setScannerLoading(true);
      setScannerError(null);
      let Html5Qrcode;
      try {
        // @ts-ignore
        Html5Qrcode = (await import("html5-qrcode")).Html5Qrcode;
      } catch (err) {
        setScannerError("Failed to load QR scanner library.");
        setScannerLoading(false);
        return;
      }
      if (scannerMountedRef.current) return;
      scannerMountedRef.current = true;
      hasScannedRef.current = false; // Reset for new scan session
      const readerElem = document.getElementById('reader');
      if (!readerElem) {
        setScannerError("Scanner DOM not ready");
        setScannerLoading(false);
        return;
      }
      const html5QrInst = new Html5Qrcode("reader");
      html5QrcodeScannerRef.current = html5QrInst;
      try {
        const config = { fps: 10, qrbox: { width: 200, height: 200 } };
        await html5QrInst.start(
          { facingMode: "environment" },
          config,
          async (decodedText: string) => {
            // SCAN CALLBACK – prevent duplicate logic
            if (hasScannedRef.current) return;
            hasScannedRef.current = true;

            setScannerLoading(true);

            // NOTE: stop() must be awaited first to release camera before app state changes, but do NOT clear the ref before logic!
            await html5QrInst.stop().catch(() => {});
            html5QrcodeScannerRef.current = null;

            // === Allow ONLY a strict valid QR code
            const VALID_QR = "VISIT_CAFFETO_123";
            const cleanedText = typeof decodedText === 'string' ? decodedText.trim() : '';
            if (cleanedText !== VALID_QR) {
              alert("Invalid QR Code ❌");
              setScannerLoading(false);
              scannerMountedRef.current = false;
              setActiveTab('home');
              hasScannedRef.current = false; // Allow retry on next scan
              return;
            }

            // Success feedback
            try {
              playSuccessSound();
              if (navigator.vibrate) {
                navigator.vibrate(200);
              }
            } catch {}

            await claimVisit(true);
            setScannerLoading(false);
            scannerMountedRef.current = false;
            setActiveTab('home');
            // Don't reset hasScannedRef here; will be reset if user returns to scan tab
          },
          (error: any) => {}
        );
        setScannerLoading(false);
      } catch (err: any) {
        setScannerError(typeof err === 'string' ? err : "Camera permission denied or unavailable.");
        setScannerLoading(false);
        scannerMountedRef.current = false;
        hasScannedRef.current = false;
      }

      // Cleanup on unmount or tab change
      return () => {
        if (html5QrcodeScannerRef.current) {
          html5QrcodeScannerRef.current.stop().catch(() => {});
          html5QrcodeScannerRef.current.clear();
        }
        html5QrcodeScannerRef.current = null;
        scannerMountedRef.current = false;
        hasScannedRef.current = false;
      };
    };

    runScanner();
    // eslint-disable-next-line
  }, [activeTab, user]);

  if (!isAuthReady) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin"></div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-stone-800 flex justify-center">
        <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative overflow-hidden flex flex-col justify-center p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>

          <div className="relative z-10">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-8">
              <Sparkles className="w-8 h-8 text-rose-600" />
            </div>
            <h1 className="text-3xl font-serif font-medium text-stone-900 mb-2">
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-stone-500 mb-8">
              {authMode === 'login' ? 'Sign in to access your rewards' : 'Join Lumière Rewards today'}
            </p>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                    placeholder="Eleanor Shellstrop"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  placeholder="eleanor@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  placeholder="••••••••"
                />
              </div>

              {authError && <p className="text-sm text-red-500">{authError}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-all shadow-md disabled:opacity-70"
              >
                {isLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
              </button>
            </form>

            <div className="mt-8 text-center">
              <button
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-24 flex justify-center">
      <div className="w-full max-w-md bg-stone-50 min-h-screen shadow-2xl relative overflow-hidden">

        {activeTab === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pb-6"
          >
            {/* ... UI unchanged ... */}
            {/* ... main content omitted for brevity ... */}
          </motion.div>
        )}

        {/* SCAN TAB – Cafe */}
        {activeTab === 'scan' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 pt-24 flex flex-col items-center justify-center min-h-[70vh] text-center"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
              <ScanLine className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-serif font-medium text-stone-900 mb-2">Scan QR</h1>
            <div
              id="reader"
              style={{ width: 260, height: 260, margin: "0 auto", marginTop: 8, display: "flex", justifyContent: "center" }}
            ></div>
            {scannerLoading && <div className="text-stone-500 mt-3">Loading camera...</div>}
            {scannerError && <div className="text-red-500 mt-3">{scannerError}</div>}
            <p className="text-stone-400 text-sm mt-4 mb-2">
              Scan the QR at the cafe counter to collect your points!
            </p>
          </motion.div>
        )}

        {/* ... other tabs unchanged ... */}

        {/* Bottom Navigation etc unchanged ... */}

        {/* Redemption Modal unchanged ... */}

      </div>
    </div>
  );
}