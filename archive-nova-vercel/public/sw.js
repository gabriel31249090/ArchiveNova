const CACHE='archive-nova-v4-9-1-public-v1'
const CORE=['/','/explore','/offline','/manifest.webmanifest','/icon.svg']
const PUBLIC_NAVIGATION=new Set(['/','/explore','/offline','/feed','/posts','/classics','/trust','/faq','/support','/advertise'])
function isPublicNavigation(url){
  return url.origin===self.location.origin&&(PUBLIC_NAVIGATION.has(url.pathname)||url.pathname.startsWith('/classics/'))
}
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))
})
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))
})
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return
  const url=new URL(event.request.url)
  if(event.request.mode==='navigate'){
    if(!isPublicNavigation(url))return
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
      return response
    }).catch(async()=>await caches.match(event.request)||await caches.match('/offline')))
    return
  }
  if(url.origin===self.location.origin&&CORE.includes(url.pathname)){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))
  }
})
