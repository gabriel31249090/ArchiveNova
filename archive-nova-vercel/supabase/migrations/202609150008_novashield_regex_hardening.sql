-- ArchiveNova v4.8 — NovaShield regex distance hardening
-- PostgreSQL bounded repetitions accept values up to 255.

update public.moderation_scan_rules
set max_distance=least(max_distance,250),
    updated_at=now()
where max_distance>255;

alter table public.moderation_scan_rules
  drop constraint if exists moderation_scan_rules_max_distance_check;

alter table public.moderation_scan_rules
  add constraint moderation_scan_rules_max_distance_check
  check (max_distance between 20 and 255);

create or replace function public.novashield_scan_work(
  target_work uuid,
  scan_source text default 'MANUAL'
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  work_row public.works%rowtype;
  new_scan_id uuid;
  rule_row public.moderation_scan_rules%rowtype;
  metadata_text text;
  chapter_hits integer;
  metadata_hit boolean;
  regex_pattern text;
  total_score integer:=0;
  total_signals integer:=0;
  severity_value text:='CLEAR';
  action_value text:='NONE';
  categories text[];
begin
  select * into work_row
  from public.works
  where id=target_work and deleted_at is null;

  if work_row.id is null then
    raise exception 'WORK_NOT_FOUND' using errcode='P0002';
  end if;

  if uid is null or (work_row.creator_id<>uid and not public.is_staff()) then
    raise exception 'NO_ACCESS' using errcode='42501';
  end if;

  metadata_text:=lower(regexp_replace(
    coalesce(work_row.title,'')||' '||coalesce(work_row.summary,''),
    '[[:space:]]+',' ','g'
  ));

  insert into public.moderation_scans(
    work_id,requested_by,trigger_source,engine_version
  )
  values(
    target_work,uid,left(upper(coalesce(scan_source,'MANUAL')),40),'NOVASHIELD_RULES_V1'
  )
  returning id into new_scan_id;

  for rule_row in
    select * from public.moderation_scan_rules where enabled order by weight desc
  loop
    metadata_hit:=false;
    chapter_hits:=0;

    if rule_row.detector='REGEX' then
      metadata_hit:=metadata_text ~* rule_row.pattern_a;

      select count(*)::integer into chapter_hits
      from public.chapters c
      where c.work_id=target_work
        and c.status='PUBLISHED'
        and lower(regexp_replace(coalesce(c.title,'')||' '||coalesce(c.content,''),'[[:space:]]+',' ','g')) ~* rule_row.pattern_a;

    elsif rule_row.detector='CO_OCCURRENCE' then
      regex_pattern:=
        '('||rule_row.pattern_a||').{0,'||least(rule_row.max_distance,255)||'}('||coalesce(rule_row.pattern_b,'a^')||')'
        ||'|('||coalesce(rule_row.pattern_b,'a^')||').{0,'||least(rule_row.max_distance,255)||'}('||rule_row.pattern_a||')';

      metadata_hit:=metadata_text ~* regex_pattern;

      select count(*)::integer into chapter_hits
      from public.chapters c
      where c.work_id=target_work
        and c.status='PUBLISHED'
        and lower(regexp_replace(coalesce(c.title,'')||' '||coalesce(c.content,''),'[[:space:]]+',' ','g')) ~* regex_pattern;

    elsif rule_row.detector='METADATA' then
      if rule_row.code='RATING_EXPLICIT' and work_row.rating in ('GENERAL','TEEN') then
        metadata_hit:=metadata_text ~* rule_row.pattern_a;

        select count(*)::integer into chapter_hits
        from public.chapters c
        where c.work_id=target_work
          and c.status='PUBLISHED'
          and lower(regexp_replace(coalesce(c.title,'')||' '||coalesce(c.content,''),'[[:space:]]+',' ','g')) ~* rule_row.pattern_a;
      end if;
    end if;

    if metadata_hit or chapter_hits>0 then
      insert into public.moderation_scan_hits(
        scan_id,rule_id,category,label,weight,match_count
      )
      values(
        new_scan_id,rule_row.id,rule_row.category,rule_row.label,rule_row.weight,
        greatest(1,chapter_hits+(case when metadata_hit then 1 else 0 end))
      )
      on conflict(scan_id,rule_id) do update
      set match_count=excluded.match_count,weight=excluded.weight;

      total_score:=least(100,total_score+rule_row.weight);
      total_signals:=total_signals+1;
    end if;
  end loop;

  severity_value:=case
    when total_score>=80 then 'URGENT'
    when total_score>=55 then 'REVIEW'
    when total_score>=25 then 'WATCH'
    else 'CLEAR'
  end;

  action_value:=case
    when total_score>=80 then 'URGENT_REVIEW'
    when total_score>=55 then 'HUMAN_REVIEW'
    when total_score>=25 then 'WATCH'
    else 'NONE'
  end;

  update public.moderation_scans
  set score=total_score,
      severity=severity_value,
      recommended_action=action_value,
      signals_count=total_signals
  where id=new_scan_id;

  update public.works
  set moderation_risk_score=total_score,
      moderation_state=severity_value,
      moderation_scan_pending=false,
      last_moderation_scan_at=now()
  where id=target_work;

  if total_score>=55 and not exists(
    select 1 from public.reports r
    where r.work_id=target_work
      and r.reason='NOVASHIELD'
      and r.status in ('OPEN','REVIEWING')
  ) then
    select array_agg(distinct h.category order by h.category) into categories
    from public.moderation_scan_hits h
    where h.scan_id=new_scan_id;

    insert into public.reports(reporter_id,work_id,reason,details,status)
    values(
      null,
      target_work,
      'NOVASHIELD',
      'NovaShield sinalizou risco '||severity_value||' ('||total_score||'/100). Categorias: '||
        coalesce(array_to_string(categories,', '),'não classificadas')||
        '. Revisão humana obrigatória; nenhum conteúdo foi ocultado automaticamente.',
      'OPEN'
    );
  end if;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
  values(
    uid,'NOVASHIELD_SCAN','WORK',target_work,
    jsonb_build_object(
      'scan_id',new_scan_id,'score',total_score,'severity',severity_value,
      'signals',total_signals,'source',left(upper(coalesce(scan_source,'MANUAL')),40)
    )
  );

  return jsonb_build_object(
    'scan_id',new_scan_id,
    'score',total_score,
    'severity',severity_value,
    'recommended_action',action_value,
    'requires_human_review',total_score>=55
  );
end;
$$;



revoke execute on function public.novashield_scan_work(uuid,text) from public,anon;
grant execute on function public.novashield_scan_work(uuid,text) to authenticated;
