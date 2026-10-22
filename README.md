# Nossa Espera — Acompanhamento Gestacional Interativo

Painel gestacional estático (HTML + CSS + JS puro) com cena 3D em Three.js.
DPP configurada: **27 de abril de 2027**.

## Estrutura

```
/
├── index.html      # marcação + importmap do Three.js + Tailwind CDN
├── style.css       # glassmorphism, gradiente pastel animado, barra de progresso
├── app.js        # datas, contagem e interface (ES Module)
├── baby3d.js     # cena 3D do bebê (Three.js)
├── models/baby.glb
└── tools/prep_baby.py
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

## Bebê 3D

`baby3d.js` monta a cena com `models/baby.glb` — baseado no modelo
[“Baby”, de joekarava](https://sketchfab.com/3d-models/baby-f05a87806cad49feb75ac7659d55c368),
licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (crédito no rodapé do site).

Adaptações (`tools/prep_baby.py`, depois `gltf-transform draco`):
cabeça e corpo unidos numa malha só, costura do pescoço suavizada, malha
simplificada (~190 mil triângulos, ~540 KB com Draco) e, por vértice,
oclusão ambiente (canal R) e espessura local (canal G).

No navegador, a cada dia:
- a cabeça fica proporcionalmente maior quanto mais cedo na gestação
  (~1,4× com 12 semanas, tamanho normal com 40);
- a pele vai de rosada e fina (translúcida nas orelhas, dedos e nariz, com
  vasinhos sutis) para o tom de recém-nascido;
- o cordão umbilical é gerado com vasos em espiral.

Os ajustes ficam em `weekLook()` no topo de `baby3d.js`.

## Tema escuro

A página segue o modo do sistema de quem abrir (`prefers-color-scheme`). Os
tokens do tema escuro ficam no **bloco 8, no fim do `style.css`** — precisa ser
no fim mesmo: se vier antes, as regras do tema claro ganham na cascata e o tema
escuro simplesmente não aplica.

## Aviso de modelo ausente

Se `models/baby.glb` não carregar, aparece um aviso no canvas — só com `?debug`
na URL (`https://spadetto07.github.io/nossa-espera/?debug`).

## Ajustes rápidos

| O quê | Onde |
|---|---|
| Mudar a DPP | `CONFIG.dpp` em `app.js` |
| Textos de tamanho por semana | objeto `WEEK_DATA` em `app.js` |
| Paleta de cores | variáveis `:root` em `style.css` |
| Aparência do bebê por semana | `weekLook()` em `baby3d.js` |
| Luzes e câmera | `Scene3D.init()` em `baby3d.js` |

## Testar outras datas

No console do navegador:

```js
__gest(new Date(2027, 0, 15))   // simula 15/01/2027
```

---

Os valores de tamanho e peso são médias de referência e não substituem
acompanhamento pré-natal.
