const CACHE='makkal-kural-v2-login';
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(['/','/offline.html','/manifest.json','/icons/icon-192.png','/icons/icon-512.png']);
 const shell=await cache.match('/');
 const html=await shell.text();
 const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)].map(match=>match[1]);
 await cache.addAll([...new Set(assets)]);
})());});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('makkal-kural-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('authorization') || request.headers.has('RSC') || url.searchParams.has('_rsc'))return;
 if(request.mode==='navigate') {event.respondWith(fetch(request).then(response=>{if(response.ok && url.pathname==='/'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',copy)));}return response;}).catch(async()=> (url.pathname==='/' ? await caches.match('/') : null) || await caches.match('/offline.html')));return;}
 if(url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname==='/manifest.json')event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(request,copy)));}return response;})));
});

self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_STATIC' || !Array.isArray(event.data.urls))return;
 const urls=event.data.urls.filter(value=>{try{const url=new URL(value,self.location.origin);return url.origin===self.location.origin && url.pathname.startsWith('/_next/static/');}catch{return false;}});
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(urls)));
});
