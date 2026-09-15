import { createClient } from '@/lib/supabase/server'

export type ClassicBook={
  id:string;slug:string;title:string;author_name:string;language:string;summary:string;
  original_publication:string|null;source_name:string;source_url:string;source_id:string|null;
  copyright_note:string;cover_url:string|null;word_count:number;chapter_count:number;updated_at:string
}
export type ClassicChapterSummary={id:string;chapter_number:number;title:string|null;word_count:number}
export type ClassicBookPayload={book:ClassicBook;chapters:ClassicChapterSummary[]}
export type ClassicChapterPayload={book:{slug:string;title:string;author_name:string;chapter_count:number};chapter:{id:string;chapter_number:number;title:string|null;content_text:string;word_count:number}}

export async function getClassicsCatalog():Promise<ClassicBook[]>{
  try{
    const supabase=await createClient()
    const {data,error}=await supabase.rpc('classics_catalog')
    if(error)return[]
    return (data||[]) as ClassicBook[]
  }catch{return[]}
}

export async function getClassicBook(slug:string):Promise<ClassicBookPayload|null>{
  try{
    const supabase=await createClient()
    const {data,error}=await supabase.rpc('get_classic_book',{book_slug:slug})
    if(error||!data)return null
    return data as ClassicBookPayload
  }catch{return null}
}

export async function getClassicChapter(slug:string,chapter:number):Promise<ClassicChapterPayload|null>{
  try{
    const supabase=await createClient()
    const {data,error}=await supabase.rpc('get_classic_chapter',{book_slug:slug,target_chapter:chapter})
    if(error||!data)return null
    return data as ClassicChapterPayload
  }catch{return null}
}
