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
├── schedule.html               Member portal: sign up / log in, request & manage appointments
├── contact-us.html             Contact form + map
├── admin-log-in.html           Staff dashboard: create availability, review requests (noindex)
├── admin.html                  Redirect to admin-log-in.html (legacy URL)
├── 404.html                    Not-found page (GitHub Pages serves this automatically)
├── css/style.css               Single stylesheet (brand palette in :root)
├── js/script.js                Nav, modals, shared site behavior
├── js/supabase-config.js       Supabase URL + publishable key, shared client helper
├── js/portal.js                Member portal logic (schedule.html)
├── js/admin.js                 Staff dashboard logic (admin-log-in.html)
├── supabase-setup.sql          Database schema, security policies, booking functions
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

## Scheduling system

The scheduler runs on **Supabase Auth + a published-slot booking model**:

- **Members** sign up / log in on `schedule.html`, pick from the open times
  the office has published, and can view, reschedule, or cancel their own
  appointments. They only ever see *their own* data.
- **Staff** log in on `admin-log-in.html` to create availability (one-off
  times **and** auto-generated recurring weekly times), publish it, and
  review each request — confirm, decline, or move it to a different time.
- **One client per slot:** requesting a time holds it immediately; if a
  request is declined or cancelled, the slot re-opens automatically. This is
  enforced in the database, so two people can't grab the same slot.

### One-time setup

1. **Create the tables & functions.** In Supabase, open **SQL Editor**, paste
   the full contents of `supabase-setup.sql`, and **Run**.
   ⚠️ This rebuilds the `appointments` table (the booking model changed), so
   export any existing rows first if you need them.
2. **Add your keys.** In Supabase go to **Settings → API Keys**, copy the
   **Project URL** and **Publishable key** (`sb_publishable_...`), and paste
   both into `js/supabase-config.js`. (These are already filled in for the
   current project.)
3. **Create the admin login.** In Supabase, **Authentication → Users → Add
   user**; enter the staff email + password and tick **Auto Confirm User**.
   Copy that user's **UID**, then in the SQL Editor run:
   ```sql
   insert into public.admins (user_id) values ('PASTE-UID-HERE');
   ```
   That account can now sign in at `/admin-log-in.html`. Repeat to add more
   staff.
4. **Choose the member email setting.** Under **Authentication → Providers →
   Email**, decide whether **Confirm email** is on. If on (recommended),
   members must click a confirmation link before their first login; the page
   tells them to check their inbox after signing up.
5. **Publish some times.** Log in to the admin dashboard, add availability on
   the **Availability** tab, and make sure the times are **Published** so
   members can see them.

The **publishable key is safe to commit** to a public repo because Row Level
Security is enabled on every table — members can read only their own
appointments, and only accounts in the `admins` table can manage data.
**Never** put the secret key (`sb_secret_...`) in the site.

### Possible next steps

Automated confirmation / reminder **emails** (e.g. a Supabase Edge Function or
a form/email service triggered when an appointment is confirmed) are a natural
future addition — right now confirmations show as live status on the member's
page rather than being emailed.

## Content TODOs

- `mission.html` and `services.html` use `coverimage.avif` as a placeholder
  where the old site had unique photos. Drop replacement photos into
  `assets/images/` and update the two `<img>` tags (marked with `TODO`
  comments).
- Update fees in `merit-legal-services.html` as they change — court fees vary.
