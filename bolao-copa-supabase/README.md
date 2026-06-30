# Bolão da Copa 2026

App de bolão para a equipe/amigos, com placar, palpites e classificação em tempo real, usando Supabase como backend.

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com e crie um projeto novo (grátis).
2. Vá em **SQL Editor** → cole o conteúdo de `supabase-schema.sql` → **Run**.
   - Isso cria as tabelas `matches`, `results`, `participants`, `predictions`, libera as policies de leitura/escrita e ativa o Realtime.
3. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o projeto local

```bash
cd bolao-copa-supabase
cp .env.example .env
```

Edite o `.env`:
```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

(Opcional) Troque o código de organizador, padrão é `network2026`:
```
VITE_ADMIN_PASS=sua-senha-aqui
```

## 3. Rodar localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## 4. Deploy (Vercel é o caminho mais rápido)

1. Suba esta pasta para um repositório no GitHub.
2. Em https://vercel.com → **New Project** → importe o repositório.
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (e `VITE_ADMIN_PASS` se quiser trocar a senha).
4. Deploy. Pronto — manda o link pro grupo.

(Netlify funciona do mesmo jeito: build command `npm run build`, publish directory `dist`.)

## Como usar

- Cada participante abre o link e digita o nome — fica salvo no navegador dele.
- Em **Jogos & Palpites**, todo mundo dá seu placar para cada partida.
- Clicando em **Organizador** (canto superior direito) e digitando o código, você pode:
  - Cadastrar as partidas (time, fase, data/hora)
  - Lançar o resultado real de cada jogo — isso trava os palpites e calcula os pontos automaticamente
  - Limpar todos os dados, se precisar reiniciar
- Pontuação: **10 pts** por cravar o placar exato, **5 pts** por acertar só o resultado (vitória/empate/derrota), 0 se errar.
- A tela atualiza sozinha (Realtime do Supabase) quando alguém dá um palpite ou o organizador lança um resultado — não precisa recarregar a página.

## Segurança

Este projeto usa policies abertas (qualquer pessoa com o link/chave anon pode ler e escrever). Isso é adequado para um grupo fechado de confiança (equipe, amigos). Não é recomendado para algo público na internet sem adicionar autenticação real (Supabase Auth) e políticas mais restritivas.
