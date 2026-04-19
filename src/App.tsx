
  // ---- loyalty app code ----
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  runTransaction
} from "firebase/firestore";

import { addDoc } from "firebase/firestore"; // Already included above in full collection import

// 🟡 [ISSUE 8] Extract constants:  
const GOOGLE_REVIEW_URL = "https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review"; // Replace with actual business Google review link
const SHARE_TITLE = "Join & Earn Rewards";
const SHARE_TEXT = "Earn rewards with this app!";
const SHARE_URL = typeof window !== 'undefined' ? window.location.origin : '';

const BIZ_ID = "caffeto123"; // Business ID for loyalty program

// Premium Loyalty Card Progress Setuppppppp
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

// Toast Component and Toast Hook (Minimal, lightweight)
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.28 }}
          className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[99] select-none px-6 py-3 rounded-xl bg-stone-900 text-white shadow-lg text-sm font-medium pointer-events-none"
          style={{ minWidth: 200, textAlign: 'center' }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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

  // === Toast State ===
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  // Utility: show toast message for 2 seconds (or replace if one showing)
  const showToast = (msg: string) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  // === Camera Scanner State ===
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // ==== Real-time timer for review rewards ====
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000); // shorter interval for countdown accuracy (ISSUE 6)
    return () => clearInterval(interval);
  }, []);
   
  // ============================================

  const html5QrcodeScannerRef = useRef<any>(null);
  const scannerMountedRef = useRef(false);
  const hasScannedRef = useRef(false);

  // STEP 1: ADD STATE (top with other useState)
  const [activeRedemption, setActiveRedemption] = useState<any>(null);

  // === NEW STATE for user's active pending reward ===
  const [existingRedemption, setExistingRedemption] = useState<any>(null);

  // STEP 4.1: ADD TIMER STATE
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  // STEP 5: ADD handleCompleteRedemption function
  const handleCompleteRedemption = async () => {
    if (!activeRedemption || !user || !stats) return;
    try {
      // 1. Check if already expired
      if (timeLeft <= 0) {
        showToast("Code expired");
        return;
      }

      // 2. Update redemption status
      await updateDoc(doc(db, "redemptions", activeRedemption.id), {
        status: "completed"
      });

      // 3. Deduct points
      const statsId = `${user.uid}_${BIZ_ID}`;
      const statsRef = doc(db, "userBusinessStats", statsId);
      const newPoints = Math.max(
        0,
        (stats.totalPoints ?? 0) - activeRedemption.pointsUsed
      );
      await updateDoc(statsRef, {
        totalPoints: newPoints
      });

      // 4. Update local state instantly
      setStats((prev: any) => ({
        ...prev,
        totalPoints: newPoints
      }));

      // 5. Close modal
      setActiveRedemption(null);

      // 6. Success feedback
      showToast("Reward Redeemed 🎉");
    } catch (error) {
      console.error("Completion error:", error);
      showToast("Something went wrong");
    }
  };

  // [ISSUE 8] Avoid duplicate Firestore calls
  useEffect(() => {
    const authReadyTimeout = window.setTimeout(() => {
      setIsAuthReady(true);
    }, 8000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        window.clearTimeout(authReadyTimeout);
        setUser(currentUser);
        setIsAuthReady(true);
      },
      (error) => {
        console.error("Auth state listener error:", error);
        window.clearTimeout(authReadyTimeout);
        setIsAuthReady(true);
      }
    );

    return () => {
      window.clearTimeout(authReadyTimeout);
      unsubscribe();
    };
  }, []);

  // Listen to user profile for name and review data, but NOT points (points are now in userBusinessStats)
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

  // Listen to userBusinessStats for points etc
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

  // STEP 4.2: ADD useEffect FOR TIMER
  useEffect(() => {
    if (!activeRedemption) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(activeRedemption.expiresAt).getTime();
      const secondsLeft = Math.max(0, Math.floor((expiry - now) / 1000));

      setTimeLeft(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(interval);

        // mark expired in Firestore
        updateDoc(doc(db, "redemptions", activeRedemption.id), {
          status: "expired"
        }).catch(() => {});

        showToast("Code expired ⏱️");
        setActiveRedemption(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRedemption]);

  // STEP 2: Fetch active redemption for user
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "redemptions"),
      where("userId", "==", user.uid),
      where("businessId", "==", BIZ_ID),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const docData = snapshot.docs[0];
          setExistingRedemption({
            id: docData.id,
            ...docData.data()
          });
        } else {
          setExistingRedemption(null);
        }
      },
      (error) => {
        console.error("Existing redemption listener error:", error);
        setExistingRedemption(null);
      }
    );

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
        // [ISSUE 5] Don't set lastLoginDate here (not used)
        // Create their stats doc as well (optional, but guarantees Firestore presence)
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
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // [ISSUE 5] On login, we intentionally do NOT update lastLoginDate anymore.
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
      showToast("Error claiming review reward.");
    }
  };

  // [ISSUE 5]: Claim Daily Reward using lastDailyClaimAt only!
  // (unchanged; you requested only changes for claimVisit, not daily reward)
  const claimDailyReward = async () => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const statsId = `${user.uid}_${BIZ_ID}`;
    const statsRef = doc(db, 'userBusinessStats', statsId);

    let userSnap;
    try {
      userSnap = await getDoc(userRef);
    } catch (err) {
      showToast("Could not read user data.");
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
        // Set lastDailyClaimAt (NOT lastLoginDate!)
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
        showToast("🎉 +5 points claimed!");
      } catch (err) {
        showToast("Error claiming daily reward.");
      }
    } else {
      const last = lastClaimISO ? new Date(lastClaimISO) : null;
      const diffHours = last ? ((nowDate.getTime() - last.getTime()) / (1000 * 60 * 60)) : 999;
      const remaining = Math.ceil(24 - diffHours);
      showToast(`Come back in ${remaining} hrs`);
    }
  };

  // ====== [ISSUE 2, FIXED, see below] ======
  // Updated per prompt: claimVisit takes isValidScan = false by default. If false, blocks with alert.

  
  const claimVisit = async (isValidScan = false) => {
    if (!user) return;
  
    if (!isValidScan) {
      showToast("Unauthorized action blocked ❌");
      return;
    }
  
    const statsId = `${user.uid}_${BIZ_ID}`;
    const statsRef = doc(db, 'userBusinessStats', statsId);
  
    try {
      let shouldAddVisit = false;
  
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(statsRef);
        const now = Date.now();
  
        if (docSnap.exists()) {
          const data = docSnap.data();
          const lastVisit = data.lastVisitAt
            ? new Date(data.lastVisitAt).getTime()
            : 0;
  
          if (now - lastVisit < 10000) {
            // console.log("Duplicate blocked");
            showToast("Duplicate blocked");
            return;
          }
  
          shouldAddVisit = true;
  
          transaction.set(
            statsRef,
            { 
              userId: user.uid,
              bizId: BIZ_ID,
              totalPoints: increment(10),
              visitsCount: increment(1),
              lastVisitAt: new Date().toISOString()
            },
            { merge: true }
          );
  
        } else {
          shouldAddVisit = true;
  
          transaction.set(statsRef, {
            userId: user.uid,
            bizId: BIZ_ID,
            totalPoints: 10,
            visitsCount: 1,
            lastVisitAt: new Date().toISOString()
          });
        }
      });
  
      if (shouldAddVisit) {
        await addDoc(collection(db, "visits"), {
          userId: user.uid,
          shopId: BIZ_ID,
          timestamp: new Date()
        });
  
        showToast("☕ +10 points for visiting the cafe!");
      }
  
    } catch (err) {
      console.error("Visit error:", err);
      showToast("Error awarding visit points.");
    }
  };
  // ======================================================================

  // ----------- Premium Loyalty Card Calculations ------------
  const userPoints = stats?.totalPoints ?? 0;
  const userName = userData?.name || 'User';

  // [ISSUE 4/5/6] Cafe Rewards + Images
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

  // STEP 2: Update handleRedeem to async & Firestore redemption w/ modal state
  const handleRedeem = async (reward: any) => {
    if (!user || !stats) return;

    if ((stats.totalPoints ?? 0) < reward.points) {
      showToast("Not enough points");
      return;
    }

    // 🔴 Check if user already has active redemption
    try {
      const q = query(
        collection(db, "redemptions"),
        where("userId", "==", user.uid),
        where("businessId", "==", BIZ_ID),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        showToast("You already have an active reward. Please use it first.");
        return;
      }

      // Optional: ask for confirmation before creating
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

      // STEP 4.4: RESET TIMER ON NEW REDEMPTION
      setTimeLeft(15 * 60);

      // console.log("Redemption created:", redemptionData);
    } catch (error) {
      console.error("Redemption error:", error);
      showToast("Something went wrong");
    }
  };

  const nextReward =
    rewards.find(r => r.points > userPoints) ||
    { points: LOYALTY_REWARD.nextThreshold, title: LOYALTY_REWARD.nextTitle };

  const pointsToward = Math.min(userPoints, nextReward.points);
  const pointsNeeded = nextReward.points - userPoints > 0 ? nextReward.points - userPoints : 0;
  const progress = Math.min(userPoints / nextReward.points, 1);

  // Stamps (5 circles - fill as progress grows)
  const stampCount = LOYALTY_REWARD.stampCount;
  const stampsFilled = Math.floor(progress * stampCount);

  // [ISSUE 3] EARNING OPTIONS – REBRAND, LABELS
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
        showToast("Copied link to clipboard! Paste to share.");
      }
    } catch (e) {
      showToast("Couldn't share.");
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

  // [ISSUE 1] Secure QR SCAN HANDLER (Accept ONLY valid code)
  useEffect(() => {
    const runScanner = async () => {
      if (activeTab !== 'scan') {
        if (scannerMountedRef.current && html5QrcodeScannerRef.current) {
          try {
            await html5QrcodeScannerRef.current.stop();
          } catch {}
          html5QrcodeScannerRef.current.clear();
        }
        scannerMountedRef.current = false;
        // Reset scan lock on exit
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
        hasScannedRef.current = false;
        return;
      }
      if (scannerMountedRef.current) return;
      scannerMountedRef.current = true;
      const readerElem = document.getElementById('reader');
      if (!readerElem) {
        setScannerError("Scanner DOM not ready");
        setScannerLoading(false);
        hasScannedRef.current = false;
        return;
      }
      const html5QrInst = new Html5Qrcode("reader");
      html5QrcodeScannerRef.current = html5QrInst;
      try {
        const config = { fps: 15 };
      
        await html5QrInst.start(
          { facingMode: "environment" },
          config,
          // [SECURE SCANNER CALLBACK - CRITICAL]
          async (decodedText: string) => {
            if (hasScannedRef.current) return;

            hasScannedRef.current = true;
            
            // HARD STOP: prevent any further execution instantly
            setTimeout(() => {
              hasScannedRef.current = true;
            }, 0);

            setScannerLoading(true);

            html5QrInst.stop().catch(() => {});
            html5QrcodeScannerRef.current = null;

            // === DYNAMIC QR CALLBACK LOGIC ===
            // QR format: "<shopId>_<timeBlock>"
        
            const cleanedText = typeof decodedText === 'string' ? decodedText.trim() : '';
            const parts = cleanedText.split("_");

            if (parts.length !== 2) {
              showToast("Invalid QR Code ❌");
              setScannerLoading(false);
              scannerMountedRef.current = false;
              hasScannedRef.current = false; // Reset for next scan
              setTimeout(() => setActiveTab('home'), 800);
              return;
            }

            const [shopId, qrBlockStr] = parts;
            if (shopId !== BIZ_ID) {
              showToast("Wrong shop QR ❌");
              setScannerLoading(false);
              scannerMountedRef.current = false;
              hasScannedRef.current = false;
              setTimeout(() => setActiveTab('home'), 800);
              return;
            }

            const nowBlock = Math.floor(Date.now() / 30000);
            const qrBlock = Number(qrBlockStr);
            if (!Number.isFinite(qrBlock) || Math.abs(nowBlock - qrBlock) > 1) {
              showToast("QR expired ❌\n(Scan must be recent, try again)");
              setScannerLoading(false);
              scannerMountedRef.current = false;
              hasScannedRef.current = false;
              setTimeout(() => setActiveTab('home'), 800);
              return;
            }

            // ======= SUCCESS SOUND AND VIBRATION (iPhone Safari fix) =======
            try {
              playSuccessSound();
              if (navigator.vibrate) {
                navigator.vibrate(200);
              }
            } catch {}
            // ======= /SUCCESS SOUND AND VIBRATION =======

            await claimVisit(true);
            setScannerLoading(false);
            scannerMountedRef.current = false;
            hasScannedRef.current = false; // Reset for next scan
            setTimeout(() => setActiveTab('home'), 800);
          },
          (error: any) => {
            // Optionally show scan errors here
          }
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
        scannerMountedRef.current = false;
        if (html5QrcodeScannerRef.current) {
          html5QrcodeScannerRef.current.stop().catch(() => {});
          html5QrcodeScannerRef.current.clear();
        }
        html5QrcodeScannerRef.current = null;
        hasScannedRef.current = false; // Always reset scan lock in cleanup
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

        {/* Toast Notification */}
        <Toast message={toast} visible={toastVisible} />

        {activeTab === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pb-6"
          >
            {/* Header & Premium Loyalty Card */}
            <div className="p-5 pt-10 bg-white rounded-b-[2.5rem] shadow-sm relative z-10">
              {/* Top Row */}
              <div className="flex justify-between items-center mb-5">
                <div>
                  <p className="text-xs text-stone-400 uppercase tracking-widest mb-0.5">Welcome back</p>
                  <h1 className="text-xl sm:text-2xl font-serif font-semibold text-stone-900">{userName}</h1>
                </div>
                <div className="w-10 h-10 rounded-full overflow-hidden border border-rose-100 bg-stone-100">
                  <img
                    // [ISSUE 5] cafe/cafe interior user profile/fallback
                    src="https://images.unsplash.com/photo-1554118811-1e0d58224f24"
                    alt="Profile"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Apple Wallet Style Premium Card */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl md:rounded-3xl shadow-xl px-5 py-6 mt-1 mb-2 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900"
                style={{
                  border: '1.5px solid #ece4e1',
                  boxShadow: '0 6px 22px 0 rgba(42,8,28,0.09)',
                }}
              >
                <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -translate-x-12 -translate-y-10" />
                <div className="absolute bottom-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl translate-x-10 translate-y-8" />
                <div className="flex flex-col relative z-10">
                  {/* Card Label/Brand */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="uppercase text-xs font-medium tracking-wide text-stone-300/90">{LOYALTY_REWARD.cardLabel}</span>
                    <Sparkles className="w-4 h-4 text-rose-200 opacity-80" />
                  </div>

                  {/* Points Large */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight text-white">{userPoints}</span>
                    <span className="text-base font-medium text-rose-200/80 opacity-90">pts</span>
                  </div>

                  {/* Progress bar & amount toward next */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-medium text-white/80">
                      {pointsToward} / {nextReward.points} pts{' '}
                      <span className="text-rose-200/90 font-normal">to {nextReward.title}</span>
                    </div>
                  </div>

                  {/* Elegant animated progress bar */}
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.floor(progress * 100)}%` }}
                      transition={{ delay: 0.4, duration: 1.1 }}
                      className="h-full bg-gradient-to-r from-rose-300 to-rose-400 rounded-full shadow-sm"
                    />
                  </div>

                  {/* Subtle Stamp/Circle Progress Indicators */}
                  <div className="flex items-center gap-2 justify-end">
                    {[...Array(stampCount)].map((_, i) => (
                      <span
                        key={i}
                        className={`inline-block rounded-full transition-all duration-300`}
                        style={{
                          width: 16,
                          height: 16,
                          background:
                            i < stampsFilled
                              ? 'linear-gradient(to right, #ffa69e 65%, #ffd6d6 100%)'
                              : 'rgba(255,255,255,0.28)',
                          border:
                            i < stampsFilled
                              ? '1.5px solid #f9c7b5'
                              : '1.5px solid rgba(255,255,255,.18)',
                          boxShadow: i < stampsFilled ? '0 0 0 1.5px #f9c7b588' : undefined,
                        }}
                        aria-label={i < stampsFilled ? "Full stamp" : "Empty stamp"}
                      ></span>
                    ))}
                  </div>

                  {/* Member Level and minimal status */}
                  <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-stone-400/90 font-medium">
                    <span>{LOYALTY_REWARD.memberLevel} Member</span>
                    {pointsNeeded > 0 ? (
                      <span>
                        <span className="font-semibold text-white">{pointsNeeded}</span>
                        <span className="ml-1">pts to {nextReward.title}</span>
                      </span>
                    ) : (
                      <span className="text-rose-200 font-semibold">Reward Ready!</span>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Main Content */}
            <div className="p-5 space-y-8">

              {/* Rewards Section */}
              <section>
                <div className="flex justify-between items-end mb-3">
                  <h2 className="text-lg font-serif font-semibold text-stone-900">Available Rewards</h2>
                  <button className="text-sm text-stone-500 hover:text-rose-600 flex items-center gap-1 transition-colors" onClick={() => setActiveTab('rewards')}>
                    See all <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 snap-x hide-scrollbar">
                  {rewards.map((reward, index) => {
                    const isUnlocked = userPoints >= reward.points;
                    return (
                      <motion.div
                        key={reward.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.09 }}
                        className={`min-w-[185px] max-w-[185px] snap-start rounded-xl overflow-hidden relative shadow border ${isUnlocked ? 'border-rose-100 bg-white' : 'border-stone-100 bg-stone-50/50'}`}
                      >
                        <div className="h-24 overflow-hidden relative">
                          <img
                            src={reward.image}
                            alt={reward.title}
                            className={`w-full h-full object-cover transition-transform duration-300 hover:scale-105 ${!isUnlocked ? 'grayscale opacity-60' : ''}`}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-white text-[11px] font-medium shadow">
                            {isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {reward.points} pts
                          </div>
                        </div>
                        <div className="p-3 pb-3.5">
                          <h3 className={`font-medium mb-1 text-base truncate ${isUnlocked ? 'text-stone-900' : 'text-stone-500'}`}>{reward.title}</h3>
                          <button
                            disabled={!isUnlocked}
                            className={`w-full py-2 rounded-lg text-[13px] font-semibold transition-all mt-1.5
                              ${isUnlocked
                                ? 'bg-stone-900 text-white hover:bg-stone-800 shadow'
                                : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`
                            }
                            onClick={() => handleRedeem(reward)}
                          >
                            {isUnlocked ? 'Redeem' : 'Locked'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {/* Earn Points Section */}
              <section>
                <h2 className="text-lg font-serif font-semibold text-stone-900 mb-3">Earn More Points</h2>
                <button
                  onClick={() => handleEarnClick('login')}
                  className="w-full bg-rose-600 text-white py-3 rounded-xl mb-4 font-medium shadow-sm active:bg-rose-700 transition-all"
                >
                  Claim Daily Reward (+5)
                </button>

                <div className="grid grid-cols-1 gap-3">
                  {earnOptions.map((option, index) => {
                    const isReview = option.id === 'review';
                    const isVisit = option.id === 'visit';
                    const isRefer = option.id === 'refer';
                    const isLogin = option.id === 'login';

                    const clickedAt = isReview && userData?.reviewClickedAt
                      ? new Date(userData.reviewClickedAt)
                      : null;
                    const reviewCompleted = isReview ? Boolean(userData?.reviewCompleted) : false;

                    const diffMinutes = clickedAt ? (now.getTime() - clickedAt.getTime()) / (1000 * 60) : null;
                    const isClaimable = isReview && Boolean(clickedAt && diffMinutes !== null && diffMinutes >= 2 && !reviewCompleted);

                    const titleText = isReview
                      ? reviewCompleted
                        ? 'Completed'
                        : isClaimable
                          ? 'Claim Reward'
                          : clickedAt
                            ? 'Review Submitted'
                            : 'Leave a Review'
                      : option.title;

                    const subtitleText = isReview
                      ? reviewCompleted
                        ? 'Reward Claimed ✅'
                        : isClaimable
                          ? '+20 points'
                          : clickedAt
                            ? `Come back in a moment...`
                            : '+20 points'
                      : (typeof option.points === 'number' ? `+${option.points} points` : option.points);

                    const cardClassNames = [
                      'bg-white p-4 rounded-2xl cursor-pointer border',
                      isReview
                        ? reviewCompleted
                          ? 'opacity-80 border-emerald-200 bg-emerald-50'
                          : isClaimable
                            ? 'border-rose-300 ring-2 ring-rose-200'
                            : 'border-stone-100'
                        : 'border-stone-100'
                    ].join(' ');

                    const handleClick = () =>
                      handleEarnClick(option.id, {
                        isReview,
                        clickedAt,
                        isClaimable,
                        reviewCompleted
                      });

                    return (
                      <motion.div
                        key={option.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + index * 0.08 }}
                        onClick={handleClick}
                        className={cardClassNames}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center ${option.color}`}>
                            <option.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className={`font-medium leading-tight ${isReview && reviewCompleted ? 'text-emerald-700' : 'text-stone-900'} group-hover:text-rose-700 transition-colors text-[15px]`}>
                              {titleText}
                            </h3>
                            <p className={`text-xs ${isReview && reviewCompleted ? 'text-emerald-700' : 'text-stone-500'}`}>
                              {subtitleText}
                            </p>
                            {isReview && clickedAt && !isClaimable && !reviewCompleted && (
                              <p className="text-xs text-stone-400 mt-1">
                                {`Wait ${Math.max(1, Math.ceil(2 - (diffMinutes ?? 0)))} min`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className={`w-7 h-7 rounded-full ${isReview && isClaimable ? 'bg-rose-50' : 'bg-stone-50'} flex items-center justify-center group-hover:bg-rose-50 transition-colors ml-auto`}>
                          <ChevronRight className={`w-4 h-4 ${isReview && isClaimable ? 'text-rose-600' : 'text-stone-400'} group-hover:text-rose-600`} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            </div>
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
              style={{ width: 320, height: 320, margin: "0 auto", marginTop: 8, display: "flex", justifyContent: "center" }}
            ></div>
            {scannerLoading && <div className="text-stone-500 mt-3">Loading camera...</div>}
            {scannerError && <div className="text-red-500 mt-3">{scannerError}</div>}
            <p className="text-stone-400 text-sm mt-4 mb-2">
              Scan the QR at the cafe counter to collect your points!
            </p>
            {/* Claim Visit Points (+10) button removed as per prompt */}
          </motion.div>
        )}

        {activeTab === 'rewards' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 pt-16"
          >
            <h1 className="text-2xl font-serif font-medium text-stone-900 mb-6">All Rewards</h1>
            {/* Active reward notification shown at top of rewards tab */}
            {existingRedemption && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <h2 className="text-sm font-semibold text-emerald-700 mb-1">
                  Active Reward
                </h2>
                <p className="text-lg font-bold tracking-widest">
                  {existingRedemption.redemptionCode}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  Show this code to staff
                </p>
                <button
                  onClick={() => setActiveRedemption(existingRedemption)}
                  className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-lg text-sm"
                >
                  Open Reward
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {rewards.map((reward, index) => {
                const isUnlocked = userPoints >= reward.points;
                return (
                  <motion.div
                    key={reward.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className={`rounded-2xl overflow-hidden relative shadow-sm border ${isUnlocked ? 'border-stone-200 bg-white' : 'border-stone-100 bg-stone-50/50'}`}
                  >
                    <div className="h-24 overflow-hidden relative">
                      <img
                        src={reward.image}
                        alt={reward.title}
                        className={`w-full h-full object-cover ${!isUnlocked ? 'grayscale opacity-60' : ''}`}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-white text-[10px] font-medium">
                        {isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {reward.points} pts
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className={`font-medium text-sm mb-2 truncate ${isUnlocked ? 'text-stone-900' : 'text-stone-500'}`}>{reward.title}</h3>
                      <button
                        disabled={!isUnlocked}
                        className={`w-full py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isUnlocked
                            ? 'bg-stone-900 text-white hover:bg-stone-800'
                            : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                        }`}
                        onClick={() => handleRedeem(reward)}
                      >
                        {isUnlocked ? 'Redeem' : 'Locked'}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 pt-16"
          >
            <h1 className="text-2xl font-serif font-medium text-stone-900 mb-6">Profile</h1>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose-100">
                  <img
                    // [ISSUE 5] cafe/cafe interior user profile/fallback (profile tab)
                    src="https://images.unsplash.com/photo-1554118811-1e0d58224f24"
                    alt="Profile"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-stone-900">{userName}</h2>
                  <p className="text-stone-500 text-sm">Rose Gold Member</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full bg-white border border-stone-200 text-stone-700 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </motion.div>
        )}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="w-full max-w-md bg-white border-t border-stone-100 px-6 py-4 flex justify-between items-center rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] pointer-events-auto">
            {[
              { id: 'home', icon: Home, label: 'Home' },
              { id: 'scan', icon: ScanLine, label: 'Scan' },
              { id: 'rewards', icon: Gift, label: 'Rewards' },
              { id: 'profile', icon: User, label: 'Profile' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center gap-1 relative"
              >
                <div className={`p-2 rounded-xl transition-colors ${activeTab === tab.id ? 'bg-rose-50 text-rose-600' : 'text-stone-400 hover:text-stone-600'}`}>
                  <tab.icon className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-medium ${activeTab === tab.id ? 'text-rose-600' : 'text-stone-400'}`}>
                  {tab.label}
                </span>
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-4 w-1 h-1 bg-rose-600 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* STEP 3: Redemption Modal */}
        {activeRedemption && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 w-[90%] max-w-sm text-center">
              <h2 className="text-xl font-semibold mb-2">
                {activeRedemption.rewardName}
              </h2>

              <p className="text-sm text-stone-500 mb-4">
                Show this code to staff
              </p>

              <div className="text-4xl font-bold tracking-widest mb-6">
                {activeRedemption.redemptionCode}
              </div>

              {/* STEP 4.3: SHOW TIMER BELOW CODE */}
              <p className="text-sm text-red-500 mt-2">
                ⏳ {minutes}:{seconds.toString().padStart(2, '0')} remaining
              </p>

              {/* STEP 5: Mark as Used button */}
              <button
                onClick={handleCompleteRedemption}
                disabled={timeLeft <= 0}
                className={`w-full py-2 rounded-lg mt-3 ${
                  timeLeft <= 0
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white"
                }`}
              >
                Mark as Used
              </button>

              <button
                onClick={() => setActiveRedemption(null)}
                className="w-full py-2 bg-stone-900 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
