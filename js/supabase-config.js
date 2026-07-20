/* ==========================================================================
   Merit Legal Services — Supabase configuration
   --------------------------------------------------------------------------
   Paste your project's values below. Both are found in the Supabase
   dashboard under:  Settings  ->  API Keys

     - Project URL      looks like  https://abcdefghijklmno.supabase.co
     - Publishable key  looks like  sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx

   The publishable key is DESIGNED to be public and safe to commit to a
   public GitHub repo — but only because Row Level Security (RLS) is enabled
   on every table (see supabase-setup.sql). Never put the SECRET key
   (sb_secret_...) in this file or anywhere in the website.
   ========================================================================== */
window.MLS_SUPABASE = {
  url: "https://lysrsobshsufydfundwt.supabase.co",
  key: "sb_publishable_iFebyo5an8VPP18UcRxzVw_G4n6OUYN"
};

/* --------------------------------------------------------------------------
   Shared client accessor. Both the member portal (schedule.html) and the
   admin dashboard (admin-log-in.html) call window.mlsSupabase() to get a
   single, ready-to-use Supabase client. Returns null if the config above is
   still a placeholder or the supabase-js library failed to load, so callers
   can show a friendly "not configured yet" message instead of crashing.
   -------------------------------------------------------------------------- */
window.mlsSupabase = (function () {
  var client = null;
  var tried = false;
  return function () {
    if (tried) return client;
    tried = true;
    try {
      var cfg = window.MLS_SUPABASE;
      var ready = cfg && cfg.url && cfg.key &&
        cfg.url.indexOf("YOUR-PROJECT-REF") === -1 &&
        cfg.key.indexOf("YOUR-PUBLISHABLE-KEY") === -1 &&
        window.supabase && typeof window.supabase.createClient === "function";
      if (ready) {
        client = window.supabase.createClient(cfg.url, cfg.key);
      }
    } catch (err) {
      client = null;
    }
    return client;
  };
})();
