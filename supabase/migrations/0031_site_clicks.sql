-- =====================================================================
-- 0031 — Μέτρηση κλικ στο σάιτ (χωρίς cookies, χωρίς IP, χωρίς προσωπικά δεδομένα)
--  Μετράμε μόνο ΠΟΣΑ κλικ έγιναν ανά ημέρα, σε ποια σελίδα και σε ποιο σημείο:
--  κλήση, WhatsApp, Viber, οδηγίες χάρτη, υπολογισμός τιμής, αναζήτηση δέματος.
--  Δεν αποθηκεύεται τίποτα για τον επισκέπτη (ούτε IP, ούτε συσκευή, ούτε ώρα).
--  Οι μετρήσεις φαίνονται στη σελίδα διαχείρισης, μόνο με σύνδεση.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================

create table if not exists public.site_clicks (
  day   date not null default current_date,
  event text not null,
  page  text not null default '',
  spot  text not null default '',
  n     int  not null default 0,
  primary key (day, event, page, spot)
);
alter table public.site_clicks enable row level security;
revoke all on public.site_clicks from anon;
drop policy if exists staff_read on public.site_clicks;
create policy staff_read on public.site_clicks for select to authenticated using (true);

-- Ένα κλικ = +1 στη μέρα. Δέχεται μόνο γνωστά ονόματα· ό,τι άλλο αγνοείται.
create or replace function public.track_click(p_e text, p_p text default '', p_s text default '')
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_e text := lower(coalesce(p_e, ''));
  v_p text := lower(left(coalesce(p_p, ''), 60));
  v_s text := lower(left(coalesce(p_s, ''), 30));
begin
  if v_e not in ('call', 'whatsapp', 'viber', 'directions', 'calc', 'track', 'email') then return; end if;
  if v_p !~ '^[a-z0-9/_-]*$' then v_p := 'other'; end if;
  if v_s !~ '^[a-z0-9_-]*$' then v_s := ''; end if;
  -- όριο ασφαλείας: όχι πάνω από 20.000 κλικ τη μέρα συνολικά (δεν «φουσκώνει» κανείς τα νούμερα επ' άπειρον)
  if (select coalesce(sum(n), 0) from public.site_clicks where day = current_date) >= 20000 then return; end if;
  insert into public.site_clicks as c (day, event, page, spot, n) values (current_date, v_e, v_p, v_s, 1)
  on conflict (day, event, page, spot) do update set n = c.n + 1;
end;
$$;
revoke all on function public.track_click(text, text, text) from public;
grant execute on function public.track_click(text, text, text) to anon, authenticated;

select 'OK — μέτρηση κλικ 0031' as αποτέλεσμα;
