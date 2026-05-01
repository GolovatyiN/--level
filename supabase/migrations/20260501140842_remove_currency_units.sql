-- Remove currency-specific KPI units (rubles, dollars) to keep the unit
-- catalogue country-neutral. Existing KPIs that reference these symbols are
-- not affected — `kpis.unit` stores the symbol as plain text, no FK.
DELETE FROM public.kpi_units WHERE symbol IN ('₽', '$');
