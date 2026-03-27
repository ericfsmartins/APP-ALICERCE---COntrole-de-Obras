-- =============================================
-- ALICERCE — Módulo Dinâmico (Sincronização Bidirecional)
-- Execute no SQL Editor do Supabase
-- =============================================

-- =============================================
-- 1. TRIGGER: Insumos -> Fases
-- Atualizar fases.materiais_estimados e total_estimado
-- =============================================
CREATE OR REPLACE FUNCTION public.fn_atualizar_fase_via_insumos()
RETURNS TRIGGER AS $$
DECLARE
  v_fase_id uuid;
  v_soma_materiais numeric(12,2);
BEGIN
  -- Fase atual (NEW ou OLD, caso DELETE)
  v_fase_id := COALESCE(NEW.fase_id, OLD.fase_id);
  
  IF v_fase_id IS NOT NULL THEN
    SELECT COALESCE(SUM(valor_orcado), 0) INTO v_soma_materiais
    FROM public.insumos WHERE fase_id = v_fase_id;
    
    UPDATE public.fases
    SET materiais_estimados = v_soma_materiais,
        total_estimado = mao_obra_estimada + v_soma_materiais
    WHERE id = v_fase_id;
  END IF;
  
  -- Se a fase vinculada mudou em um UPDATE
  IF TG_OP = 'UPDATE' AND OLD.fase_id IS DISTINCT FROM NEW.fase_id THEN
    IF OLD.fase_id IS NOT NULL THEN
      SELECT COALESCE(SUM(valor_orcado), 0) INTO v_soma_materiais
      FROM public.insumos WHERE fase_id = OLD.fase_id;
      
      UPDATE public.fases
      SET materiais_estimados = v_soma_materiais,
          total_estimado = mao_obra_estimada + v_soma_materiais
      WHERE id = OLD.fase_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_atualiza_fase_insumo ON public.insumos;
CREATE TRIGGER trg_atualiza_fase_insumo
  AFTER INSERT OR UPDATE OR DELETE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_fase_via_insumos();

-- =============================================
-- 2. TRIGGER: Despesas -> Insumos, Fases, Momentos
-- Atualizar os realizados dinamicamente
-- =============================================
CREATE OR REPLACE FUNCTION public.fn_atualizar_realizados_via_despesas()
RETURNS TRIGGER AS $$
DECLARE
  v_insumo_id uuid;
  v_fase_id uuid;
  v_momento_id uuid;
  v_soma_realizado numeric(12,2);
  v_soma_fase_mo numeric(12,2);
  v_soma_fase_mat numeric(12,2);
BEGIN
  -- A. INSUMOS (valor_realizado)
  v_insumo_id := COALESCE(NEW.insumo_id, OLD.insumo_id);
  IF v_insumo_id IS NOT NULL THEN
    SELECT COALESCE(SUM(valor), 0) INTO v_soma_realizado
    FROM public.despesas WHERE insumo_id = v_insumo_id;
    
    UPDATE public.insumos SET valor_realizado = v_soma_realizado WHERE id = v_insumo_id;
  END IF;
  
  IF TG_OP = 'UPDATE' AND OLD.insumo_id IS DISTINCT FROM NEW.insumo_id THEN
    IF OLD.insumo_id IS NOT NULL THEN
       SELECT COALESCE(SUM(valor), 0) INTO v_soma_realizado
       FROM public.despesas WHERE insumo_id = OLD.insumo_id;
       UPDATE public.insumos SET valor_realizado = v_soma_realizado WHERE id = OLD.insumo_id;
    END IF;
  END IF;

  -- B. FASES (mao_obra_realizada, materiais_realizados, total_realizado)
  v_fase_id := COALESCE(NEW.fase_id, OLD.fase_id);
  IF v_fase_id IS NOT NULL THEN
     SELECT COALESCE(SUM(valor), 0) INTO v_soma_fase_mo
     FROM public.despesas WHERE fase_id = v_fase_id AND tipo = 'mao_obra';
     
     SELECT COALESCE(SUM(valor), 0) INTO v_soma_fase_mat
     FROM public.despesas WHERE fase_id = v_fase_id AND tipo != 'mao_obra';

     UPDATE public.fases
     SET mao_obra_realizada = v_soma_fase_mo,
         materiais_realizados = v_soma_fase_mat,
         total_realizado = v_soma_fase_mo + v_soma_fase_mat,
         percentual_concluido = CASE 
            WHEN total_estimado > 0 THEN LEAST(100.0, ROUND(((v_soma_fase_mo + v_soma_fase_mat) / total_estimado) * 100.0, 2))
            ELSE 0 END
     WHERE id = v_fase_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.fase_id IS DISTINCT FROM NEW.fase_id THEN
    IF OLD.fase_id IS NOT NULL THEN
       SELECT COALESCE(SUM(valor), 0) INTO v_soma_fase_mo FROM public.despesas WHERE fase_id = OLD.fase_id AND tipo = 'mao_obra';
       SELECT COALESCE(SUM(valor), 0) INTO v_soma_fase_mat FROM public.despesas WHERE fase_id = OLD.fase_id AND tipo != 'mao_obra';
  
       UPDATE public.fases 
       SET mao_obra_realizada = v_soma_fase_mo, 
           materiais_realizados = v_soma_fase_mat, 
           total_realizado = v_soma_fase_mo + v_soma_fase_mat,
           percentual_concluido = CASE 
              WHEN total_estimado > 0 THEN LEAST(100.0, ROUND(((v_soma_fase_mo + v_soma_fase_mat) / total_estimado) * 100.0, 2)) 
              ELSE 0 END
       WHERE id = OLD.fase_id;
    END IF;
  END IF;

  -- C. MOMENTOS (custo_realizado e percentual de conclusao financeiro)
  v_momento_id := COALESCE(NEW.momento_id, OLD.momento_id);
  IF v_momento_id IS NOT NULL THEN
     SELECT COALESCE(SUM(valor), 0) INTO v_soma_realizado FROM public.despesas WHERE momento_id = v_momento_id;
     
     -- Para o percentual do momento, seria apenas uma media ou sum. Faremos somente custo_realizado.
     UPDATE public.momentos SET custo_realizado = v_soma_realizado WHERE id = v_momento_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.momento_id IS DISTINCT FROM NEW.momento_id THEN
    IF OLD.momento_id IS NOT NULL THEN
       SELECT COALESCE(SUM(valor), 0) INTO v_soma_realizado FROM public.despesas WHERE momento_id = OLD.momento_id;
       UPDATE public.momentos SET custo_realizado = v_soma_realizado WHERE id = OLD.momento_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_atualiza_realizados_despesa ON public.despesas;
CREATE TRIGGER trg_atualiza_realizados_despesa
  AFTER INSERT OR UPDATE OR DELETE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_realizados_via_despesas();
