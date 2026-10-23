"use client";
import { useEffect, useState } from "react";
import { formatTimeLeft } from "@/lib/utils/time";
export default function Timer({ deadline }: { deadline: string }) {
  const [timeLeft,setTimeLeft] = useState(() => formatTimeLeft(deadline));
  useEffect(() => {const update = () => setTimeLeft(formatTimeLeft(deadline));update();const timer=setInterval(update,1000);return () => clearInterval(timer);}, [deadline]);
  return <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-mono text-amber-900" aria-label={'Verification: ' + timeLeft} suppressHydrationWarning>{timeLeft}</span>;
}
