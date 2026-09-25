-- ============================================================
-- SEED: DATOS INICIALES - TORRE 5 (62 APARTAMENTOS)
-- ============================================================
-- Estructura:
--   Pisos 1-10  : 6 apartamentos c/u = 60 aptos (501-560)
--   Piso 11     : 2 Penthouses        =  2 aptos (5PH1, 5PH2)
--   Total: 62 apartamentos
--
-- Alicuotas:
--   Regular   : 1/64 = 0.015625  (todos iguales)
--   Penthouse : 2/64 = 0.031250  (doble por LPH)
--   Check: 60x0.015625 + 2x0.031250 = 0.9375 + 0.0625 = 1.0
-- ============================================================

-- 1. ACTUALIZAR CONFIGURACION DEL EDIFICIO
UPDATE public.configuracion_edificio
SET
  nombre_edificio    = 'Torre 5',
  dominio_email      = 'torre5.com',
  total_apartamentos = 62,
  ciudad             = 'Caracas',
  updated_at         = NOW()
WHERE id = (SELECT id FROM public.configuracion_edificio LIMIT 1);

INSERT INTO public.configuracion_edificio
  (nombre_edificio, dominio_email, total_apartamentos, ciudad)
SELECT 'Torre 5', 'torre5.com', 62, 'Caracas'
WHERE NOT EXISTS (SELECT 1 FROM public.configuracion_edificio);


-- 2. PISO 1 (501-506)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('501', 1, 0.015625, 'habitado'),
  ('502', 1, 0.015625, 'habitado'),
  ('503', 1, 0.015625, 'habitado'),
  ('504', 1, 0.015625, 'habitado'),
  ('505', 1, 0.015625, 'habitado'),
  ('506', 1, 0.015625, 'habitado');

-- 3. PISO 2 (507-512)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('507', 2, 0.015625, 'habitado'),
  ('508', 2, 0.015625, 'habitado'),
  ('509', 2, 0.015625, 'habitado'),
  ('510', 2, 0.015625, 'habitado'),
  ('511', 2, 0.015625, 'habitado'),
  ('512', 2, 0.015625, 'habitado');

-- 4. PISO 3 (513-518)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('513', 3, 0.015625, 'habitado'),
  ('514', 3, 0.015625, 'habitado'),
  ('515', 3, 0.015625, 'habitado'),
  ('516', 3, 0.015625, 'habitado'),
  ('517', 3, 0.015625, 'habitado'),
  ('518', 3, 0.015625, 'habitado');

-- 5. PISO 4 (519-524)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('519', 4, 0.015625, 'habitado'),
  ('520', 4, 0.015625, 'habitado'),
  ('521', 4, 0.015625, 'habitado'),
  ('522', 4, 0.015625, 'habitado'),
  ('523', 4, 0.015625, 'habitado'),
  ('524', 4, 0.015625, 'habitado');

-- 6. PISO 5 (525-530)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('525', 5, 0.015625, 'habitado'),
  ('526', 5, 0.015625, 'habitado'),
  ('527', 5, 0.015625, 'habitado'),
  ('528', 5, 0.015625, 'habitado'),
  ('529', 5, 0.015625, 'habitado'),
  ('530', 5, 0.015625, 'habitado');

-- 7. PISO 6 (531-536)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('531', 6, 0.015625, 'habitado'),
  ('532', 6, 0.015625, 'habitado'),
  ('533', 6, 0.015625, 'habitado'),
  ('534', 6, 0.015625, 'habitado'),
  ('535', 6, 0.015625, 'habitado'),
  ('536', 6, 0.015625, 'habitado');

-- 8. PISO 7 (537-542)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('537', 7, 0.015625, 'habitado'),
  ('538', 7, 0.015625, 'habitado'),
  ('539', 7, 0.015625, 'habitado'),
  ('540', 7, 0.015625, 'habitado'),
  ('541', 7, 0.015625, 'habitado'),
  ('542', 7, 0.015625, 'habitado');

-- 9. PISO 8 (543-548)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('543', 8, 0.015625, 'habitado'),
  ('544', 8, 0.015625, 'habitado'),
  ('545', 8, 0.015625, 'habitado'),
  ('546', 8, 0.015625, 'habitado'),
  ('547', 8, 0.015625, 'habitado'),
  ('548', 8, 0.015625, 'habitado');

-- 10. PISO 9 (549-554)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('549', 9, 0.015625, 'habitado'),
  ('550', 9, 0.015625, 'habitado'),
  ('551', 9, 0.015625, 'habitado'),
  ('552', 9, 0.015625, 'habitado'),
  ('553', 9, 0.015625, 'habitado'),
  ('554', 9, 0.015625, 'habitado');

-- 11. PISO 10 (555-560)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('555', 10, 0.015625, 'habitado'),
  ('556', 10, 0.015625, 'habitado'),
  ('557', 10, 0.015625, 'habitado'),
  ('558', 10, 0.015625, 'habitado'),
  ('559', 10, 0.015625, 'habitado'),
  ('560', 10, 0.015625, 'habitado');

-- 12. PISO 11 - PENTHOUSES (alicuota doble)
INSERT INTO public.apartamentos (numero, piso, alicuota, estado) VALUES
  ('5PH1', 11, 0.031250, 'habitado'),
  ('5PH2', 11, 0.031250, 'habitado');


-- ============================================================
-- VERIFICACION FINAL (ejecutar por separado)
-- ============================================================
-- SELECT COUNT(*) AS total, SUM(alicuota) AS suma_alicuotas,
--        COUNT(*) FILTER (WHERE piso = 11) AS penthouses
-- FROM public.apartamentos;
-- Esperado: 62 | 1.000000 | 2
