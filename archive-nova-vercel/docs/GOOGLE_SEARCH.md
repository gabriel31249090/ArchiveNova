# Google Search indexing — ArchiveNova

The app now ships the technical pieces Google needs to discover and understand the public site:

- `/robots.txt`
- `/sitemap.xml`
- canonical URLs
- route-specific title/description metadata
- public-work and public-profile metadata
- JSON-LD for the site, works and public profiles
- a stable square favicon
- `noindex` on private/personalized routes
- Google Search Console verification support

## 1. Configure the canonical production URL

In Vercel, add:

```
NEXT_PUBLIC_SITE_URL=https://YOUR_FINAL_PRODUCTION_DOMAIN
```

Use exactly one production origin. When a custom domain is added later, change this variable and redeploy.

## 2. Verify the site in Google Search Console

If the site is still using a `.vercel.app` address, use a **URL-prefix property** and choose **HTML tag** verification.

Copy only the verification token from the tag and add it in Vercel:

```
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=YOUR_TOKEN
```

Redeploy, then click Verify in Search Console.

If the project later owns a custom domain, a Domain property verified through DNS is also a good option.

## 3. Submit the sitemap

After deployment, open Search Console -> Sitemaps and submit:

```
sitemap.xml
```

The sitemap contains the main public routes and public works discovered from Supabase.

## 4. Request indexing for the most important URLs

Use URL Inspection for:

1. the landing page
2. `/explore`
3. `/faq`
4. representative public work pages
5. representative public author profiles

Use **Request indexing** after the live test reports that the page is indexable.

## 5. Keep public content crawlable

Do not put public work/profile pages behind login, `noindex`, or a robots.txt block.

Private routes such as Writer, Studio, settings, moderation, notifications and publishing are intentionally excluded from search.

## 6. Search-result quality

Indexing does not guarantee ranking. Improve ranking over time with:

- unique story titles and useful summaries
- descriptive author bios
- meaningful fandom/tag metadata
- internal links from Explore, profiles and posts
- fast mobile rendering
- stable canonical URLs
- useful public content that other sites naturally link to

## Useful checks after every SEO deployment

- open `/robots.txt`
- open `/sitemap.xml`
- inspect the page source for canonical/title/description
- test public pages in Google Rich Results Test when structured data changes
- inspect Core Web Vitals and indexing reports in Search Console
