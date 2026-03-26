-- =============================================
-- ALICERCE — Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- =============================================

-- Extensão UUID
create extension if not exists "uuid-ossp";

-- =============================================
-- TABELA: profiles (estende auth.users)
-- =============================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text,
  role        text not null default 'mestre' check (role in ('admin','engenheiro','mestre','cliente','fornecedor')),
  avatar_url  text,
  obra_ids    uuid[] default '{}',
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Usuários veem seu próprio perfil" on public.profiles
  for select using (auth.uid() = id);

create policy "Usuários atualizam seu próprio perfil" on public.profiles
  for update using (auth.uid() = id);

create policy "Admin vê todos os perfis" on public.profiles
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Trigger: cria profile automático ao registrar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'mestre')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- TABELA: obras
-- =============================================
create table if not exists public.obras (
  id                      uuid primary key default uuid_generate_v4(),
  nome                    text not null,
  endereco                text,
  area_total              numeric(10,2) default 0,
  custo_por_m2            numeric(10,2) default 1375,
  orcamento_total         numeric(12,2) generated always as (area_total * custo_por_m2) stored,
  percentual_mao_obra     numeric(5,2) default 29.09,
  percentual_materiais    numeric(5,2) default 70.91,
  data_inicio             date,
  data_fim_prevista       date,
  responsavel_tecnico     text,
  status                  text default 'planejamento' check (status in ('planejamento','em_andamento','pausada','concluida')),
  logo_url                text,
  owner_id                uuid references auth.users(id),
  created_at              timestamptz default now()
);

alter table public.obras enable row level security;

create policy "Dono vê/edita sua obra" on public.obras
  for all using (owner_id = auth.uid());

create policy "Membros veem obras vinculadas" on public.obras
  for select using (
    id = any(
      select unnest(obra_ids) from public.profiles where id = auth.uid()
    )
  );

-- =============================================
-- TABELA: fases
-- =============================================
create table if not exists public.fases (
  id                      uuid primary key default uuid_generate_v4(),
  obra_id                 uuid not null references public.obras(id) on delete cascade,
  numero                  integer not null,
  nome                    text not null,
  descricao               text,
  proporcao               numeric(5,2),
  is_variavel             boolean default false,
  total_estimado          numeric(12,2) default 0,
  mao_obra_estimada       numeric(12,2) default 0,
  materiais_estimados     numeric(12,2) default 0,
  total_realizado         numeric(12,2) default 0,
  mao_obra_realizada      numeric(12,2) default 0,
  materiais_realizados    numeric(12,2) default 0,
  percentual_concluido    numeric(5,2) default 0 check (percentual_concluido between 0 and 100),
  status                  text default 'planejamento' check (status in ('planejamento','em_andamento','concluida','pausada')),
  data_inicio_prevista    date,
  data_inicio_real        date,
  data_fim_prevista       date,
  data_fim_real           date,
  responsavel             text,
  created_at              timestamptz default now()
);

alter table public.fases enable row level security;

create policy "Acesso via obra" on public.fases
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: momentos
-- =============================================
create table if not exists public.momentos (
  id                      uuid primary key default uuid_generate_v4(),
  obra_id                 uuid not null references public.obras(id) on delete cascade,
  numero                  integer not null,
  nome                    text not null,
  descricao               text,
  prazo_estimado_min      numeric(4,1),
  prazo_estimado_max      numeric(4,1),
  status                  text default 'nao_iniciado' check (status in ('nao_iniciado','em_andamento','concluido','bloqueado')),
  percentual_concluido    numeric(5,2) default 0,
  custo_realizado         numeric(12,2) default 0,
  data_inicio_real        date,
  data_fim_real           date,
  prerequisito_ids        uuid[] default '{}',
  ordem                   integer default 0,
  created_at              timestamptz default now()
);

alter table public.momentos enable row level security;

create policy "Acesso via obra" on public.momentos
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: tarefas_momento
-- =============================================
create table if not exists public.tarefas_momento (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid not null references public.obras(id) on delete cascade,
  momento_id          uuid not null references public.momentos(id) on delete cascade,
  nome                text not null,
  descricao           text,
  tipo                text default 'atividade' check (tipo in ('atividade','aquisicao_critica','contrato')),
  fase_ids            uuid[] default '{}',
  status              text default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  percentual_concluido numeric(5,2) default 0,
  responsavel         text,
  data_prevista       date,
  data_conclusao      date,
  observacoes         text,
  ordem               integer default 0,
  created_at          timestamptz default now()
);

alter table public.tarefas_momento enable row level security;

create policy "Acesso via obra" on public.tarefas_momento
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: despesas
-- =============================================
create table if not exists public.despesas (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid not null references public.obras(id) on delete cascade,
  descricao           text not null,
  valor               numeric(12,2) not null default 0,
  tipo                text default 'material' check (tipo in ('mao_obra','material','servico','equipamento','outro')),
  fase_id             uuid references public.fases(id) on delete set null,
  fase_nome           text,
  momento_id          uuid references public.momentos(id) on delete set null,
  momento_nome        text,
  insumo_id           uuid,
  fornecedor_id       uuid,
  fornecedor_nome     text,
  data_lancamento     date default current_date,
  data_vencimento     date,
  data_pagamento      date,
  status_pagamento    text default 'pendente' check (status_pagamento in ('pendente','pago','vencido')),
  forma_pagamento     text check (forma_pagamento in ('pix','boleto','transferencia','dinheiro','cartao')),
  nota_fiscal         text,
  arquivo_url         text,
  observacoes         text,
  created_at          timestamptz default now(),
  created_by          uuid references auth.users(id)
);

alter table public.despesas enable row level security;

create policy "Acesso via obra" on public.despesas
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: insumos
-- =============================================
create table if not exists public.insumos (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid not null references public.obras(id) on delete cascade,
  ranking             integer,
  classe              text check (classe in ('A','B','C')),
  nome                text not null,
  categoria           text,
  peso_percentual     numeric(6,3) default 0,
  valor_orcado        numeric(12,2) default 0,
  valor_realizado     numeric(12,2) default 0,
  fase_id             uuid references public.fases(id) on delete set null,
  momento_id          uuid references public.momentos(id) on delete set null,
  fornecedor          text,
  unidade             text,
  quantidade          numeric(10,3),
  preco_unitario      numeric(10,2),
  status              text default 'nao_cotado' check (status in ('nao_cotado','cotado','aprovado','comprado','entregue')),
  created_at          timestamptz default now()
);

alter table public.insumos enable row level security;

create policy "Acesso via obra" on public.insumos
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: diario_obra
-- =============================================
create table if not exists public.diario_obra (
  id                      uuid primary key default uuid_generate_v4(),
  obra_id                 uuid not null references public.obras(id) on delete cascade,
  data                    date not null default current_date,
  fase_id                 uuid references public.fases(id) on delete set null,
  fase_nome               text,
  momento_id              uuid references public.momentos(id) on delete set null,
  momento_nome            text,
  atividades              text,
  ocorrencias             text,
  funcionarios_presentes  integer default 0,
  clima                   text default 'sol' check (clima in ('sol','nublado','chuva','chuva_forte')),
  progresso_percentual    numeric(5,2) default 0,
  fotos_urls              text[] default '{}',
  observacoes             text,
  responsavel             text,
  created_at              timestamptz default now(),
  created_by              uuid references auth.users(id)
);

alter table public.diario_obra enable row level security;

create policy "Acesso via obra" on public.diario_obra
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: documentos
-- =============================================
create table if not exists public.documentos (
  id              uuid primary key default uuid_generate_v4(),
  obra_id         uuid not null references public.obras(id) on delete cascade,
  nome            text not null,
  arquivo_url     text,
  tipo            text default 'outro' check (tipo in ('projeto','contrato','nota_fiscal','foto','alvara','orcamento','outro')),
  fase_id         uuid references public.fases(id) on delete set null,
  fase_nome       text,
  momento_id      uuid references public.momentos(id) on delete set null,
  fornecedor_id   uuid,
  tamanho_kb      integer,
  descricao       text,
  data_documento  date,
  validade        date,
  created_at      timestamptz default now()
);

alter table public.documentos enable row level security;

create policy "Acesso via obra" on public.documentos
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- TABELA: fornecedores
-- =============================================
create table if not exists public.fornecedores (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid references auth.users(id),
  nome            text not null,
  tipo            text default 'misto' check (tipo in ('material','servico','mao_obra','equipamento','misto')),
  cnpj_cpf        text,
  contato_nome    text,
  telefone        text,
  email           text,
  endereco        text,
  avaliacao       integer default 3 check (avaliacao between 1 and 5),
  especialidades  text[] default '{}',
  observacoes     text,
  status          text default 'ativo' check (status in ('ativo','inativo','suspenso')),
  obra_ids        uuid[] default '{}',
  created_at      timestamptz default now()
);

alter table public.fornecedores enable row level security;

create policy "Dono gerencia seus fornecedores" on public.fornecedores
  for all using (owner_id = auth.uid());

-- =============================================
-- TABELA: orcamentos
-- =============================================
create table if not exists public.orcamentos (
  id              uuid primary key default uuid_generate_v4(),
  obra_id         uuid not null references public.obras(id) on delete cascade,
  titulo          text not null,
  fornecedor_id   uuid references public.fornecedores(id) on delete set null,
  fornecedor_nome text,
  fase_id         uuid references public.fases(id) on delete set null,
  fase_nome       text,
  momento_id      uuid references public.momentos(id) on delete set null,
  valor_total     numeric(12,2) default 0,
  data_emissao    date default current_date,
  data_validade   date,
  data_entrega    date,
  status          text default 'rascunho' check (status in ('rascunho','cotado','em_analise','em_negociacao','aprovado','reprovado','cancelado','assinado','pago')),
  itens           jsonb default '[]',
  observacoes     text,
  created_at      timestamptz default now()
);

alter table public.orcamentos enable row level security;

create policy "Acesso via obra" on public.orcamentos
  for all using (
    obra_id in (select id from public.obras where owner_id = auth.uid())
    or
    obra_id in (select unnest(obra_ids) from public.profiles where id = auth.uid())
  );

-- =============================================
-- STORAGE BUCKETS
-- =============================================
insert into storage.buckets (id, name, public) values ('diario-fotos', 'diario-fotos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict do nothing;

create policy "Fotos diário públicas" on storage.objects for select using (bucket_id = 'diario-fotos');
create policy "Upload fotos autenticado" on storage.objects for insert with check (bucket_id = 'diario-fotos' and auth.role() = 'authenticated');
create policy "Documentos públicos" on storage.objects for select using (bucket_id = 'documentos');
create policy "Upload documentos autenticado" on storage.objects for insert with check (bucket_id = 'documentos' and auth.role() = 'authenticated');
create policy "Logos públicas" on storage.objects for select using (bucket_id = 'logos');
create policy "Upload logos autenticado" on storage.objects for insert with check (bucket_id = 'logos' and auth.role() = 'authenticated');
