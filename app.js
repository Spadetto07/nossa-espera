/* =============================================================================
 *  NOSSA ESPERA — Acompanhamento Gestacional Interativo
 *  app.js · JavaScript puro (ES Modules), sem build, pronto para GitHub Pages
 *
 *  Estrutura do arquivo:
 *    [1] CONFIGURAÇÃO          — DPP e constantes
 *    [2] TABELA DE SEMANAS     — comparativo de tamanho + marcos
 *    [3] LÓGICA DE DATAS       — idade gestacional, countdown, progresso
 *    [4] RENDER DA UI          — escreve os valores na tela
 *    [5] MOTOR 3D              — em baby3d.js (Three.js)
 *    [6] BOOT                  — inicialização e listeners
 * ========================================================================== */

import { Scene3D } from './baby3d.js';   // cena 3D do bebê (modelo realista + ajustes por semana)

/* =============================================================================
 * [1] CONFIGURAÇÃO
 * ========================================================================== */

const CONFIG = {
  /**
   * DATA PREVISTA DO PARTO (DPP): 27 de abril de 2027.
   *
   * IMPORTANTE SOBRE FUSO HORÁRIO:
   * `new Date('2027-04-27')` seria interpretado como UTC meia-noite e, no
   * Brasil (UTC-3), viraria 26/04 às 21h — errando um dia inteiro no cálculo.
   * Por isso usamos o construtor numérico, que cria a data no fuso LOCAL.
   * Lembrete: em JavaScript o mês é 0-indexado (0 = janeiro, 3 = abril).
   */
  dpp: new Date(2027, 3, 27, 0, 0, 0),

  /** Gestação de referência: 280 dias = 40 semanas contadas a partir da DUM. */
  totalDays: 280,


  /** Nome carinhoso exibido no título (opcional, só estético). */
  babyName: 'você'
};

/**
 * DATA DE INÍCIO (DUM — Data da Última Menstruação).
 * É a DPP menos 280 dias. Para a DPP de 27/04/2027 isso resulta
 * em 21/07/2026 — esse é o "dia zero" da contagem.
 */
const START_DATE = addDays(CONFIG.dpp, -CONFIG.totalDays);

/* =============================================================================
 * [2] TABELA DE SEMANAS — comparativo de tamanho
 *
 * Array indexado por semana gestacional (4 a 42). Cada item traz:
 *   fruit   → o comparativo em texto ("Tamanho de uma framboesa")
 *   emoji   → ícone exibido ao lado
 *   length  → comprimento aproximado (crânio-nádega até ~20s, depois total)
 *   weight  → peso aproximado
 *   note    → marco de desenvolvimento da semana
 *
 * Valores são médias de referência — ajuste à vontade.
 * ========================================================================== */

const WEEK_DATA = {
   4: { fruit: 'semente de papoula',       emoji: '⚪️', length: '1 mm',    weight: '<1 g',  note: 'O tubo neural está se formando — a base do cérebro e da medula.' },
   5: { fruit: 'semente de gergelim',      emoji: '🌾', length: '2 mm',    weight: '<1 g',  note: 'O coraçãozinho começa a bater, ainda como um tubo simples.' },
   6: { fruit: 'grão de lentilha',         emoji: '🫘', length: '4 mm',    weight: '<1 g',  note: 'Surgem os brotos que virão a ser braços e pernas.' },
   7: { fruit: 'mirtilo',                  emoji: '🫐', length: '1,0 cm',  weight: '1 g',   note: 'O cérebro cresce rápido; já dá para ver as narinas se formando.' },
   8: { fruit: 'framboesa',                emoji: '🍇', length: '1,6 cm',  weight: '1 g',   note: 'Dedinhos das mãos começam a se separar. Ele já se mexe (você ainda não sente).' },
   9: { fruit: 'azeitona',                 emoji: '🫒', length: '2,3 cm',  weight: '2 g',   note: 'A "caudinha" embrionária desaparece — agora é oficialmente um feto.' },
  10: { fruit: 'morango',                  emoji: '🍓', length: '3,1 cm',  weight: '4 g',   note: 'Unhas e folículos capilares começam a aparecer.' },
  11: { fruit: 'figo',                     emoji: '🫗', length: '4,1 cm',  weight: '7 g',   note: 'Já consegue abrir e fechar as mãos em punho.' },
  12: { fruit: 'limão siciliano',          emoji: '🍋', length: '5,4 cm',  weight: '14 g',  note: 'Reflexos aparecem: se você cutucar a barriga, ele reage.' },
  13: { fruit: 'vagem de ervilha',         emoji: '🫛', length: '7,4 cm',  weight: '23 g',  note: 'As impressões digitais já estão formadas — únicas para sempre.' },
  14: { fruit: 'pêssego',                  emoji: '🍑', length: '8,7 cm',  weight: '43 g',  note: 'Começa a fazer caretas: franzir a testa, apertar os olhos.' },
  15: { fruit: 'maçã',                     emoji: '🍎', length: '10,1 cm', weight: '70 g',  note: 'Consegue perceber luz, mesmo com os olhos ainda fechados.' },
  16: { fruit: 'abacate',                  emoji: '🥑', length: '11,6 cm', weight: '100 g', note: 'Os ossinhos do ouvido se formam — ele começa a ouvir você.' },
  17: { fruit: 'cebola',                   emoji: '🧅', length: '13,0 cm', weight: '140 g', note: 'Gordura começa a se acumular sob a pele.' },
  18: { fruit: 'pimentão',                 emoji: '🫑', length: '14,2 cm', weight: '190 g', note: 'Ele boceja, se espreguiça e talvez soluce lá dentro.' },
  19: { fruit: 'manga',                    emoji: '🥭', length: '15,3 cm', weight: '240 g', note: 'A vérnix — uma camada protetora e cremosa — cobre a pele.' },
  20: { fruit: 'banana',                   emoji: '🍌', length: '25,6 cm', weight: '300 g', note: 'Metade do caminho! A partir daqui mede-se da cabeça ao pé.' },
  21: { fruit: 'cenoura',                  emoji: '🥕', length: '26,7 cm', weight: '360 g', note: 'Começa a engolir líquido amniótico — treino para digerir.' },
  22: { fruit: 'espiga de milho',          emoji: '🌽', length: '27,8 cm', weight: '430 g', note: 'Sobrancelhas e cílios já são visíveis.' },
  23: { fruit: 'berinjela',                emoji: '🍆', length: '28,9 cm', weight: '501 g', note: 'Reage a sons externos — sua voz é a favorita dele.' },
  24: { fruit: 'melão cantaloupe pequeno', emoji: '🍈', length: '30,0 cm', weight: '600 g', note: 'Os pulmões formam as ramificações finais das vias aéreas.' },
  25: { fruit: 'couve-flor',               emoji: '🥦', length: '34,6 cm', weight: '660 g', note: 'A pele deixa de ser translúcida e ganha cor.' },
  26: { fruit: 'alface americana',         emoji: '🥬', length: '35,6 cm', weight: '760 g', note: 'Os olhos começam a abrir pela primeira vez.' },
  27: { fruit: 'couve-flor grande',        emoji: '🥦', length: '36,6 cm', weight: '875 g', note: 'Fim do 2º trimestre. Ele tem ciclos regulares de sono e vigília.' },
  28: { fruit: 'berinjela grande',         emoji: '🍆', length: '37,6 cm', weight: '1,0 kg', note: 'Já sonha — atividade de sono REM detectável.' },
  29: { fruit: 'abóbora cabotiá',          emoji: '🎃', length: '38,6 cm', weight: '1,2 kg', note: 'Os músculos e pulmões amadurecem rápido; os chutes ficam fortes.' },
  30: { fruit: 'repolho',                  emoji: '🥬', length: '39,9 cm', weight: '1,3 kg', note: 'O lanugo (pelinho fino) começa a desaparecer.' },
  31: { fruit: 'coco',                     emoji: '🥥', length: '41,1 cm', weight: '1,5 kg', note: 'Ganha cerca de 200 g por semana a partir de agora.' },
  32: { fruit: 'jaca pequena',             emoji: '🍈', length: '42,4 cm', weight: '1,7 kg', note: 'Unhas dos pés completamente formadas.' },
  33: { fruit: 'abacaxi',                  emoji: '🍍', length: '43,7 cm', weight: '1,9 kg', note: 'Os ossos do crânio seguem moles — para facilitar a passagem no parto.' },
  34: { fruit: 'melão cantaloupe',         emoji: '🍈', length: '45,0 cm', weight: '2,1 kg', note: 'O sistema nervoso central amadurece rapidamente.' },
  35: { fruit: 'melão honeydew',           emoji: '🍈', length: '46,2 cm', weight: '2,4 kg', note: 'Rins totalmente desenvolvidos; o fígado já processa resíduos.' },
  36: { fruit: 'alface romana',            emoji: '🥬', length: '47,4 cm', weight: '2,6 kg', note: 'Costuma se encaixar de cabeça para baixo, pronto para a saída.' },
  37: { fruit: 'acelga',                   emoji: '🥬', length: '48,6 cm', weight: '2,9 kg', note: 'Termo precoce — ele já pratica respirar e sugar.' },
  38: { fruit: 'alho-poró',                emoji: '🧄', length: '49,8 cm', weight: '3,1 kg', note: 'Pega firme nas mãos. Os órgãos estão prontos.' },
  39: { fruit: 'melancia pequena',         emoji: '🍉', length: '50,7 cm', weight: '3,3 kg', note: 'Termo completo! Pode chegar a qualquer momento.' },
  40: { fruit: 'abóbora',                  emoji: '🎃', length: '51,2 cm', weight: '3,5 kg', note: 'Semana da DPP. O encontro está logo ali.' },
  41: { fruit: 'abóbora grande',           emoji: '🎃', length: '51,7 cm', weight: '3,6 kg', note: 'Passou da data — totalmente normal. Acompanhamento mais de perto.' },
  42: { fruit: 'melancia',                 emoji: '🍉', length: '52,0 cm', weight: '3,7 kg', note: 'Pós-termo. O obstetra provavelmente já conversou sobre indução.' }
};

/* Fallbacks para as 3 primeiras semanas e para além da 42ª. */
const WEEK_FALLBACK_EARLY = { fruit: 'grão de areia', emoji: '✨', length: '—', weight: '—', note: 'Tudo está começando.' };
const WEEK_FALLBACK_LATE  = WEEK_DATA[42];

/* =============================================================================
 * [3] LÓGICA DE DATAS
 * ========================================================================== */

/** Soma (ou subtrai, com valor negativo) dias a uma data, sem mutar o original. */
function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Zera horas/minutos/segundos.
 * Sem isso, "faltam X dias" mudaria conforme a hora do acesso — queremos
 * a diferença em DIAS DE CALENDÁRIO, não em horas corridas.
 */
function atMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Diferença em dias inteiros entre duas datas.
 * Usa Math.round e não Math.floor por causa do horário de verão: um dia
 * pode ter 23 ou 25 horas, e o floor engoliria/duplicaria um dia na virada.
 */
function diffInDays(from, to) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((atMidnight(to) - atMidnight(from)) / MS_PER_DAY);
}

/**
 * NÚCLEO DO CÁLCULO.
 * Recebe a data de hoje e devolve todo o estado gestacional derivado dela.
 */
function computeGestation(today = new Date()) {
  // Quantos dias já se passaram desde a DUM (dia 0 = início da contagem).
  const elapsedDays = diffInDays(START_DATE, today);

  // Quantos dias faltam até a DPP. Negativo = já passou da data.
  const daysLeft = diffInDays(today, CONFIG.dpp);

  // Idade gestacional: dividida em semanas completas + dias soltos.
  // Convenção obstétrica: "8 semanas e 2 dias" = 58 dias decorridos.
  // Clamp em 0 evita números negativos se alguém abrir o site antes da DUM.
  const safeElapsed = Math.max(0, elapsedDays);
  const weeks = Math.floor(safeElapsed / 7);
  const days  = safeElapsed % 7;

  // Semana "corrente" no linguajar médico é a que está em curso (weeks + 1).
  // Ex.: com 8 semanas e 2 dias, você está *na* 9ª semana.
  const currentWeek = weeks + 1;

  // Progresso percentual sobre os 280 dias, limitado a [0, 100].
  const percent = Math.min(100, Math.max(0, (safeElapsed / CONFIG.totalDays) * 100));

  // Trimestres (convenção usual): 1º = sem. 1–13, 2º = 14–27, 3º = 28+.
  let trimester = 1;
  if (weeks >= 27) trimester = 3;
  else if (weeks >= 13) trimester = 2;

  // Dados da semana, com fallback para as pontas da tabela.
  const key = Math.min(42, Math.max(4, weeks));
  const info = weeks < 4 ? WEEK_FALLBACK_EARLY
             : weeks > 42 ? WEEK_FALLBACK_LATE
             : (WEEK_DATA[key] || WEEK_FALLBACK_EARLY);

  return {
    today,
    elapsedDays: safeElapsed,
    daysLeft,
    weeks,
    days,
    currentWeek,
    percent,
    trimester,
    info,
    isBorn: daysLeft < 0,
    weeksLeft: Math.max(0, Math.floor(daysLeft / 7))
  };
}

/* =============================================================================
 * [4] RENDER DA UI
 * ========================================================================== */

const $ = (id) => document.getElementById(id);

const ORDINAL_PT = ['', '1º', '2º', '3º'];

/** Anima um número de 0 até o valor final — dá "peso" ao contador. */
function animateNumber(el, target, duration = 1400) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    // easeOutExpo: rápido no começo, desacelera no fim
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    el.textContent = Math.round(target * eased).toLocaleString('pt-BR');
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderUI(state) {
  // ---- Contador principal ----------------------------------------------
  if (state.isBorn) {
    $('daysLeft').textContent = '0';
    $('heroCaption').textContent = 'a data chegou — bem-vindo(a)! 💛';
  } else {
    animateNumber($('daysLeft'), state.daysLeft);
    $('daysWord').textContent = state.daysLeft === 1 ? 'dia' : 'dias';
  }

  // ---- Micro-métricas ---------------------------------------------------
  $('weeksLeft').textContent  = state.weeksLeft;
  $('trimester').textContent  = ORDINAL_PT[state.trimester];
  $('percentDone').textContent = state.percent.toFixed(0) + '%';

  // ---- Idade gestacional ------------------------------------------------
  const plW = state.weeks === 1 ? 'Semana' : 'Semanas';
  const plD = state.days  === 1 ? 'Dia'    : 'Dias';
  $('gestAge').textContent = `${state.weeks} ${plW} e ${state.days} ${plD}`;
  $('gestAgeSub').textContent =
    `Você está na ${state.currentWeek}ª semana · ${state.elapsedDays} dias de jornada`;

  // ---- Comparativo de tamanho -------------------------------------------
  $('sizeEmoji').textContent = state.info.emoji;
  $('sizeText').textContent  = `Tamanho de ${article(state.info.fruit)} ${state.info.fruit}`;
  $('sizeMetrics').textContent = `≈ ${state.info.length} · ≈ ${state.info.weight}`;
  $('milestone').textContent = state.info.note;

  // ---- Badge da semana --------------------------------------------------
  $('weekBadge').textContent = `Semana ${state.weeks}`;
  $('fallbackWeek').textContent = state.weeks;

  // ---- Barra de progresso -----------------------------------------------
  // Pequeno atraso para o browser pintar a barra em 0% antes de animar.
  const fill = $('progressFill');
  requestAnimationFrame(() => {
    setTimeout(() => { fill.style.width = state.percent.toFixed(2) + '%'; }, 250);
  });
  $('progressLabel').textContent = state.percent.toFixed(1).replace('.', ',') + '%';
  $('progressBarRoot').setAttribute('aria-valuenow', state.percent.toFixed(0));

  // ---- Rodapé -----------------------------------------------------------
  $('todayLabel').textContent = 'Atualizado em ' + state.today.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

/** Artigo indefinido em PT-BR — heurística simples pelo final da palavra. */
function article(word) {
  const w = word.split(' ')[0];
  return /[aã]$/i.test(w) || /^(semente|vagem|couve-flor|alface)$/i.test(w) ? 'uma' : 'um';
}

/* =============================================================================
 * [5] MOTOR 3D — está em baby3d.js (modelo, pele, proporções por semana)
 * ========================================================================== */

/** Idade gestacional em semanas com fração (o bebê muda um pouquinho a cada dia). */
const weekFloat = (st) => st.weeks + st.days / 7;

/* =============================================================================
 * [6] BOOT
 * ========================================================================== */

function boot() {
  // 1. Calcula o estado gestacional a partir da data de HOJE (data de acesso).
  const state = computeGestation(new Date());

  // 2. Pinta a interface.
  renderUI(state);

  // 3. Sobe a cena 3D com a semana corrente.
  const container = document.getElementById('canvas-wrap');
  try {
    Scene3D.init(container, weekFloat(state));
  } catch (err) {
    // WebGL indisponível (navegador antigo, GPU bloqueada): o app segue
    // funcionando como dashboard, só sem o 3D.
    console.error('[3D] WebGL indisponível:', err);
    container.innerHTML =
      '<div class="model-fallback" style="position:static;transform:none;margin:auto">' +
      'Seu navegador não suporta WebGL — o restante do painel segue funcionando.' +
      '</div>';
  }

  // 4. Botões do canvas.
  document.getElementById('btnAuto').addEventListener('click', (e) => {
    const on = Scene3D.toggleAutoRotate();
    e.currentTarget.classList.toggle('pill--active', on);
  });
  document.getElementById('btnReset').addEventListener('click', () => Scene3D.resetView());

  // 5. Some com o loader.
  setTimeout(() => document.getElementById('loader').classList.add('is-done'), 500);

  // 6. Recalcula à meia-noite (ou ao voltar para a aba), para o contador
  //    virar sozinho sem precisar recarregar a página.
  scheduleMidnightRefresh();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderUI(computeGestation(new Date()));
  });
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  setTimeout(() => {
    const s = computeGestation(new Date());
    renderUI(s);
    Scene3D.setWeek?.(weekFloat(s));   // ajusta o bebê para o novo dia
    scheduleMidnightRefresh();
  }, ms);
}

// Garante que o DOM existe antes de rodar (o script é module → já é defer,
// mas isso protege contra injeção tardia do HTML).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* Exposto no console para você testar outras datas rapidamente:
 *   __gest(new Date(2027, 0, 15))   → ver como fica em 15/01/2027
 */
window.__gest = (d) => renderUI(computeGestation(d));
