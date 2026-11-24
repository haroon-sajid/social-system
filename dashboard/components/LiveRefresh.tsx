"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-reads the page data every few seconds while the tab is visible,
// so drafts Claude saves through the connector appear without a reload.
export default function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [router, seconds]);
  return null;
}
