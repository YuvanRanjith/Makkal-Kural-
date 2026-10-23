import {getAccessToken} from "./session";
import type {Complaint} from "@/types/ticket";
export interface PendingReport {id:string;userId:string;category:string;description:string;latitude:number;longitude:number;image:Blob;maskedPhone:string;createdAt:string;}
export class ReportSubmissionError extends Error {constructor(message:string,public retryAt:string|null=null){super(message);this.name="ReportSubmissionError";}}
export async function sendReport(report:PendingReport,phone=""):Promise<Complaint>{
 const form=new FormData();form.append("requestId",report.id);form.append("category",report.category);form.append("description",report.description);form.append("latitude",String(report.latitude));form.append("longitude",String(report.longitude));form.append("image",report.image,"complaint.jpg");
 if(phone)form.append("phone",phone);if(report.maskedPhone)form.append("maskedPhone",report.maskedPhone);
 const response=await fetch("/api/report",{method:"POST",headers:{Authorization:"Bearer "+await getAccessToken(undefined,report.userId)},body:form});const result=await response.json();
 if(!response.ok)throw new ReportSubmissionError((result.error || "Could not submit your report.")+(process.env.NODE_ENV==="development" && result.detail?" Details: "+result.detail:""),result.retryAt||null);
 window.dispatchEvent(new Event("mk-report-saved"));return result.complaint;
}
