-- Localize notification titles to match the unified Russian glossary in
-- the UI: KPI → цель.

CREATE OR REPLACE FUNCTION public.notify_kpi_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> NEW.owner_id) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    VALUES (
      NEW.owner_id,
      actor,
      'kpi_assigned',
      'Вы — ответственный за цель',
      NEW.name,
      'kpi',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_kpi_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned UUID;
  kpi_name  TEXT;
  actor     UUID := auth.uid();
BEGIN
  IF NEW.mentioned_user_ids IS NULL OR cardinality(NEW.mentioned_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT name INTO kpi_name FROM public.kpis WHERE id = NEW.kpi_id;

  FOREACH mentioned IN ARRAY NEW.mentioned_user_ids LOOP
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    SELECT mentioned, actor, 'kpi_mention',
           'Вас упомянули в цели «' || COALESCE(kpi_name, '—') || '»',
           NEW.content,
           'kpi_comment', NEW.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = mentioned AND entity_type = 'kpi_comment' AND entity_id = NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Update existing notification rows so the bell shows the new wording too.
UPDATE public.notifications
   SET title = 'Вы — ответственный за цель'
 WHERE type = 'kpi_assigned' AND title LIKE '%KPI%';

UPDATE public.notifications
   SET title = REPLACE(title, 'KPI', 'цели')
 WHERE type = 'kpi_mention' AND title LIKE '%KPI%';
