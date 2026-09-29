-- ============================================================
-- MIGRATION V9: CREACIÓN Y ALÍCUOTAS DE LOS 62 APARTAMENTOS (TORRE 5)
-- ============================================================
-- Estructura del edificio:
--   Pisos 1 al 10 : 6 apartamentos por piso = 60 aptos regulares
--   Piso 11 (PH)  : 2 Penthouses = 2 aptos (5PH1, 5PH2)
--   Total         : 62 apartamentos
--
-- Alícuotas:
--   Regulares : 1/64 = 0.015625 (1.5625%)
--   Penthouse : 2/64 = 0.031250 (3.1250% - pagan más)
--   Total     : 60 x 0.015625 + 2 x 0.031250 = 1.000000 (100%)
-- ============================================================

INSERT INTO public.apartamentos (numero, piso, alicuota, estado)
VALUES
  -- Piso 1 (501 - 506)
  ('501', 1, 0.015625, 'habitado'),
  ('502', 1, 0.015625, 'habitado'),
  ('503', 1, 0.015625, 'habitado'),
  ('504', 1, 0.015625, 'habitado'),
  ('505', 1, 0.015625, 'habitado'),
  ('506', 1, 0.015625, 'habitado'),

  -- Piso 2 (521 - 526)
  ('521', 2, 0.015625, 'habitado'),
  ('522', 2, 0.015625, 'habitado'),
  ('523', 2, 0.015625, 'habitado'),
  ('524', 2, 0.015625, 'habitado'),
  ('525', 2, 0.015625, 'habitado'),
  ('526', 2, 0.015625, 'habitado'),

  -- Piso 3 (531 - 536)
  ('531', 3, 0.015625, 'habitado'),
  ('532', 3, 0.015625, 'habitado'),
  ('533', 3, 0.015625, 'habitado'),
  ('534', 3, 0.015625, 'habitado'),
  ('535', 3, 0.015625, 'habitado'),
  ('536', 3, 0.015625, 'habitado'),

  -- Piso 4 (541 - 546)
  ('541', 4, 0.015625, 'habitado'),
  ('542', 4, 0.015625, 'habitado'),
  ('543', 4, 0.015625, 'habitado'),
  ('544', 4, 0.015625, 'habitado'),
  ('545', 4, 0.015625, 'habitado'),
  ('546', 4, 0.015625, 'habitado'),

  -- Piso 5 (551 - 556)
  ('551', 5, 0.015625, 'habitado'),
  ('552', 5, 0.015625, 'habitado'),
  ('553', 5, 0.015625, 'habitado'),
  ('554', 5, 0.015625, 'habitado'),
  ('555', 5, 0.015625, 'habitado'),
  ('556', 5, 0.015625, 'habitado'),

  -- Piso 6 (561 - 566)
  ('561', 6, 0.015625, 'habitado'),
  ('562', 6, 0.015625, 'habitado'),
  ('563', 6, 0.015625, 'habitado'),
  ('564', 6, 0.015625, 'habitado'),
  ('565', 6, 0.015625, 'habitado'),
  ('566', 6, 0.015625, 'habitado'),

  -- Piso 7 (571 - 576)
  ('571', 7, 0.015625, 'habitado'),
  ('572', 7, 0.015625, 'habitado'),
  ('573', 7, 0.015625, 'habitado'),
  ('574', 7, 0.015625, 'habitado'),
  ('575', 7, 0.015625, 'habitado'),
  ('576', 7, 0.015625, 'habitado'),

  -- Piso 8 (581 - 586)
  ('581', 8, 0.015625, 'habitado'),
  ('582', 8, 0.015625, 'habitado'),
  ('583', 8, 0.015625, 'habitado'),
  ('584', 8, 0.015625, 'habitado'),
  ('585', 8, 0.015625, 'habitado'),
  ('586', 8, 0.015625, 'habitado'),

  -- Piso 9 (591 - 596)
  ('591', 9, 0.015625, 'habitado'),
  ('592', 9, 0.015625, 'habitado'),
  ('593', 9, 0.015625, 'habitado'),
  ('594', 9, 0.015625, 'habitado'),
  ('595', 9, 0.015625, 'habitado'),
  ('596', 9, 0.015625, 'habitado'),

  -- Piso 10 (5101 - 5106)
  ('5101', 10, 0.015625, 'habitado'),
  ('5102', 10, 0.015625, 'habitado'),
  ('5103', 10, 0.015625, 'habitado'),
  ('5104', 10, 0.015625, 'habitado'),
  ('5105', 10, 0.015625, 'habitado'),
  ('5106', 10, 0.015625, 'habitado'),

  -- Piso 11: Penthouses (PH pagan más: 3.1250%)
  ('5PH1', 11, 0.031250, 'habitado'),
  ('5PH2', 11, 0.031250, 'habitado')
ON CONFLICT (numero) DO UPDATE
SET
  piso = EXCLUDED.piso,
  alicuota = CASE 
    -- Si el admin ya la modificó a otro valor diferente al default anterior, conservar
    WHEN public.apartamentos.alicuota NOT IN (0, 0.015625, 0.05) THEN public.apartamentos.alicuota
    ELSE EXCLUDED.alicuota
  END;

-- Verificación
SELECT
  COUNT(*) AS total_apartamentos,
  ROUND(SUM(alicuota)::numeric, 4) AS suma_alicuotas,
  COUNT(*) FILTER (WHERE numero LIKE '%PH%') AS penthouses
FROM public.apartamentos;
