-- =============================================================================
-- Ручная сортировка отделов на странице /plans.
--
-- В таблице directions появляется sort_order. По умолчанию новые строки
-- получают max(sort_order) + 1, чтобы новый отдел падал в конец списка.
-- Бэкфилл существующих рядов по (created_at, name) — стабильный порядок,
-- который совпадает с тем, что раньше отдавал useDirections (.order("name")).
-- =============================================================================

ALTER TABLE public.directions
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Бэкфилл — фиксируем текущий порядок.
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, name) - 1) AS rn
    FROM public.directions
)
UPDATE public.directions d
   SET sort_order = r.rn
  FROM ranked r
 WHERE d.id = r.id;

CREATE INDEX IF NOT EXISTS idx_directions_sort_order
  ON public.directions(sort_order);

-- Триггер, который ставит новому отделу sort_order = max + 1.
-- Сохраняем явно переданный sort_order, если он есть.
CREATE OR REPLACE FUNCTION public.set_direction_default_sort_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_order INTEGER;
BEGIN
  IF NEW.sort_order IS NULL OR NEW.sort_order = 0 THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_order FROM public.directions;
    NEW.sort_order := next_order;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directions_default_sort_order ON public.directions;
CREATE TRIGGER trg_directions_default_sort_order
  BEFORE INSERT ON public.directions
  FOR EACH ROW EXECUTE FUNCTION public.set_direction_default_sort_order();
