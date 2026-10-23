require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validCoordinates, validUuid, validateReport, imageExtension, MAX_IMAGE_BYTES } = require('../src/lib/utils/validation.ts');
const { maskPhoneNumber } = require('../src/lib/utils/privacy.ts');
const { formatTimeLeft } = require('../src/lib/utils/time.ts');
const { getCurrentPosition } = require('../src/lib/utils/geo.ts');
test('coordinates reject invalid ranges and non-finite values', () => {
 assert.equal(validCoordinates(13.0827,80.2707),true);
 for(const [lat,lng] of [[91,0],[0,-181],[NaN,0],[0,Infinity]]) assert.equal(validCoordinates(lat,lng),false);
 assert.equal(validCoordinates(-90,180),true);
});
test('report rejects arbitrary categories, long descriptions and malformed contacts', () => {
 assert.doesNotThrow(()=>validateReport('Pothole','',13,80,''));
 assert.throws(()=>validateReport('Arbitrary','',13,80,''));
 assert.throws(()=>validateReport('Garbage','a'.repeat(2001),13,80,''));
 assert.throws(()=>validateReport('Drainage','',13,80,'12345678'));
 assert.throws(()=>validateReport('Other','',13,80,'hello'));
 assert.doesNotThrow(()=>validateReport('Streetlight','',13,80,'+91 9876543210'));
});
test('phone masking never returns a raw or incomplete number', () => {
 assert.equal(maskPhoneNumber('+919876543210'),'+91 98******10');
 assert.equal(maskPhoneNumber('9876543210'),'+91 98******10');
 assert.throws(()=>maskPhoneNumber('12345'));
});
test('image validation checks signatures as well as MIME', () => {
 assert.equal(imageExtension(Uint8Array.from([255,216,255,0]),'image/jpeg'),'jpg');
 assert.equal(imageExtension(Uint8Array.from([137,80,78,71,13,10,26,10]),'image/png'),'png');
 assert.equal(imageExtension(Buffer.from('RIFF0000WEBP'),'image/webp'),'webp');
 assert.throws(()=>imageExtension(Buffer.from('<script>'),'image/jpeg'));
 assert.throws(()=>imageExtension(Uint8Array.from([255,216,255]),'text/html'));
 assert.equal(MAX_IMAGE_BYTES,8388608);
});
test('countdown is immediately available and expires at the deadline', () => {
 const now=Date.parse('2026-10-13T00:00:00Z');
 assert.equal(formatTimeLeft('2026-10-15T00:00:00Z',now),'48h 0m left');
 assert.equal(formatTimeLeft('2026-10-13T00:00:01Z',now),'0h 1m left');
 assert.equal(formatTimeLeft('2026-10-13T00:00:00Z',now),'Expired');
 assert.equal(formatTimeLeft('invalid',now),'Expired');
});
test('request IDs must be UUIDs', () => {
 assert.equal(validUuid('00000000-0000-4000-8000-000000000001'),true);
 assert.equal(validUuid('not-an-id'),false);
});
test('GPS fallback is available only in development', async () => {
 const originalEnv=process.env.NODE_ENV;
 const originalLat=process.env.NEXT_PUBLIC_DEV_FALLBACK_LAT;
 const originalLng=process.env.NEXT_PUBLIC_DEV_FALLBACK_LNG;
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 process.env.NEXT_PUBLIC_DEV_FALLBACK_LAT='13.0827';process.env.NEXT_PUBLIC_DEV_FALLBACK_LNG='80.2707';
 try {
  process.env.NODE_ENV='production';await assert.rejects(getCurrentPosition(),/not supported/);
  process.env.NODE_ENV='development';assert.equal((await getCurrentPosition()).lat,13.0827);
 } finally {
  if(originalEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalEnv;
  if(originalLat===undefined)delete process.env.NEXT_PUBLIC_DEV_FALLBACK_LAT;else process.env.NEXT_PUBLIC_DEV_FALLBACK_LAT=originalLat;
  if(originalLng===undefined)delete process.env.NEXT_PUBLIC_DEV_FALLBACK_LNG;else process.env.NEXT_PUBLIC_DEV_FALLBACK_LNG=originalLng;
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
 }
});

const { readUploadForm } = require('../src/lib/utils/uploads.ts');
test('multipart stream rejects excessive size even without content-length', async () => {
 const request=new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=test'},body:new Uint8Array(MAX_IMAGE_BYTES+65537)});
 await assert.rejects(readUploadForm(request),/UPLOAD_TOO_LARGE/);
});
test('multipart parser retains the photo and report fields', async () => {
 const form=new FormData();form.append('category','Pothole');form.append('image',new Blob([Uint8Array.from([255,216,255])],{type:'image/jpeg'}),'report.jpg');
 const parsed=await readUploadForm(new Request('https://test.invalid',{method:'POST',body:form}));
 assert.equal(parsed.get('category'),'Pothole');assert.equal(parsed.get('image').size,3);
});

const { describeSupabaseError } = require('../src/lib/utils/supabase-errors.ts');
test('Supabase errors distinguish unreachable projects, disabled anonymous auth, and invalid keys', () => {
 assert.match(describeSupabaseError(new TypeError('Load failed')),/Cannot reach Supabase/);
 assert.match(describeSupabaseError({message:'TypeError: Failed to fetch'}),/Cannot reach Supabase/);
 assert.match(describeSupabaseError({message:'Anonymous sign-ins are disabled'}),/Anonymous sign-ins are disabled/);
 assert.match(describeSupabaseError({message:'Invalid API key'}),/rejected the API key/);
 assert.equal(describeSupabaseError({message:'permission denied for table wards'}),'permission denied for table wards');
});

const { visibleWardLayers } = require('../src/lib/utils/ward-layers.ts');
test('ward map hides only the confirmed city-wide demo overlay and preserves the other layers', () => {
 const wards=[{ward_id:101,ward_name:'Kilpauk North',zone_name:'Zone 7',health_score:100},{ward_id:102,ward_name:'Kilpauk South',zone_name:'Zone 7',health_score:100},{ward_id:103,ward_name:'Egmore East',zone_name:'Zone 6',health_score:0},{ward_id:104,ward_name:'Demo Ward — Live Zone',zone_name:'Live Demo',health_score:50},{ward_id:105,ward_name:'A real moderate ward',zone_name:'Zone 7',health_score:50}];
 const result=visibleWardLayers(wards);
 assert.deepEqual(result.map(w=>w.ward_id),[101,102,103,105]);
 assert.equal(result[0],wards[0]);assert.equal(result[3].health_score,50);
 assert.equal(wards.length,5);
 assert.equal(visibleWardLayers([{ward_id:104,ward_name:'Real Ward 104',zone_name:'Zone 7'}]).length,1);
});
test('missing complaint view errors explain the database migration needed', () => {
 assert.match(describeSupabaseError({message:"Could not find the table 'public.complaint_details' in the schema cache"}),/updated supabase\/schema.sql/);
});

const { auditVoteMessage } = require('../src/lib/utils/audit.ts');
test('audit outcome remains understandable after a resolved or rejected card disappears', () => {
 assert.match(auditVoteMessage({confirm_votes:1,reject_votes:0,new_status:'PENDING_VERIFICATION'}),/Verification is still open/);
 assert.match(auditVoteMessage({confirm_votes:3,reject_votes:0,new_status:'RESOLVED'}),/Report marked resolved/);
 assert.match(auditVoteMessage({confirm_votes:0,reject_votes:3,new_status:'IN_PROGRESS'}),/returned to staff/);
});

const {normalizePhone,safeReturnPath,cooldownSeconds,cooldownLabel}=require('../src/lib/utils/auth.ts');
test('Indian mobile numbers normalize consistently and invalid identifiers are rejected',()=>{assert.equal(normalizePhone('98765 43210'),'+919876543210');assert.equal(normalizePhone('+91 9876543210'),'+919876543210');assert.equal(normalizePhone('919876543210'),'+919876543210');for(const value of ['123','abcdef','0123456789','+1 9876543210'])assert.throws(()=>normalizePhone(value));});
test('login return paths cannot redirect to external origins or staff',()=>{for(const value of ['https://evil.test','//evil.test','/staff','/login',null])assert.equal(safeReturnPath(value),'/');assert.equal(safeReturnPath('/my-reports'),'/my-reports');});
test('report cooldown reaches zero at exactly fifteen minutes',()=>{const start=Date.parse('2026-10-24T10:00:00Z'),deadline=new Date(start+15*60000).toISOString();assert.equal(cooldownSeconds(deadline,start),900);assert.equal(cooldownLabel(900),'15:00');assert.equal(cooldownSeconds(deadline,start+15*60000),0);assert.equal(cooldownSeconds(deadline,start+20*60000),0);assert.equal(cooldownSeconds(null,start),0);});

const {nearbyBounds}=require('../src/lib/utils/area.ts');
test('nearby discovery bounds contain the GPS point and reject invalid coordinates',()=>{const b=nearbyBounds(13.08,80.27);assert.ok(b.south<13.08 && b.north>13.08 && b.west<80.27 && b.east>80.27);assert.throws(()=>nearbyBounds(NaN,80));assert.throws(()=>nearbyBounds(91,80));});
