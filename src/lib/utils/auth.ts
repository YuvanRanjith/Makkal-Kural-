export function normalizePhone(value: string): string {
 const digits=value.replace(/[\s()+-]/g,"");
 if (/^[6-9]\d{9}$/.test(digits)) return "+91"+digits;
 if (/^91[6-9]\d{9}$/.test(digits)) return "+"+digits;
 throw new Error("Enter a valid 10-digit Indian mobile number.");
}
export function safeReturnPath(value: string | null) {
 if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/login") || value.startsWith("/staff")) return "/";
 try {const parsed=new URL(value,"https://makkal.invalid");if(parsed.origin!=="https://makkal.invalid")return "/";return parsed.pathname+parsed.search;}catch{return "/";}
}
export function cooldownSeconds(nextReportAt: string | null, now=Date.now()) {
 const deadline=nextReportAt ? Date.parse(nextReportAt) : 0;
 return Number.isFinite(deadline) ? Math.max(0,Math.ceil((deadline-now)/1000)) : 0;
}
export function cooldownLabel(seconds: number) {return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");}
