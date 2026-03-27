-- =============================================
-- ALICERCE — Módulo Financeiro (Migration 002)
-- Execute no SQL Editor do Supabase
-- =============================================

-- =============================================
-- TABELA: conta_obra (uma por obra)
-- =============================================
CREATE TABLE IF NOT EXISTS public.conta_obra (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome            VARCHAR(100) DEFAULT 'Conta da Obra',
  saldo_atual     DECIMAL(12,2) DEFAULT 0,
  saldo_inicial   DECIMAL(12,2) DEFAULT 0,
  limite_alerta   DECIMAL(12,2) DEFAULT 10000,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (obra_id)
);

ALTER TABLE public.conta_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso via obra" ON public.conta_obra
  FOR ALL USING (
    obra_id IN (SELECT id FROM public.obras WHERE owner_id = auth.uid())
    OR
    obra_id IN (SELECT unnest(obra_ids) FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- TABELA: financiamentos
-- =============================================
CREATE TABLE IF NOT EXISTS public.financiamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  banco            VARCHAR(100) NOT NULL,
  numero_contrato  VARCHAR(50),
  valor_total      DECIMAL(12,2) NOT NULL,
  total_parcelas   INTEGER NOT NULL,
  data_inicio      DATE NOT NULL,
  taxa_juros       DECIMAL(5,4) DEFAULT 0,
  status           VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado','suspenso')),
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.financiamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso via obra" ON public.financiamentos
  FOR ALL USING (
    obra_id IN (SELECT id FROM public.obras WHERE owner_id = auth.uid())
    OR
    obra_id IN (SELECT unnest(obra_ids) FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- TABELA: parcelas_financiamento
-- =============================================
CREATE TABLE IF NOT EXISTS public.parcelas_financiamento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financiamento_id    UUID NOT NULL REFERENCES public.financiamentos(id) ON DELETE CASCADE,
  obra_id             UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  numero_parcela      INTEGER NOT NULL,
  valor               DECIMAL(12,2) NOT NULL,
  data_prevista       DATE NOT NULL,
  data_recebimento    DATE,
  status              VARCHAR(20) DEFAULT 'aguardando' CHECK (status IN ('aguardando','liberada','recebida','atrasada')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parcelas_financiamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso via obra" ON public.parcelas_financiamento
  FOR ALL USING (
    obra_id IN (SELECT id FROM public.obras WHERE owner_id = auth.uid())
    OR
    obra_id IN (SELECT unnest(obra_ids) FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- TABELA: movimentacoes_conta
-- =============================================
CREATE TABLE IF NOT EXISTS public.movimentacoes_conta (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id            UUID REFERENCES public.conta_obra(id) ON DELETE CASCADE,
  obra_id             UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo                VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria           VARCHAR(50) NOT NULL,
  descricao           VARCHAR(255) NOT NULL,
  valor               DECIMAL(12,2) NOT NULL,
  saldo_apos          DECIMAL(12,2),
  data_movimentacao   DATE NOT NULL DEFAULT CURRENT_DATE,
  despesa_id          UUID REFERENCES public.despesas(id) ON DELETE SET NULL,
  parcela_id          UUID REFERENCES public.parcelas_financiamento(id) ON DELETE SET NULL,
  criado_por          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.movimentacoes_conta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso via obra" ON public.movimentacoes_conta
  FOR ALL USING (
    obra_id IN (SELECT id FROM public.obras WHERE owner_id = auth.uid())
    OR
    obra_id IN (SELECT unnest(obra_ids) FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- TRIGGER: débito automático ao lançar despesa
-- =============================================
CREATE OR REPLACE FUNCTION public.fn_debitar_despesa()
RETURNS TRIGGER AS $$
DECLARE
  v_conta   public.conta_obra%ROWTYPE;
  v_novo    DECIMAL(12,2);
BEGIN
  SELECT * INTO v_conta
  FROM public.conta_obra
  WHERE obra_id = NEW.obra_id
  LIMIT 1;

  IF v_conta.id IS NOT NULL THEN
    v_novo := v_conta.saldo_atual - NEW.valor;

    UPDATE public.conta_obra
    SET saldo_atual = v_novo, updated_at = NOW()
    WHERE id = v_conta.id;

    INSERT INTO public.movimentacoes_conta
      (conta_id, obra_id, tipo, categoria, descricao, valor, saldo_apos, data_movimentacao, despesa_id)
    VALUES
      (v_conta.id, NEW.obra_id, 'saida',
       COALESCE(NEW.tipo, 'outro'),
       COALESCE(NEW.descricao, 'Despesa lançada'),
       NEW.valor, v_novo,
       COALESCE(NEW.data_lancamento, CURRENT_DATE),
       NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_debitar_despesa ON public.despesas;
CREATE TRIGGER trg_debitar_despesa
  AFTER INSERT ON public.despesas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_debitar_despesa();
