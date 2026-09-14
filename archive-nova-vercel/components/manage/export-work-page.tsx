'use client'
import Link from 'next/link'
import { NovaHeader } from '@/components/shared/nova-header'
const formats=[['EPUB','Leitores digitais e apps'],['PDF','Compartilhamento e impressão'],['DOCX','Edição no Word/Docs'],['TXT','Backup universal']] as const
export function ExportWorkPage({workId}:{workId:string}){
 return <><NovaHeader title="Exportar"/><main className="export-page"><header><div><p className="eyebrow">Backup & portabilidade</p><h1>Leve sua história com você.</h1><p>Exporte sua própria obra sem depender do Archive Nova para manter uma cópia.</p></div><Link className="secondary-button" href={'/works/'+workId+'/manage'}>Voltar</Link></header><section className="export-grid">{formats.map(([format,description])=><article key={format}><span>{format}</span><h2>{format}</h2><p>{description}</p><a className="primary-button" href={'/api/works/'+workId+'/export?format='+format.toLowerCase()}>Exportar {format}</a></article>)}</section><aside className="export-note"><strong>Seus dados continuam seus.</strong><p>O arquivo inclui título, capítulos e conteúdo da obra. Recursos sociais como kudos e comentários não entram no arquivo exportado.</p></aside></main></>
}
