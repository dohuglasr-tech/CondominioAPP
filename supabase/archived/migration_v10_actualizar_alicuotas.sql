-- ==============================================================================
-- Migración V10: Actualizar Alícuotas de Todos los Apartamentos
-- Normales: 1.59% (0.0159)
-- Penthouses (PH): 2.59% (0.0259)
-- ==============================================================================

-- 1. Actualizar apartamentos regulares (Pisos 1 al 10, no PH) a 1.59% (0.0159)
UPDATE public.apartamentos
SET alicuota = 0.0159
WHERE numero NOT ILIKE '%PH%';

-- 2. Actualizar apartamentos Penthouse (5PH1, 5PH2) a 2.59% (0.0259)
UPDATE public.apartamentos
SET alicuota = 0.0259
WHERE numero ILIKE '%PH%';

-- Verificación de totales:
-- 60 apartamentos normales x 0.0159 = 0.9540 (95.40%)
--  2 apartamentos PH       x 0.0259 = 0.0518 ( 5.18%)
-- Total = 1.0058 (100.58%)
