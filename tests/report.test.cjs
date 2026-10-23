require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { NextRequest } = require('next/server');
let authenticated=true, existing=null, uploadFailure=null, rpcFailure=null;
let calls=[], removed=0;
const user={id:'00000000-0000-4000-8000-000000000001',phone:'919876543210',is_anonymous:false};
const receipt={complaint_id:'00000000-0000-4000-8000-000000000099'};
const client={
 from:()=>({select:()=>({eq(){return this;},async maybeSingle(){return {data:existing,error:null};}})}),
 storage:{from:()=>({async upload(name,bytes,options){calls.push({upload:name,size:bytes.length,type:options.contentType});return {error:uploadFailure};},getPublicUrl(name){return {data:{publicUrl:'https://test.invalid/storage/v1/object/public/complaint-photos/'+name}};},async remove(){removed++;return {error:null};}})},
 async rpc(name,args){calls.push({name,args});return {data:receipt,error:rpcFailure};}
};
const originalLoad=Module._load;
Module._load=function(request,parent,...rest){if(request==='@/lib/supabase/server')return {authenticatedClient:async()=>{if(!authenticated)throw new Error('UNAUTHORIZED');return {client,user};}};return originalLoad.call(this,request,parent,...rest);};
const { POST }=require('../src/app/api/report/route.ts');
Module._load=originalLoad;
function reset(){authenticated=true;existing=null;uploadFailure=null;rpcFailure=null;calls=[];removed=0;user.phone="919876543210";user.is_anonymous=false;}
function request(overrides={}){
 const form=new FormData();
 const values={requestId:'00000000-0000-4000-8000-000000000011',category:'Pothole',description:'Test',latitude:'13.0827',longitude:'80.2707',...overrides};
 for(const [key,value] of Object.entries(values))form.append(key,value);
 form.append('image',new Blob([Uint8Array.from([255,216,255,0])],{type:'image/jpeg'}),'photo.jpg');
 return new NextRequest('https://test.invalid/api/report',{method:'POST',body:form});
}
test('report endpoint refuses unauthenticated writes',async()=>{reset();authenticated=false;const response=await POST(request());assert.equal(response.status,401);assert.equal(calls.length,0);});
test('report endpoint validates fields before uploading',async()=>{reset();const response=await POST(request({latitude:'91'}));assert.equal(response.status,400);assert.equal(calls.length,0);});
test('report endpoint ignores spoofed identity and masks raw contact data',async()=>{reset();const response=await POST(request({userId:'attacker-id',phone:'+919876543210'}));assert.equal(response.status,200);const rpc=calls.find(c=>c.name==='create_report');assert.equal(rpc.args.p_masked_phone,'+91 98******10');assert.equal(rpc.args.p_user_id,undefined);assert.ok(calls[0].upload.startsWith(user.id+'/'));assert.equal((await response.json()).complaint.complaint_id,receipt.complaint_id);});
test('report replay returns the existing receipt without uploading twice',async()=>{reset();existing=receipt;const response=await POST(request());assert.equal(response.status,200);assert.equal(calls.length,0);assert.equal((await response.json()).complaint.complaint_id,receipt.complaint_id);});
test('database failure cleans up an unreferenced upload',async()=>{reset();rpcFailure={message:'database unavailable'};const response=await POST(request());assert.equal(response.status,500);assert.equal(removed,1);assert.ok((await response.json()).error.includes('report could not be saved'));});
test('offline sync accepts only a masked contact number',async()=>{reset();const response=await POST(request({maskedPhone:'+91 98******10'}));assert.equal(response.status,200);assert.equal(calls.find(c=>c.name==='create_report').args.p_masked_phone,'+91 98******10');reset();assert.equal((await POST(request({maskedPhone:'9876543210'}))).status,400);});

test('upload failures are identified separately from database insert failures',async()=>{reset();uploadFailure={message:'new row violates row-level security policy',code:'42501'};const response=await POST(request());assert.equal(response.status,500);assert.match((await response.json()).error,/photo could not be uploaded/);assert.equal(calls.some(c=>c.name==='create_report'),false);});
test('development diagnostics preserve the actual database failure without exposing it in production',async()=>{const original=process.env.NODE_ENV;try{reset();process.env.NODE_ENV='development';rpcFailure={message:'null value in column category violates not-null constraint',code:'23502'};const detail=await (await POST(request())).json();assert.equal(detail.stage,'save');assert.equal(detail.code,'23502');assert.equal(detail.detail,rpcFailure.message);reset();process.env.NODE_ENV='production';rpcFailure={message:'internal database detail',code:'23502'};const safe=await (await POST(request())).json();assert.equal(safe.detail,undefined);assert.equal(safe.stage,undefined);}finally{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}});

test('anonymous sessions cannot create reports even with a valid token',async()=>{reset();user.is_anonymous=true;const response=await POST(request());assert.equal(response.status,401);assert.equal(calls.length,0);});
test('email-only sessions cannot create civilian reports',async()=>{reset();user.phone='';assert.equal((await POST(request())).status,401);assert.equal(calls.length,0);});
test('a database cooldown returns 429, Retry-After and a retry time while cleaning up the unused upload',async()=>{reset();const deadline=new Date(Date.now()+5*60000).toISOString();rpcFailure={message:'REPORT_COOLDOWN',details:deadline,code:'P0001'};const response=await POST(request());assert.equal(response.status,429);assert.ok(Number(response.headers.get('Retry-After'))>0);const body=await response.json();assert.equal(body.retryAt,deadline);assert.equal(removed,1);assert.match(body.error,/15 minutes/);});
