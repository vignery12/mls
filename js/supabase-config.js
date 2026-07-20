/* ==========================================================================
   Merit Legal Services — Supabase configuration
   --------------------------------------------------------------------------
   Paste your project's values below. Both are found in the Supabase
   dashboard under:  Settings  ->  API Keys

     • Project URL      looks like  https://abcdefghijklmno.supabase.co
     • Publishable key  looks like  sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx

   The publishable key is DESIGNED to be public and safe to commit to a
   public GitHub repo — but only because Row Level Security (RLS) is enabled
   on the appointments table (see supabase-setup.sql). Never put the SECRET
   key (sb_secret_...) in this file or anywhere in the website.

   Until real values are filled in here, the Schedule form automatically
   falls back to opening a pre-filled email, so the site keeps working.
   ========================================================================== */
window.MLS_SUPABASE = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  key: "sb_publishable_YOUR-PUBLISHABLE-KEY"
};
