-- =====================================================================
-- 0028 — 🚏 Σταθμός παραλαβής ανά προορισμό (ιστοσελίδα)
-- Πού παραλαμβάνει ο παραλήπτης στον προορισμό: σταθμός, διεύθυνση, τηλέφωνο.
-- Φαίνεται στον υπολογισμό κόστους και στις σελίδες προορισμών. Αλλάζει από diaxeirisi-proorismon.html.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.site_destinations add column if not exists terminal text check (char_length(terminal) <= 120);
alter table public.site_destinations add column if not exists terminal_addr text check (char_length(terminal_addr) <= 160);
alter table public.site_destinations add column if not exists terminal_phone text check (char_length(terminal_phone) <= 80);

create or replace function public.site_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tariffs', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'p', p) order by sort, key) from public.site_tariffs), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'region', region, 'type', type, 'tariff', tariff, 'hub', hub,
        'sched', sched, 'days', days, 'eta', eta, 'note', note,
        'terminal', terminal, 'terminal_addr', terminal_addr, 'terminal_phone', terminal_phone) order by name) from public.site_destinations where shown), '[]'::jsonb));
$$;
revoke all on function public.site_catalog() from public;
grant execute on function public.site_catalog() to anon, authenticated;
select 'OK — σταθμοί παραλαβής έτοιμοι' as αποτέλεσμα;
