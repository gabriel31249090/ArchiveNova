const CACHE='archive-nova-v4-5-public-v1'
const CORE=['/','/explore','/offline','/manifest.webmanifest','/icon.svg']
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))})
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))})
function cacheable(url){
  if(url.origin!==self.location.origin)return false
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth')||url.pathname.startsWith('/dashboard')||url.pathname.startsWith('/write')||url.pathname.startsWith('/publish')||url.pathname.startsWith('/settings')||url.pathname.startsWith('/notifications')||url.pathname.startsWith('/moderation')||url.pathname.startsWith('/collaboration'))return false
  return ['GET'].includes('GET')
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return
  const url=new URL(event.request.url)
  if(!cacheable(url))return
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(async()=>await caches.match(event.request)||await caches.match('/offline')))
    return
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})))
})
