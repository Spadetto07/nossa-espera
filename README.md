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

**Preparo do modelo** (`tools/prep_baby.py`, depois `gltf-transform draco`):
cabeça e corpo unidos numa malha só, superfície alisada e refeita com triângulos
regulares (~268 mil, ~850 KB com Draco) e, por vértice: oclusão ambiente,
espessura local, rubor (lábios, bochechas, nariz, pontas dos dedos), pálpebras e
linha dos cílios, o deslocamento do corpo “magrinho” e os pesos de movimento de
antebraços e pernas.

**No navegador**, a cada dia (`weekLook()`):
- cabeça proporcionalmente maior no começo (~1,3× com 16 semanas, normal com 40);
- corpo magrinho até ~18 semanas, ganhando gordurinha até o parto;
- pele fina, avermelhada e translúcida no começo; mais clara e opaca no fim.

**Pele**: a luz se espalha por baixo da superfície (transição larga de claro para
escuro, faixa avermelhada na sombra, contraluz atravessando orelhas e dedos),
microrrelevo e pouco brilho — dentro do líquido a pele não reluz.

**Ambiente**: interior do útero (parede com vasos, claridade alaranjada por trás,
líquido levemente turvo, partículas), brilho suave, vinheta e grão de foto.

**Movimento**: mãos e pés mexem devagar e, de vez em quando, um chutinho. Fica
parado para quem usa “reduzir movimento” no sistema.

Em aparelho lento a cena baixa a resolução sozinha e, se precisar, desliga o brilho.
Parâmetros de teste na URL: `?still` (sem movimento), `?hq` (sem redução de qualidade).

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
| Luzes, câmera e fundo | `Scene3D.init()` e `createWombMaterial()` em `baby3d.js` |

## Testar outras datas

No console do navegador:

```js
__gest(new Date(2027, 0, 15))   // simula 15/01/2027
```

---

Os valores de tamanho e peso são médias de referência e não substituem
acompanhamento pré-natal.
