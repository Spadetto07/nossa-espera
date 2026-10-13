# Nossa Espera — Acompanhamento Gestacional Interativo

Painel gestacional estático (HTML + CSS + JS puro) com cena 3D em Three.js.
DPP configurada: **27 de abril de 2027**.

## Estrutura

```
/
├── index.html      # marcação + importmap do Three.js + Tailwind CDN
├── style.css       # glassmorphism, gradiente pastel animado, barra de progresso
├── app.js          # lógica de datas, render da UI e motor 3D (ES Module)
└── models/         # coloque aqui os seus week_XX.glb
    ├── week_8.glb
    ├── week_12.glb
    └── ...
```

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "feat: painel gestacional interativo"
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

Depois: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save**.
Em cerca de um minuto o site fica em `https://SEU_USUARIO.github.io/SEU_REPO/`.

> Não precisa de build, bundler nem `npm install`. O `importmap` no `index.html`
> resolve o Three.js direto do jsDelivr.

## Rodar localmente

ES Modules não funcionam via `file://` — suba um servidor:

```bash
python3 -m http.server 8080
# ou
npx serve .
```

## Modelos 3D incluídos

A pasta `models/` já traz um bebê esculpido para as semanas 10, 12, 14, 16, 20,
24, 28, 32, 36 e 40 (gerados por `tools/fetus.py`: SDF + marching cubes, com
cores de pele, pálpebras, lábios e cordão umbilical). As proporções mudam com a
semana: cabeça grande e pele fina e rosada no começo, membros mais gordinhos no
fim. Para trocar por modelos próprios, siga os passos abaixo.

## Ligar os modelos 3D

1. Exporte os `.glb` com o nome `week_<semana>.glb` dentro de `models/`.
2. Em `app.js`, no bloco `CONFIG` (topo do arquivo), liste as semanas que você tem:

```js
availableModels: [8, 12, 16, 20, 24, 28, 32, 36, 40],
```

O app escolhe sozinho o modelo disponível mais próximo **sem passar** da semana
atual — ou seja, você não precisa dos 40 arquivos. Se a lista estiver vazia ou o
arquivo faltar, ele exibe um placeholder procedural e segue funcionando.

O ponto exato do carregamento está marcado em `app.js` no método
`Scene3D.loadWeekModel()`, com o comentário
`>>> AQUI É ONDE VOCÊ CARREGA O ARQUIVO .glb DA SEMANA ATUAL <<<`.

**Dica:** exporte com compressão Draco ou Meshopt e mantenha cada arquivo abaixo
de ~3 MB. Para Draco, descomente as três linhas indicadas em `loadWeekModel()`.

## Tema escuro

A página segue o modo do sistema de quem abrir (`prefers-color-scheme`). Os
tokens do tema escuro ficam no **bloco 8, no fim do `style.css`** — precisa ser
no fim mesmo: se vier antes, as regras do tema claro ganham na cascata e o tema
escuro simplesmente não aplica.

## Aviso de modelo ausente

Quando não há `.glb`, o rodapé do canvas mostra `week_XX.glb não encontrado`.
Esse aviso fica **oculto por padrão** (ninguém que só quer ver o bebê precisa
vê-lo) e aparece adicionando `?debug` na URL:

```
https://SEU_USUARIO.github.io/nossa-espera/?debug
```

## Ajustes rápidos

| O quê | Onde |
|---|---|
| Mudar a DPP | `CONFIG.dpp` em `app.js` |
| Textos de tamanho por semana | objeto `WEEK_DATA` em `app.js` |
| Paleta de cores | variáveis `:root` em `style.css` |
| Intensidade das luzes | seção `5.4 ILUMINAÇÃO` em `app.js` |
| Velocidade da rotação | `controls.autoRotateSpeed` em `app.js` |

## Testar outras datas

No console do navegador:

```js
__gest(new Date(2027, 0, 15))   // simula 15/01/2027
```

---

Os valores de tamanho e peso são médias de referência e não substituem
acompanhamento pré-natal.
