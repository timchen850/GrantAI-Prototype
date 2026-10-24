-- match_exemplar_chunks was callable with the public (anon) key, because Postgres grants EXECUTE on
-- every new function to PUBLIC. The exemplar-search edge function calls it with the signed-in user's
-- token (role "authenticated"), so the app keeps working; only callers without a sign-in lose access.
revoke execute on function public.match_exemplar_chunks(vector, int, text, text) from public, anon;
grant execute on function public.match_exemplar_chunks(vector, int, text, text) to authenticated, service_role;
