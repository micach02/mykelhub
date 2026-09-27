-- Confirms schema.sql actually landed.
--
-- schema.sql only creates things, so a successful run reports "Success. No
-- rows returned" and shows you nothing. This one returns a row per item, so
-- you can see the state rather than infer it. Every row should read "yes".

select 'store_data table' as what,
       case when to_regclass('public.store_data') is not null
            then 'yes' else 'MISSING - run schema.sql' end as ok
union all
select 'row level security on',
       case when coalesce(
              (select relrowsecurity from pg_class where oid = to_regclass('public.store_data')),
              false)
            then 'yes' else 'MISSING - your data would be public' end
union all
select 'access policy',
       case when exists (
              select 1 from pg_policies
              where schemaname = 'public'
                and tablename = 'store_data'
                and policyname = 'own rows only')
            then 'yes' else 'MISSING - your data would be public' end
union all
select 'updated_at trigger',
       case when exists (
              select 1 from pg_trigger
              where tgname = 'store_data_touch' and not tgisinternal)
            then 'yes' else 'MISSING - sync cannot tell which copy is newer' end
order by what;
