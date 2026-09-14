type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>

export function JsonLd({ value }: { value: JsonLdValue }) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
