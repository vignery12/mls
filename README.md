# Merit Legal Services — Website

Static website for Merit Legal Services, licensed and bonded Legal Document and
Unlawful Detainer Assistants (LDA #2016056276, UDA #2016056278) in Hawthorne, CA.

## Structure

```
├── index.html                  Home
├── about-us.html               About Us
├── mission.html                Our Mission
├── services.html               Services
├── merit-legal-services.html   Services & Fees
├── schedule.html               Appointment scheduling (Phase 1: email request)
├── contact-us.html             Contact form + map
├── admin.html                  Scheduler admin scaffold (noindex, not in nav)
├── 404.html                    Not-found page (GitHub Pages serves this automatically)
├── css/style.css               Single stylesheet (brand palette in :root)
├── js/script.js                Nav, modals, forms, scroll effects
├── assets/images/              Logo (optimized), cover image, favicons
├── robots.txt                  Crawl rules + sitemap reference
├── sitemap.xml                 All public pages
└── .nojekyll                   Tells GitHub Pages to skip Jekyll processing
```

## Hosting notes

- **Canonical domain:** all canonical URLs, Open Graph tags, `sitemap.xml`,
  and `robots.txt` point to `https://www.meritlegalservices.com`. If the site
  is served from a different URL (e.g. `https://<user>.github.io/<repo>/`),
  search-and-replace that domain across the HTML files, `sitemap.xml`, and
  `robots.txt`.
- **GitHub Pages:** push to `main`, then Settings → Pages → deploy from
  branch `main`, folder `/ (root)`.
- After going live, submit `sitemap.xml` in Google Search Console.

## SEO in place

- Canonical URL, unique title + meta description per page
- Open Graph + Twitter card tags on every page
- JSON-LD `LegalService` structured data on the home page (address, phones,
  founder, languages, social profiles) for Google rich results
- `sitemap.xml`, `robots.txt`, favicon + apple touch icon
- Optimized logo (2.6 MB → 141 KB)

## Scheduler roadmap

**Phase 1 (live):** `schedule.html` collects name, contact info, service,
preferred date/time, and language.

**Phase 2 — database connection (this step):** submissions are saved to a
Supabase `appointments` table. Setup:

1. In Supabase, open **SQL Editor**, paste the contents of
   `supabase-setup.sql`, and **Run**. This creates the `appointments` table
   and its Row Level Security policies.
2. In Supabase, go to **Settings → API Keys** and copy your **Project URL**
   and **Publishable key** (`sb_publishable_...`).
3. Paste both into `js/supabase-config.js`.
4. Push to GitHub. Submit a test appointment, then confirm the row appears
   in Supabase under **Table Editor → appointments**.

The **publishable key is safe to commit** to a public repo — it only permits
inserting new appointments, never reading/editing existing ones, because RLS
is enabled. **Never** put the secret key (`sb_secret_...`) in the site.

If Supabase isn't configured or is unreachable, the form automatically falls
back to opening a pre-filled email, so no request is ever lost.

**Phase 3 (next):** an authenticated admin dashboard on `admin.html` to view,
confirm, and cancel appointments (Supabase Auth + the staff RLS policies
already created in `supabase-setup.sql`), optionally with real-time
availability so booked slots disappear.

## Forms

Both the contact and scheduling forms currently use `mailto:` (no backend
required). To send silently instead, swap the `mailto:` block in
`js/script.js` for a POST to a form service (e.g. Formspree) or your own
endpoint — the validation logic can stay as-is.

## Content TODOs

- `mission.html` and `services.html` use `coverimage.avif` as a placeholder
  where the old site had unique photos. Drop replacement photos into
  `assets/images/` and update the two `<img>` tags (marked with `TODO`
  comments).
- Update fees in `merit-legal-services.html` as they change — court fees vary.
