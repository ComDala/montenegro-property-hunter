create or replace function public.get_listing_photo_urls()
returns table(listing_id uuid, photo_urls jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with latest as (
    select distinct on (o.listing_id)
      o.listing_id,
      o.raw_payload
    from public.listing_observations o
    order by o.listing_id, o.observed_at desc, o.created_at desc
  ),
  extracted as (
    select
      listing_id,
      case
        when jsonb_typeof(raw_payload->'photo_urls') = 'array' then raw_payload->'photo_urls'
        when jsonb_typeof(raw_payload->'images') = 'array' then raw_payload->'images'
        else '[]'::jsonb
      end as urls
    from latest
  )
  select
    listing_id,
    coalesce((
      select jsonb_agg(value order by ordinal)
      from (
        select value, ordinal
        from jsonb_array_elements(extracted.urls) with ordinality as image(value, ordinal)
        where jsonb_typeof(value) = 'string'
          and value #>> '{}' ~ '^https://'
        order by ordinal
        limit 24
      ) safe_images
    ), '[]'::jsonb) as photo_urls
  from extracted
  where jsonb_array_length(extracted.urls) > 0;
$$;

revoke all on function public.get_listing_photo_urls() from public, anon, authenticated;
grant execute on function public.get_listing_photo_urls() to service_role;
