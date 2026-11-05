/* =========================================================
   1) ESTADO DA APLICAÇÃO
   Tudo o que a página "sabe" fica neste objeto. A tela é só
   um reflexo dele: mudou o estado -> chama render() -> a tela atualiza.
   ========================================================= */
const KEY = 'fenix-metas-v1';   // nome da gaveta no localStorage
let state = { goals: [] };      // lista de metas
let filter = 'Todas';           // filtro de pilar selecionado
let editandoId = null;          // id da meta em edição; null = modo "criando"

/* Cada meta é um objeto. Exemplos:
   Hábito:  { id:'g1a2', title:'Treinar', pilar:'Corpo', kind:'habit', days:['2026-11-01'] }
   Valor:   { id:'g3b4', title:'Correr',  pilar:'Corpo', kind:'count', target:30, unit:'km', current:12 } */

/* Atalho para document.getElementById */
const $ = id => document.getElementById(id);

/* =========================================================
   2) FUNÇÕES AUXILIARES
   ========================================================= */

/* Escapa caracteres especiais do HTML.
   Importante: o texto que a pessoa digita é inserido via innerHTML,
   então sem isto alguém poderia digitar <script> e quebrar a página. */
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

/* Converte uma data em texto 'AAAA-MM-DD'. Subtraímos o fuso horário
   para não "virar o dia" errado por causa do UTC. */
const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/* ago(0) = hoje, ago(1) = ontem, ago(2) = anteontem... */
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const today = () => ago(0);

/* SEQUÊNCIA: conta quantos dias seguidos o hábito foi feito.
   Se hoje ainda não foi marcado, começa a contar de ontem
   (assim a sequência não "zera" durante o dia). */
function streak(g) {
  const feitos = new Set(g.days || []);   // Set: busca rápida de datas
  let n = 0;
  let i = feitos.has(today()) ? 0 : 1;    // começa de hoje ou de ontem
  while (feitos.has(ago(i))) { n++; i++; }
  return n;
}

/* Uma meta com valor está concluída quando o atual alcança o alvo */
function isDone(g) { 
  if (g.kind === 'count') return (g.current || 0) >= g.target;
  if (g.kind === 'once') return !!g.done;
  return false;
}

/* Formata 'AAAA-MM-DD' como 'DD/MM/AAAA' */
const fmt = d => d ? d.split('-').reverse().join('/') : '';

/* Dias entre hoje e uma data. Negativo = Já passou. */
function diasAte(dataIso) {
  const a = new Date(today() + 'T00:00:00');
  const b = new Date(dataIso + 'T00:00:00');

  return Math.round((b - a) / 864e5);   // 864e5 = milissegundos em um dia
}

const atrasada = g => g.kind === 'once' && !g.done && diasAte(g.dueDate) < 0;

/* */
function iniciarEdicao(g) {
  editandoId = g.id;

  // preenche o formulário com os dados atuais
  $('t').value = g.title;
  $('d').value = g.description || '';
  $('p').value = g.pilar;
  $('k').value = g.kind;
  $('k').disabled = true;                     // Não permite trocar o tipo (Quebraria o histórico)
  $('k').dispatchEvent(new Event('change'));  // Mostra os campos extras, se for meta com valor

  if (g.kind === 'count') {
    $('g').value = g.target;
    $('u').value = g.unit || '';
  }

  if (g.kind === 'once') $('dt').value = g.dueDate;

  $('btn-salvar').textContent = 'Salvar alterações';
  $('btn-cancelar').hidden = false;
  $('f').scrollIntoView({ behavior: 'smooth' });
  $('t').focus();
}


function sairDaEdicao() {
  editandoId = null;
  $('f').reset();
  ajustarCampos();   // o reset volta o select ao primeiro tipo; isto reajusta os campos
  $('g').required = false;
  $('k').disabled = false;
  $('btn-salvar').textContent = 'Criar meta';
  $('btn-cancelar').hidden = true;
}

$('btn-cancelar').addEventListener('click', sairDaEdicao);



/* Confere se é um texto no formato AAAA-MM-DD e se vira uma data válida */
const ehData = s =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(new Date(s + 'T00:00:00'));

/* Devolve uma meta limpa, ou null se não for aproveitável */
function limparMeta(g) {
  if (!g || typeof g !== 'object') return null;
  if (!['Corpo', 'Mente', 'Disciplina'].includes(g.pilar)) return null;

  const title = String(g.title || '').trim().slice(0, 80);
  const id = String(g.id || '').replace(/[^\w-]/g, '');   // só letras, números, _ e -
  if (!title || !id) return null;

  // Campos comuns a todos os tipos
  const base = {
    id,
    title,
    description: String(g.description || '').slice(0, 300),
    pilar: g.pilar,
    kind: g.kind,
    created: ehData(g.created) ? g.created : today()
  };

  if (g.kind === 'habit') {
    const days = Array.isArray(g.days) ? g.days.filter(ehData) : [];
    return { ...base, days: [...new Set(days)] };   // Set remove datas repetidas
  }

  if (g.kind === 'count') {
    const target = Number(g.target);
    const current = Number(g.current);
    if (!Number.isFinite(target) || target <= 0) return null;
    return {
      ...base,
      target,
      unit: String(g.unit || '').slice(0, 12),
      current: Number.isFinite(current) ? Math.max(0, current) : 0
    };
  }

  if (g.kind === 'once') {
    if (!ehData(g.dueDate)) return null;
    const done = g.done === true;
    return { ...base, dueDate: g.dueDate, done, doneAt: done && ehData(g.doneAt) ? g.doneAt : null };
  }

  return null;   // tipo desconhecido: descarta
}

/* =========================================================
   3) SALVAR
   ========================================================= */
function save() {
  state.updated = Date.now();
  try {
    // localStorage só guarda texto, por isso JSON.stringify
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    $('note').textContent = 'Não foi possível salvar neste navegador.';
  }
  render();  // sempre redesenha depois de mudar o estado
}

/* =========================================================
   4) RENDER: desenha a tela a partir do estado
   ========================================================= */
function render() {
  const gs = state.goals || [];
  const t = today();

  /* Resumo do dia */
  const habitos = gs.filter(g => g.kind === 'habit');
  const feitosHoje = habitos.filter(g => (g.days || []).includes(t)).length;
  $('today').textContent = gs.length
    ? (habitos.length
        ? `Hoje: ${feitosHoje} de ${habitos.length} hábitos feitos.`
        : `${gs.filter(isDone).length} de ${gs.length} metas concluídas.`)
    : 'Crie sua primeira meta para começar.';

  /* Abas de filtro. O data-p guarda o nome do pilar para lermos no clique */
  const pilares = ['Todas', 'Corpo', 'Mente', 'Disciplina'];
  $('tabs').innerHTML = pilares.map(p =>
    `<button type="button" class="tab" aria-pressed="${p === filter}" data-p="${p}">${p}</button>`
  ).join('');

  /* Aplica o filtro */
  const visiveis = gs.filter(g => filter === 'Todas' || g.pilar === filter);

  /* Mensagem quando não há nada para mostrar */
  if (!visiveis.length) {
    $('list').innerHTML = `<li class="empty">${
      gs.length ? 'Nenhuma meta neste pilar.' : 'Nenhuma meta ainda. Preencha o formulário acima.'
    }</li>`;
    return;
  }

  /* Monta o HTML de cada meta. map() transforma cada meta em texto HTML;
     join('') junta tudo em um bloco só. */
  $('list').innerHTML = visiveis.map(g => {
    const desc = g.description || '';

    /* ---------- HÁBITO DIÁRIO ---------- */
    if (g.kind === 'habit') {
      const feitoHoje = (g.days || []).includes(t);
      const seq = streak(g);
      // Últimos 7 dias, do mais antigo (6 dias atrás) ao mais novo (hoje)
      const quadrados = [6, 5, 4, 3, 2, 1, 0].map(n =>
        `<b class="${(g.days || []).includes(ago(n)) ? 'on' : ''}" title="${ago(n)}"></b>`
      ).join('');

      return `<li class="goal" data-id="${g.id}">
        <div>
          <h2>${esc(g.title)}</h2>
          <p>${esc(desc)}</p>
          <div class="meta">${g.pilar} · Sequência: ${seq} ${seq === 1 ? 'dia' : 'dias'}</div>
        </div>
        <div class="act">
          <button class="btn ${feitoHoje ? 'on' : ''}" data-a="check" aria-pressed="${feitoHoje}">
            ${feitoHoje ? 'Feito hoje' : 'Marcar hoje'}
          </button>
          <button class="btn x" data-a="edit" aria-label="Editar ${esc(g.title)}">Editar</button>
          <button class="btn x" data-a="del" aria-label="Excluir ${esc(g.title)}">Excluir</button>
        </div>
        <div class="dots" aria-label="Últimos 7 dias">${quadrados}</div>
      </li>`;
    }

    if (g.kind === 'once') {
      const dias = diasAte(g.dueDate);
      let status;
      if (g.done)           status = 'Concluída em ' + fmt(g.doneAt);
      else if (dias < 0)    status = 'Atrasada há ' + (-dias) + (dias === -1 ? ' dia' : ' dias');
      else if (dias === 0)  status = 'Vence hoje';
      else                  status = 'Faltam ' + dias + (dias === 1 ? ' dia' : ' dias');
    
      return `<li class="goal ${g.done ? 'done' : ''} ${atrasada(g) ? 'late' : ''}" data-id="${g.id}">
        <div>
          <h2>${esc(g.title)}</h2>
          <p> ${esc(desc)}</p>
          <div class="meta">${g.pilar} · Prazo ${fmt(g.dueDate)} · ${status}</div>
        </div>
        <div class="act">
          <button class="btn ${g.done ? 'on' : ''}" data-a="complete" aria-pressed="${g.done}">
            ${g.done ? 'Concluída' : 'Concluir'}
          </button>
          <button class="btn x" data-a="edit">Editar</button>
          <button class="btn x" data-a="del">Excluir</button>
        </div>
      </li>`;
    }
    
    
    /* ---------- META COM VALOR ---------- */
    const atual = g.current || 0;
    const pct = Math.min(100, Math.round(atual / g.target * 100)); // nunca passa de 100%

    return `<li class="goal ${isDone(g) ? 'done' : ''}" data-id="${g.id}">
      <div>
        <h2>${esc(g.title)}</h2>
        <p>${esc(desc)}</p>
        <div class="meta">${g.pilar} · ${atual} de ${g.target} ${esc(g.unit || '')} (${pct}%)</div>
      </div>
      <div class="act">
        <button class="btn x" data-a="edit" aria-label="Editar ${esc(g.title)}">Editar</button>
        <button class="btn x" data-a="del" aria-label="Excluir ${esc(g.title)}">Excluir</button>
      </div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <i style="width:${pct}%"></i>
      </div>
      <div class="add">
        <input type="number" step="any" placeholder="+ valor" aria-label="Valor a somar" data-in>
        <button class="btn" data-a="add">Somar</button>
        <button class="btn" data-a="sub">Tirar</button>
      </div>
    </li>`;
  }).join('');
}

/* =========================================================
   5) EVENTOS (reações às ações da pessoa)
   ========================================================= */

/* Mostra ou esconde os campos "Valor alvo" e "Unidade" conforme o tipo */
function ajustarCampos() {
  const k = $('k').value;
  $('tw').hidden = k !== 'count';
  $('uw').hidden = k !== 'count';
  $('dw').hidden = k !== 'once';
  $('g').required = k === 'count';
  $('dt').required = k === 'once';
}
$('k').addEventListener('change', ajustarCampos);

/* CRIAR META: acontece quando o formulário é enviado */
$('f').addEventListener('submit', e => {
  e.preventDefault();   // impede o navegador de recarregar a página

  if (editandoId) {
    const g = state.goals.find(x => x.id === editandoId);
    if (g) {
      const titulo = $('t').value.trim();
      if (!titulo) return;

      if (g.kind === 'count') {
        const alvo = Number($('g').value);
        if (!(alvo > 0)) return;

        g.target = alvo;
        g.unit = $('u').value.trim();
      }

      if (g.kind === 'once') {
        if (!$('dt').value) return;
        g.dueDate = $('dt').value;
      }

      g.title = titulo;
      g.description = $('d').value.trim();
      g.pilar = $('p').value;
      if (filter !== 'Todas' && filter !== g.pilar) filter = g.pilar;
      // id, days, current e created NÃO são tocados: o histórico fica preservado
    }
    sairDaEdicao();
    save();
    return;   // impede de seguir para o código de criar uma meta nova
  }

  const kind = $('k').value;
  const meta = {
    id: 'g' + Date.now().toString(36),  // id único baseado no horário
    title: $('t').value.trim(),         // trim() remove espaços das pontas
    description: $('d').value.trim(), 
    pilar: $('p').value,
    kind,
    created: today()
  };
  if (!meta.title) return;

  if (kind === 'count') {
    meta.target = Number($('g').value);
    meta.unit = $('u').value.trim();
    meta.current = 0;
    if (!(meta.target > 0)) return;     // alvo precisa ser positivo
  } else if (kind === 'once') {
    meta.dueDate = $('dt').value;
    if (!meta.dueDate) return;
    meta.done = false;
    meta.doneAt = null;
  } else {
    meta.days = [];                      // lista de datas em que foi feito
  }

  state.goals = [meta, ...(state.goals || [])];   // coloca a nova no topo
  if (filter !== 'Todas' && filter !== meta.pilar) filter = meta.pilar;

  // Limpa o formulário e esconde os campos extras
  $('f').reset();
  ajustarCampos();
  $('g').required = false;
  save();
});

/* TROCAR FILTRO: um clique em qualquer aba */
$('tabs').addEventListener('click', e => {
  const botao = e.target.closest('[data-p]');
  if (botao) { filter = botao.dataset.p; render(); }
});

/* AÇÕES NA LISTA (marcar, somar, tirar, excluir).
   DELEGAÇÃO DE EVENTOS: em vez de um listener por botão (que seriam
   recriados a cada render), há um só no <ul>. O clique "sobe" até ele
   e descobrimos qual botão foi usado pelo atributo data-a. */
$('list').addEventListener('click', e => {
  const botao = e.target.closest('[data-a]');
  if (!botao) return;

  const li = botao.closest('li');
  const g = state.goals.find(x => x.id === li.dataset.id);  // acha a meta pelo id

  if (!g) return;

  const acao = botao.dataset.a;
  const t = today();

  if (acao === 'edit') {
    iniciarEdicao(g); 
    return;
  } else if (acao === 'check') {
    // Liga/desliga o dia de hoje
    g.days = g.days || [];
    const i = g.days.indexOf(t);
    if (i >= 0) g.days.splice(i, 1);   // já estava marcado: remove
    else g.days.push(t);               // não estava: adiciona
  } else if (acao === 'complete') {
    g.done = !g.done;                   // alterna
    g.doneAt = g.done ? today() : null; // guarda quando concluiu; desfazer apaga
  } else if (acao === 'del') {
    if (!confirm('Excluir a meta "' + g.title + '"?')) {return;};
    if (editandoId === g.id) sairDaEdicao();
    state.goals = state.goals.filter(x => x !== g);   // mantém todas, menos esta
  } else if (acao === 'add' || acao === 'sub') {
    // 'add' ou 'sub': soma ou subtrai o valor digitado
    const v = Number(li.querySelector('[data-in]').value);
    if (!v) return;
    g.current = Math.max(0, (g.current || 0) + (acao === 'add' ? v : -v)); // nunca abaixo de 0
  } else {
    return;
  }
  save();
});

/* =========================================================
   6) BACKUP: EXPORTAR E IMPORTAR
   Exportar gera um arquivo .json com todas as metas. Se os dados do
   navegador forem apagados, é só importar o arquivo de volta.
   ========================================================= */

/* EXPORTAR: transforma o estado em um arquivo e dispara o download */
function exportar() {
  // JSON.stringify(objeto, null, 2): texto formatado e legível (2 espaços)
  const texto = JSON.stringify(state, null, 2);

  // Blob = "arquivo em memória". URL.createObjectURL cria um link temporário para ele
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Truque clássico: cria um <a download> invisível e clica nele
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fenix-metas-' + today() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);   // libera a memória

  $('note').textContent = 'Backup exportado. Guarde o arquivo em um lugar seguro.';
}

/* IMPORTAR: lê o arquivo escolhido, valida e MESCLA com as metas atuais.
   Mesclar (em vez de substituir) evita perder metas criadas depois do backup. */
function importar(arquivo) {
  const leitor = new FileReader();

  leitor.onload = () => {
    try {
      const dados = JSON.parse(leitor.result);   // de texto para objeto (pode dar erro)
      if (!dados || !Array.isArray(dados.goals)) throw new Error('formato inválido');

      // VALIDAÇÃO: nunca confie cegamente em um arquivo de fora.
      // Mantemos só metas que tenham a forma esperada.
      const validas = dados.goals.map(limparMeta).filter(Boolean);
      const descartadas = dados.goals.length - validas.length;

      // Só adiciona metas cujo id ainda não existe
      const idsAtuais = new Set(state.goals.map(g => g.id));
      const novas = validas.filter(g => {
        if (idsAtuais.has(g.id)) return false;
        idsAtuais.add(g.id);
        return true;
      });

      state.goals = [...novas, ...state.goals];
      save();
      $('note').textContent = novas.length + ' meta(s) importada(s)' + (descartadas ? ' (' + descartadas + ' ignorada(s) por dados inválidos).' : '.');
    } catch (e) {
      $('note').textContent = 'Arquivo inválido. Use um backup exportado por este app.';
    }
  };

  leitor.readAsText(arquivo);   // lê o conteúdo do arquivo como texto
}

$('exp').addEventListener('click', exportar);
$('imp').addEventListener('click', () => $('arq').click());   // abre o seletor de arquivos
$('arq').addEventListener('change', e => {
  const arquivo = e.target.files[0];
  if (arquivo) importar(arquivo);
  e.target.value = '';   // permite escolher o mesmo arquivo de novo depois
});

/* =========================================================
   7) PWA
   ========================================================= */

/* Pede ao navegador para NÃO apagar os dados do app quando faltar espaço.
   (O navegador pode aceitar ou recusar; não é garantido.) */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

/* Registra o service worker (só funciona em HTTPS ou em localhost) */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

/* =========================================================
   8) INÍCIO: carrega o que estava salvo e desenha a tela
   ========================================================= */
try {
  const salvo = localStorage.getItem(KEY);
  if (salvo) state = JSON.parse(salvo);   // JSON.parse: de texto de volta para objeto
} catch (e) { /* se der erro, começa vazio */ }

if (!state || !Array.isArray(state.goals)) state = { goals: [] };  // proteção contra dados estranhos
render();
