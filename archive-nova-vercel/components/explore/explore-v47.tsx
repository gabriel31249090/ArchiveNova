'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WorkspaceShell } from '@/components/shared/workspace-shell'
import { WorkCard } from '@/components/work-card'
import { NovaIcon } from '@/components/ui/nova-icon'
import { normalizeWorkCard } from '@/lib/work-normalize'
import { fullNumber } from '@/lib/format'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import type { FandomStat, LayoutMode, SortMode, WorkCardData, WorkFilters } from '@/lib/types'

const PAGE_SIZE=18
const EMPTY_FILTERS:WorkFilters={fandom:'',rating:'',status:'',minWords:'',includeTag:'',excludeTag:'',hideExplicit:false}

type SuggestionPayload={
  works?:Array<{id:string;title:string;author_username:string;author_display_name:string;fandoms:string[]}>
  authors?:Array<{id:string;username:string;display_name:string;avatar_url?:string|null;followers:number}>
  fandoms?:Array<{id:string;name:string;slug:string;work_count:number}>
  tags?:Array<{id:string;name:string;slug:string;type:string;work_count:number}>
}
type SavedSearch={id:string;name:string;query:string;filters:Record<string,unknown>;updated_at:string}

function urlSort(value:string|null):SortMode{return value==='hot'||value==='long'?value:'recent'}

export function ExploreV47(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const searchRef=useRef<HTMLInputElement>(null)
  const [query,setQuery]=useState('')
  const [debouncedQuery,setDebouncedQuery]=useState('')
  const [filters,setFilters]=useState<WorkFilters>(EMPTY_FILTERS)
  const [sortMode,setSortMode]=useState<SortMode>('recent')
  const [layout,setLayout]=useState<LayoutMode>('grid')
  const [page,setPage]=useState(0)
  const [results,setResults]=useState<WorkCardData[]>([])
  const [total,setTotal]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filtersOpen,setFiltersOpen]=useState(true)
  const [fandoms,setFandoms]=useState<FandomStat[]>([])
  const [suggestions,setSuggestions]=useState<SuggestionPayload>({})
  const [suggestionsOpen,setSuggestionsOpen]=useState(false)
  const [saved,setSaved]=useState<SavedSearch[]>([])
  const [authenticated,setAuthenticated]=useState(false)
  const { flags }=useFeatureFlags()
  const discoveryV2=flags.discovery_v2!==false
  const savedSearchesEnabled=flags.saved_searches!==false

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const q=params.get('q')||''
    setQuery(q)
    setDebouncedQuery(q)
    setSortMode(urlSort(params.get('sort')))
    const fandom=params.get('fandom')||''
    if(fandom)setFilters(current=>({...current,fandom}))
  },[])

  useEffect(()=>{
    const timer=window.setTimeout(()=>setDebouncedQuery(query.trim()),220)
    return()=>window.clearTimeout(timer)
  },[query])

  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown',handler)
    return()=>document.removeEventListener('keydown',handler)
  },[])

  useEffect(()=>{
    if(!supabase)return
    let active=true
    void Promise.all([
      supabase.rpc('active_fandoms',{limit_count:30}),
      supabase.auth.getUser(),
    ]).then(async([fandomResponse,authResponse])=>{
      if(!active)return
      setFandoms(((fandomResponse.data||[]) as Record<string,unknown>[]).map(row=>({
        id:String(row.id),
        name:String(row.name),
        slug:String(row.slug),
        work_count:Number(row.work_count||0),
        total_words:Number(row.total_words||0),
      })))
      const isAuthed=Boolean(authResponse.data.user)
      setAuthenticated(isAuthed)
      if(isAuthed&&savedSearchesEnabled){
        const {data}=await supabase.rpc('saved_searches_list')
        if(active)setSaved((data||[]) as SavedSearch[])
      }else if(active){
        setSaved([])
      }
    })
    return()=>{active=false}
  },[supabase,savedSearchesEnabled])

  const load=useCallback(async()=>{
    if(!supabase){setError('Supabase não configurado.');setLoading(false);return}
    setLoading(true)
    setError('')
    const {data,error:searchError}=await supabase.rpc('search_works',{
      search_text:debouncedQuery||null,
      fandom_filter:filters.fandom||null,
      rating_filter:filters.rating||null,
      status_filter:filters.status||null,
      min_words:filters.minWords?Number(filters.minWords):0,
      include_tag:filters.includeTag||null,
      exclude_tag:filters.excludeTag||null,
      hide_explicit:filters.hideExplicit,
      sort_mode:sortMode,
      page_size:PAGE_SIZE,
      page_offset:page*PAGE_SIZE,
    })
    if(searchError){
      console.error(searchError)
      setError('Não foi possível carregar a busca.')
      setResults([])
      setLoading(false)
      return
    }
    const rows=((data||[]) as Record<string,unknown>[]).map(normalizeWorkCard)
    setResults(rows)
    setTotal(rows[0]?.total_count||0)
    setLoading(false)
  },[supabase,debouncedQuery,filters,sortMode,page])

  useEffect(()=>{void load()},[load])

  useEffect(()=>{
    if(!supabase||!discoveryV2||debouncedQuery.length<2){
      setSuggestions({})
      setSuggestionsOpen(false)
      return
    }
    let active=true
    void supabase.rpc('search_suggestions',{search_text:debouncedQuery,limit_count:5}).then(({data})=>{
      if(active){
        setSuggestions((data||{}) as SuggestionPayload)
        setSuggestionsOpen(true)
      }
    })
    return()=>{active=false}
  },[supabase,debouncedQuery,discoveryV2])

  async function toggleBookmark(work:WorkCardData){
    if(!supabase)return
    const user=(await supabase.auth.getUser()).data.user
    if(!user){
      window.location.href='/explore?auth=login&return='+encodeURIComponent('/explore')
      return
    }
    const {data,error:bookmarkError}=await supabase.rpc('toggle_bookmark',{target_work:work.id})
    if(bookmarkError){
      setError('Não foi possível atualizar o bookmark.')
      return
    }
    const bookmarked=Boolean(data)
    setResults(current=>current.map(item=>item.id===work.id?{
      ...item,
      bookmarked,
      bookmarks_count:Math.max(0,item.bookmarks_count+(bookmarked?1:-1)),
    }:item))
  }

  function clearFilters(){
    setFilters(EMPTY_FILTERS)
    setQuery('')
    setDebouncedQuery('')
    setPage(0)
  }

  function applySaved(item:SavedSearch){
    setQuery(item.query||'')
    setDebouncedQuery(item.query||'')
    const f=item.filters||{}
    setFilters({
      fandom:String(f.fandom||''),
      rating:String(f.rating||''),
      status:String(f.status||''),
      minWords:String(f.minWords||''),
      includeTag:String(f.includeTag||''),
      excludeTag:String(f.excludeTag||''),
      hideExplicit:Boolean(f.hideExplicit),
    })
    const sort=String(f.sortMode||'recent')
    setSortMode(sort==='hot'||sort==='long'?sort:'recent')
    setPage(0)
  }

  async function saveCurrentSearch(){
    if(!supabase||!savedSearchesEnabled)return
    if(!authenticated){
      window.location.href='/explore?auth=login&return=%2Fexplore'
      return
    }
    const name=window.prompt('Nome para esta busca salva:')
    if(!name?.trim())return
    const {error:saveError}=await supabase.rpc('saved_search_upsert',{
      target_id:null,
      search_name:name.trim(),
      search_query:query,
      search_filters:{...filters,sortMode},
    })
    if(saveError){
      setError('Não foi possível salvar essa busca.')
      return
    }
    const {data}=await supabase.rpc('saved_searches_list')
    setSaved((data||[]) as SavedSearch[])
  }

  async function deleteSaved(id:string){
    if(!supabase)return
    const {error:deleteError}=await supabase.rpc('saved_search_delete',{target_id:id})
    if(deleteError){
      setError('Não foi possível excluir essa busca.')
      return
    }
    setSaved(current=>current.filter(item=>item.id!==id))
  }

  const activeFilterCount=Object.entries(filters).filter(([,v])=>typeof v==='boolean'?v:Boolean(v)).length
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const filterLabel=activeFilterCount?' ('+activeFilterCount+')':''

  const topbar=<>
    <div className="global-search explore-v47-search">
      <span aria-hidden="true"><NovaIcon name="search" size={18}/></span>
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={e=>{setQuery(e.target.value);setPage(0)}}
        onFocus={()=>{if(debouncedQuery.length>=2)setSuggestionsOpen(true)}}
        placeholder="Buscar obras, autores, fandoms ou tags…"
        autoComplete="off"
      />
      <kbd>Ctrl K</kbd>
      {discoveryV2&&suggestionsOpen&&debouncedQuery.length>=2?<div className="search-suggestions-v47" onMouseDown={e=>e.preventDefault()}>
        {(suggestions.works||[]).length?<section><span>OBRAS</span>{suggestions.works?.map(item=><Link key={item.id} href={'/works/'+item.id} onClick={()=>setSuggestionsOpen(false)}><NovaIcon name="book" size={16}/><div><strong>{item.title}</strong><small>por @{item.author_username}</small></div></Link>)}</section>:null}
        {(suggestions.authors||[]).length?<section><span>AUTORES</span>{suggestions.authors?.map(item=><Link key={item.id} href={'/users/'+encodeURIComponent(item.username)} onClick={()=>setSuggestionsOpen(false)}><NovaIcon name="user" size={16}/><div><strong>{item.display_name}</strong><small>@{item.username} · {item.followers} seguidores</small></div></Link>)}</section>:null}
        {(suggestions.fandoms||[]).length?<section><span>FANDOMS</span>{suggestions.fandoms?.map(item=><Link key={item.id} href={'/fandoms/'+encodeURIComponent(item.slug)} onClick={()=>setSuggestionsOpen(false)}><span>✦</span><div><strong>{item.name}</strong><small>{item.work_count} obras</small></div></Link>)}</section>:null}
        {(suggestions.tags||[]).length?<section><span>TAGS</span>{suggestions.tags?.map(item=>{
          const prefix=item.type==='CHARACTER'?'/characters/':item.type==='RELATIONSHIP'?'/relationships/':'/tags/'
          return <Link key={item.id} href={prefix+encodeURIComponent(item.slug)} onClick={()=>setSuggestionsOpen(false)}><NovaIcon name="filter" size={16}/><div><strong>{item.name}</strong><small>{item.work_count} obras</small></div></Link>
        })}</section>:null}
        {!((suggestions.works||[]).length||(suggestions.authors||[]).length||(suggestions.fandoms||[]).length||(suggestions.tags||[]).length)?<p>Nenhuma sugestão direta. Continue digitando para buscar no arquivo.</p>:null}
      </div>:null}
    </div>
    <button className="secondary-button" type="button" onClick={()=>setFiltersOpen(v=>!v)}><NovaIcon name="filter" size={17}/> Filtros{filterLabel}</button>
  </>

  return <WorkspaceShell active="explore" fandoms={fandoms} topbar={topbar}>
    <section className="view active explore-v47">
      <header className="explore-v47-hero">
        <div>
          <p className="eyebrow">Discovery 2.0</p>
          <h1>Encontre exatamente o que quer — ou algo que não esperava.</h1>
          <p>Busca por obra, autor, fandom e tags com sugestões instantâneas, filtros salvos e descoberta transparente.</p>
        </div>
        <div className="explore-v47-tools">
          {savedSearchesEnabled?<button className="secondary-button" type="button" onClick={()=>void saveCurrentSearch()}><NovaIcon name="bookmark" size={18}/> Salvar busca</button>:null}
          <div className="segmented">
            <button className={layout==='grid'?'active':''} onClick={()=>setLayout('grid')} aria-label="Grade"><NovaIcon name="grid" size={17}/></button>
            <button className={layout==='list'?'active':''} onClick={()=>setLayout('list')} aria-label="Lista"><NovaIcon name="list" size={17}/></button>
          </div>
        </div>
      </header>

      {savedSearchesEnabled&&saved.length?<div className="saved-searches-v47"><span>BUSCAS SALVAS</span>{saved.slice(0,6).map(item=><div key={item.id}><button type="button" onClick={()=>applySaved(item)}>{item.name}</button><button type="button" aria-label={'Excluir '+item.name} onClick={()=>void deleteSaved(item.id)}><NovaIcon name="close" size={13}/></button></div>)}</div>:null}

      <div className={'explore-v47-layout '+(filtersOpen?'with-filters':'without-filters')}>
        {filtersOpen?<aside className="filters-panel explore-v47-filters">
          <div className="filter-head"><div><p className="eyebrow">Refinar</p><strong>{fullNumber(total)} resultados</strong></div><button className="text-button" type="button" onClick={clearFilters}>Limpar</button></div>
          <label>Fandom<select value={filters.fandom} onChange={e=>{setFilters(v=>({...v,fandom:e.target.value}));setPage(0)}}><option value="">Todos</option>{fandoms.map(f=><option key={f.id} value={f.slug}>{f.name}</option>)}</select></label>
          <label>Classificação<select value={filters.rating} onChange={e=>{setFilters(v=>({...v,rating:e.target.value}));setPage(0)}}><option value="">Todas</option><option value="GENERAL">Livre</option><option value="TEEN">Teen</option><option value="MATURE">Mature</option><option value="EXPLICIT">Explicit</option><option value="NOT_RATED">Não classificada</option></select></label>
          <label>Status<select value={filters.status} onChange={e=>{setFilters(v=>({...v,status:e.target.value}));setPage(0)}}><option value="">Todos</option><option value="ONGOING">Em andamento</option><option value="COMPLETE">Concluída</option><option value="HIATUS">Hiato</option></select></label>
          <label>Mínimo de palavras<input type="number" min="0" step="1000" value={filters.minWords} onChange={e=>{setFilters(v=>({...v,minWords:e.target.value}));setPage(0)}} placeholder="Ex.: 10000"/></label>
          <label>Incluir tag<input value={filters.includeTag} onChange={e=>{setFilters(v=>({...v,includeTag:e.target.value}));setPage(0)}} placeholder="Ex.: slow burn"/></label>
          <label>Excluir tag<input value={filters.excludeTag} onChange={e=>{setFilters(v=>({...v,excludeTag:e.target.value}));setPage(0)}} placeholder="Ex.: major death"/></label>
          <label className="check-row"><input type="checkbox" checked={filters.hideExplicit} onChange={e=>{setFilters(v=>({...v,hideExplicit:e.target.checked}));setPage(0)}}/><span>Ocultar conteúdo Explicit</span></label>
        </aside>:null}

        <main className="explore-v47-results">
          <div className="explore-v47-resultbar">
            <div><span>{debouncedQuery?'Resultados para “'+debouncedQuery+'”':'Todo o arquivo'}</span><strong>{fullNumber(total)} {total===1?'obra':'obras'}</strong></div>
            <div className="segmented" role="group" aria-label="Ordenar resultados">
              {(['recent','hot','long'] as SortMode[]).map(mode=><button key={mode} className={sortMode===mode?'active':''} onClick={()=>{setSortMode(mode);setPage(0)}}>{mode==='recent'?'Recentes':mode==='hot'?'Em alta':'Longas'}</button>)}
            </div>
          </div>

          {error?<div className="community-message error">{error}<button type="button" onClick={()=>void load()}>Tentar novamente</button></div>:null}
          {loading?<div className="feed-skeleton">{Array.from({length:9}).map((_,i)=><div key={i}/>)}</div>:null}
          {!loading&&!error&&results.length?<div className={'work-grid '+(layout==='list'?'list':'')}>{results.map(work=><WorkCard key={work.id} work={work} onOpen={id=>{window.location.href='/works/'+id}} onBookmark={item=>void toggleBookmark(item)}/>)}</div>:null}
          {!loading&&!error&&!results.length?<section className="studio-empty large"><span><NovaIcon name="search" size={32}/></span><h2>Nada encontrado</h2><p>Tente remover um filtro, usar outra tag ou buscar por um termo mais amplo.</p><button className="secondary-button" onClick={clearFilters}>Limpar filtros</button></section>:null}

          {!loading&&totalPages>1?<nav className="pagination explore-v47-pagination" aria-label="Páginas"><button disabled={page<=0} onClick={()=>setPage(v=>Math.max(0,v-1))}>← Anterior</button><span>Página {page+1} de {totalPages}</span><button disabled={page>=totalPages-1} onClick={()=>setPage(v=>Math.min(totalPages-1,v+1))}>Próxima →</button></nav>:null}
        </main>
      </div>
    </section>
  </WorkspaceShell>
}
