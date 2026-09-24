// Acquire VS Code API (or mock if running in standalone browser test)
const isStandalone = typeof acquireVsCodeApi !== 'function';
const vscode = !isStandalone ? acquireVsCodeApi() : {
  postMessage: (msg) => {
    if (msg.type === 'ready') {
      setTimeout(() => {
        window.postMessage({
          type: 'init',
          tabs: null,
          packages: ['react', 'lodash', 'axios', 'express', 'vue', '@angular/core', 'react-native'],
          nodeVersion: 'v24.15.0'
        }, '*');
      }, 10);
    } else if (msg.type === 'execute') {
      setTimeout(() => {
        const outputs = [];
        const logs = [];
        const lines = msg.code.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const lNum = i + 1;
          const tr = lines[i].trim();
          if (!tr || tr.startsWith('//') || tr.startsWith('/*') || tr.startsWith('*') || tr.startsWith('const ') || tr.startsWith('let ') || tr.startsWith('var ') || tr.startsWith('function ') || tr.endsWith('{') || tr === '}') continue;
          
          // Fix for console.log/info/warn/error showing undefined!
          const consoleMatch = tr.match(/^console\.(log|info|warn|error|table)\s*\(([\s\S]*)\);?$/);
          if (consoleMatch) {
            const fn = consoleMatch[1];
            const inside = consoleMatch[2];
            try {
              let evalVal;
              if (!inside.trim()) {
                evalVal = [''];
              } else {
                evalVal = eval(`[${inside}]`);
              }
              const displayStr = evalVal.map(v => {
                if (typeof v === 'string') return `'${v}'`;
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
              }).join(' ');

              outputs.push({
                line: lNum,
                display: displayStr,
                type: 'string'
              });
              logs.push({ level: fn, text: displayStr });
              continue;
            } catch (e) {
              // fallback
            }
          }

          try {
            let expr = tr.replace(/;$/, '');
            if (expr.startsWith('await ')) expr = expr.replace(/^await /, '');
            const val = eval(expr);
            let displayVal;
            let valType = typeof val;

            if (val === undefined) displayVal = 'undefined';
            else if (val === null) displayVal = 'null';
            else if (Array.isArray(val)) {
              displayVal = JSON.stringify(val);
              valType = 'array';
            } else if (typeof val === 'object') {
              displayVal = JSON.stringify(val);
              valType = 'object';
            } else if (typeof val === 'string') {
              displayVal = `'${val}'`;
            } else {
              displayVal = String(val);
            }

            outputs.push({
              line: lNum,
              display: displayVal,
              type: valType
            });
          } catch (e) {}
        }

        window.postMessage({
          type: 'results',
          tabId: msg.tabId,
          outputs,
          logs,
          timeMs: 2,
          error: null
        }, '*');
      }, 20);
    }
  },
  setState: () => {},
  getState: () => null
};

// ==========================================================================
// Suggestion / Autocomplete Catalog (Ctrl+Space - Sem IA, Snippets e Keywords)
// ==========================================================================
const AUTOCOMPLETE_ITEMS = [
  // Snippets
  { label: 'clg', insert: "console.log($1);", type: 'snippet', desc: "console.log()" },
  { label: 'cerror', insert: "console.error($1);", type: 'snippet', desc: "console.error()" },
  { label: 'cwarn', insert: "console.warn($1);", type: 'snippet', desc: "console.warn()" },
  { label: 'ush', insert: "const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initial});", type: 'snippet', desc: "React useState" },
  { label: 'ueh', insert: "useEffect(() => {\n  $1\n}, [${2:deps}]);", type: 'snippet', desc: "React useEffect" },
  { label: 'um', insert: "const ${1:memoValue} = useMemo(() => $2, [${3:deps}]);", type: 'snippet', desc: "React useMemo" },
  { label: 'ucb', insert: "const ${1:cb} = useCallback(() => {\n  $2\n}, [${3:deps}]);", type: 'snippet', desc: "React useCallback" },
  { label: 'rfc', insert: "export const ${1:MyComponent} = () => {\n  return (\n    <div>\n      $0\n    </div>\n  );\n};", type: 'snippet', desc: "React Component" },
  { label: 'rnfc', insert: "export const ${1:MyScreen} = () => {\n  return (\n    <View style={styles.container}>\n      <Text>$0</Text>\n    </View>\n  );\n};", type: 'snippet', desc: "React Native Screen" },
  { label: 'rnstyle', insert: "const styles = StyleSheet.create({\n  container: {\n    flex: 1,\n    justifyContent: 'center',\n    alignItems: 'center',\n  },\n});", type: 'snippet', desc: "React Native StyleSheet" },
  { label: 'vbase', insert: "<script setup lang=\"ts\">\nimport { ref } from 'vue';\nconst count = ref(0);\n</script>\n\n<template>\n  <div>\n    <h1>Vue 3 SFC</h1>\n    $0\n  </div>\n</template>", type: 'snippet', desc: "Vue 3 SFC Setup" },
  { label: 'vref', insert: "const ${1:count} = ref(${2:0});", type: 'snippet', desc: "Vue 3 ref()" },
  { label: 'vcomputed', insert: "const ${1:double} = computed(() => ${2:count}.value * 2);", type: 'snippet', desc: "Vue 3 computed()" },
  { label: 'ng-component', insert: "@Component({\n  selector: 'app-${1:example}',\n  standalone: true,\n  template: `<div>{{ title() }}</div>`\n})\nexport class ${2:Example}Component {\n  title = signal('${2:Example}');\n}", type: 'snippet', desc: "Angular Component" },
  { label: 'ng-signal', insert: "const ${1:count} = signal(${2:0});", type: 'snippet', desc: "Angular Signal" },
  { label: 'fetch', insert: "const res = await fetch('${1:https://api.exemplo.com}');\nconst data = await res.json();", type: 'snippet', desc: "Fetch API Async" },
  { label: 'promise', insert: "new Promise((resolve, reject) => {\n  $1\n});", type: 'snippet', desc: "New Promise" },
  { label: 'afn', insert: "async function ${1:name}(${2:params}) {\n  $0\n}", type: 'snippet', desc: "Async Function" },
  { label: 'arrow', insert: "const ${1:fn} = (${2:params}) => {\n  $0\n};", type: 'snippet', desc: "Arrow Function" },
  { label: 'try', insert: "try {\n  $1\n} catch (error) {\n  console.error(error);\n}", type: 'snippet', desc: "Try / Catch" },
  { label: 'forof', insert: "for (const ${1:item} of ${2:items}) {\n  $0\n}", type: 'snippet', desc: "For...of loop" },

  // JavaScript & TypeScript Keywords
  { label: 'const', insert: 'const ', type: 'keyword', desc: 'Declara constante' },
  { label: 'let', insert: 'let ', type: 'keyword', desc: 'Declara variável' },
  { label: 'function', insert: 'function ', type: 'keyword', desc: 'Declara função' },
  { label: 'async', insert: 'async ', type: 'keyword', desc: 'Função assíncrona' },
  { label: 'await', insert: 'await ', type: 'keyword', desc: 'Aguardar Promise' },
  { label: 'import', insert: "import $1 from '$2';", type: 'keyword', desc: 'Importar módulo' },
  { label: 'export', insert: 'export ', type: 'keyword', desc: 'Exportar declaração' },
  { label: 'return', insert: 'return ', type: 'keyword', desc: 'Retorno de função' },
  { label: 'interface', insert: 'interface ${1:Name} {\n  $0\n}', type: 'keyword', desc: 'Interface TypeScript' },
  { label: 'type', insert: 'type ${1:Name} = $2;', type: 'keyword', desc: 'Type alias TypeScript' },
  { label: 'class', insert: 'class ${1:Name} {\n  constructor($2) {\n    $0\n  }\n}', type: 'keyword', desc: 'Classe ES6' },

  // Globals & Node.js
  { label: 'console', insert: 'console.', type: 'global', desc: 'Objeto Console' },
  { label: 'process', insert: 'process', type: 'global', desc: 'Processo Node.js' },
  { label: 'require', insert: "require('$1')", type: 'global', desc: 'Importar pacote CommonJS' },
  { label: 'Buffer', insert: 'Buffer', type: 'global', desc: 'Buffer binário Node.js' },
  { label: 'Math', insert: 'Math.', type: 'global', desc: 'Funções matemáticas' },
  { label: 'JSON', insert: 'JSON.', type: 'global', desc: 'JSON parser/stringifier' },
  { label: 'Promise', insert: 'Promise.', type: 'global', desc: 'Objeto Promise' },
  { label: 'setTimeout', insert: 'setTimeout(() => {\n  $1\n}, ${2:1000});', type: 'global', desc: 'Temporizador' },

  // Methods
  { label: 'map', insert: 'map(${1:item} => $2)', type: 'method', desc: 'Transformar array' },
  { label: 'filter', insert: 'filter(${1:item} => $2)', type: 'method', desc: 'Filtrar array' },
  { label: 'reduce', insert: 'reduce((${1:acc}, ${2:curr}) => $3, ${4:0})', type: 'method', desc: 'Reduzir array' },
  { label: 'forEach', insert: 'forEach(${1:item} => {\n  $2\n})', type: 'method', desc: 'Iterar array' },
  { label: 'find', insert: 'find(${1:item} => $2)', type: 'method', desc: 'Encontrar elemento' },
  { label: 'includes', insert: 'includes($1)', type: 'method', desc: 'Verificar inclusão' }
];

// ==========================================================================
// Templates Catalog
// ==========================================================================
const TEMPLATES = {
  'runjs-welcome': `/*
 * Bem-vindo ao RunJS ⚡ (JS Studio)
 * Tema Dracula • Suporte a TypeScript & Node.js
 */

const helloWorld = () => 'Olá, Mundo! 🌍';

helloWorld();

// Saídas imediatas no painel direito 👉

Math.pow(5, 5);

console.log('Testando console.log sem undefined! 🚀');

await Promise.resolve('Aguarde de nível superior 🤩');

[1, 2, 3, 4].map(num => num * 2);

/*
 * Pressione Ctrl + Space para snippets e autocomplete!
 * Suporte a React, React Native, Vue 3, Angular e Node.js.
 */`,

  'typescript-types': `// Exemplo TypeScript com Interfaces e Generics
interface Usuario {
  id: number;
  nome: string;
  papel: 'admin' | 'dev' | 'designer';
}

function filtrarUsuarios<T extends { papel: string }>(lista: T[], papel: string): T[] {
  return lista.filter(item => item.papel === papel);
}

const time: Usuario[] = [
  { id: 1, nome: 'Eduardo', papel: 'dev' },
  { id: 2, nome: 'Ana', papel: 'designer' },
  { id: 3, nome: 'Carlos', papel: 'dev' }
];

filtrarUsuarios(time, 'dev');

const estatisticas = {
  total: time.length,
  devs: filtrarUsuarios(time, 'dev').length
};

console.log('Estatísticas calculadas:', estatisticas);`,

  'node-system': `// Acesso ao Node.js Standard Library
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const sistemaInfo = {
  plataforma: os.platform(),
  arquitetura: os.arch(),
  cpus: os.cpus().length,
  memoriaLivreMB: Math.round(os.freemem() / 1024 / 1024)
};

console.log('Status do Sistema:', sistemaInfo);

const hash = crypto.createHash('sha256').update('DraculaJS').digest('hex');
hash;`,

  'react-preview': `// Simulação de Componente e Hooks React
function useState(initial) {
  let val = initial;
  const setVal = (newVal) => { val = newVal; };
  return [val, setVal];
}

const [contador, setContador] = useState(42);

console.log('Valor do estado inicial:', contador);

// Simulação de Componente React
const MeuComponente = ({ titulo }) => ({
  tipo: 'div',
  props: { className: 'card-dracula' },
  filhos: [titulo, contador]
});

MeuComponente({ titulo: 'React Native & Web' });`,

  'vue-reactivity': `// Simulação da Reatividade Vue 3 (ref / computed)
function ref(init) {
  let val = init;
  return {
    get value() { return val; },
    set value(v) { val = v; }
  };
}

function computed(fn) {
  return { get value() { return fn(); } };
}

const preco = ref(150);
const precoComDesconto = computed(() => preco.value * 0.9);

console.log('Preço normal:', preco.value);
console.log('Preço com desconto:', precoComDesconto.value);`,

  'async-fetch': `// Top-Level Await e Operações Assíncronas
async function carregarProdutos() {
  await new Promise(r => setTimeout(r, 60));
  return [
    { id: 1, item: 'JS Studio IDE', preco: 0, status: 'Open Source' },
    { id: 2, item: 'Dracula Theme', preco: 0, status: 'Ativo' }
  ];
}

const dados = await carregarProdutos();
console.log('Produtos carregados com sucesso:', dados);`
};

// ==========================================================================
// Application State
// ==========================================================================
let state = {
  tabs: [
    {
      id: 'tab-1',
      title: 'Bem-vindo ao RunJS',
      code: TEMPLATES['runjs-welcome'],
      mode: 'typescript'
    }
  ],
  activeTabId: 'tab-1',
  autoRun: true,
  packages: []
};

// Autocomplete State
let autocompleteState = {
  active: false,
  items: [],
  selectedIndex: 0,
  prefix: '',
  cursorStart: 0
};

// DOM Elements
const tabsContainer = document.getElementById('tabsContainer');
const btnNewTab = document.getElementById('btnNewTab');
const codeEditor = document.getElementById('codeEditor');
const lineNumbers = document.getElementById('lineNumbers');
const resultsContainer = document.getElementById('resultsContainer');
const resultsScroll = document.getElementById('resultsScroll');
const execTimeBadge = document.getElementById('execTimeBadge');
const btnRun = document.getElementById('btnRun');
const toggleAutoRun = document.getElementById('toggleAutoRun');
const envMode = document.getElementById('envMode');
const btnClear = document.getElementById('btnClear');
const btnTemplates = document.getElementById('btnTemplates');
const templatesMenu = document.getElementById('templatesMenu');
const btnPackages = document.getElementById('btnPackages');
const packagesModal = document.getElementById('packagesModal');
const closePackagesModal = document.getElementById('closePackagesModal');
const packageList = document.getElementById('packageList');
const splitGutter = document.getElementById('splitGutter');
const workspaceSplit = document.getElementById('workspaceSplit');
const consoleToggle = document.getElementById('consoleToggle');
const consoleContent = document.getElementById('consoleContent');
const consoleCount = document.getElementById('consoleCount');
const consoleClear = document.getElementById('consoleClear');
const statusNodeVersion = document.getElementById('statusNodeVersion');
const statusLineCol = document.getElementById('statusLineCol');
const statusCharCount = document.getElementById('statusCharCount');
const suggestionWidget = document.getElementById('suggestionWidget');
const suggestionList = document.getElementById('suggestionList');

let autoRunTimer = null;

// ==========================================================================
// Initialization & Message Handling
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  renderTabs();
  loadCurrentTab();
  vscode.postMessage({ type: 'ready' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'init': {
      if (message.tabs && message.tabs.length > 0) {
        state.tabs = message.tabs;
        state.activeTabId = state.tabs[0].id;
        renderTabs();
        loadCurrentTab();
      }
      if (message.packages) {
        state.packages = message.packages;
      }
      if (message.nodeVersion) {
        statusNodeVersion.textContent = `Node.js ${message.nodeVersion}`;
      }
      triggerExecution();
      break;
    }

    case 'createTab': {
      createNewTab();
      break;
    }

    case 'results': {
      if (message.tabId === state.activeTabId) {
        renderResults(message.outputs, message.logs, message.timeMs, message.error);
      }
      break;
    }

    case 'packagesList': {
      state.packages = message.packages;
      renderPackagesList();
      break;
    }
  }
});

// ==========================================================================
// Tab Management
// ==========================================================================
function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
}

function renderTabs() {
  tabsContainer.innerHTML = '';
  state.tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-item ${tab.id === state.activeTabId ? 'active' : ''}`;
    tabEl.innerHTML = `
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      ${state.tabs.length > 1 ? '<span class="tab-close" title="Fechar aba">×</span>' : ''}
    `;

    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeTab(tab.id);
      } else {
        switchTab(tab.id);
      }
    });

    tabEl.addEventListener('dblclick', () => {
      const newTitle = prompt('Novo nome para a aba:', tab.title);
      if (newTitle && newTitle.trim()) {
        tab.title = newTitle.trim();
        renderTabs();
        saveState();
      }
    });

    tabsContainer.appendChild(tabEl);
  });
}

function switchTab(tabId) {
  const current = getActiveTab();
  if (current) {
    current.code = codeEditor.value;
    current.mode = envMode.value;
  }

  state.activeTabId = tabId;
  renderTabs();
  loadCurrentTab();
  triggerExecution();
}

function createNewTab(title = null, initialCode = '') {
  const newId = 'tab-' + Date.now();
  const count = state.tabs.length + 1;
  const newTab = {
    id: newId,
    title: title || `Aba ${count}`,
    code: initialCode || '// Nova aba de código\n\n',
    mode: envMode.value || 'typescript'
  };
  state.tabs.push(newTab);
  state.activeTabId = newId;
  renderTabs();
  loadCurrentTab();
  saveState();
  codeEditor.focus();
}

function closeTab(tabId) {
  if (state.tabs.length <= 1) return;
  const idx = state.tabs.findIndex(t => t.id === tabId);
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  renderTabs();
  loadCurrentTab();
  saveState();
  triggerExecution();
}

function loadCurrentTab() {
  const active = getActiveTab();
  if (!active) return;
  codeEditor.value = active.code || '';
  envMode.value = active.mode || 'typescript';
  updateLineNumbers();
  updateStatusBar();
}

function saveState() {
  vscode.postMessage({
    type: 'saveTabs',
    tabs: state.tabs
  });
}

// ==========================================================================
// Code Execution & Real-time Trigger
// ==========================================================================
function triggerExecution() {
  const active = getActiveTab();
  if (!active) return;
  active.code = codeEditor.value;
  active.mode = envMode.value;

  vscode.postMessage({
    type: 'execute',
    tabId: active.id,
    code: active.code,
    mode: active.mode
  });
}

function queueAutoRun() {
  if (!state.autoRun) return;
  if (autoRunTimer) clearTimeout(autoRunTimer);
  autoRunTimer = setTimeout(() => {
    triggerExecution();
    saveState();
  }, 250);
}

// ==========================================================================
// Results Rendering (RunJS Dual-Pane Aligned Output)
// ==========================================================================
function renderResults(outputs, logs, timeMs, error) {
  execTimeBadge.textContent = `⚡ ${timeMs}ms`;
  resultsContainer.innerHTML = '';

  const totalLines = codeEditor.value.split('\n').length;
  const outputsByLine = {};

  if (outputs && Array.isArray(outputs)) {
    outputs.forEach(out => {
      outputsByLine[out.line] = out;
    });
  }

  for (let l = 1; l <= totalLines; l++) {
    const row = document.createElement('div');
    row.className = 'result-line-row';

    const item = outputsByLine[l];
    if (item && item.display !== undefined) {
      const valSpan = document.createElement('span');
      valSpan.className = `result-value type-${item.type || 'default'}`;
      valSpan.textContent = item.display;
      valSpan.title = item.display;

      const tagSpan = document.createElement('span');
      tagSpan.className = 'result-line-tag';
      tagSpan.textContent = `L${l}`;

      row.appendChild(valSpan);
      row.appendChild(tagSpan);
    } else {
      row.innerHTML = '&nbsp;';
    }

    resultsContainer.appendChild(row);
  }

  if (error) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'error-banner';
    errorBanner.innerHTML = `
      <div class="error-title">❌ Erro ${error.line ? 'na Linha ' + error.line : ''}</div>
      <div class="error-msg">${escapeHtml(error.message)}</div>
    `;
    resultsContainer.appendChild(errorBanner);
  }

  renderConsoleLogs(logs);
}

function renderConsoleLogs(logs) {
  consoleContent.innerHTML = '';
  if (!logs || logs.length === 0) {
    consoleCount.textContent = '0';
    return;
  }
  consoleCount.textContent = String(logs.length);

  logs.forEach(log => {
    const entry = document.createElement('div');
    entry.className = `console-entry ${log.level}`;
    entry.textContent = `[${log.level.toUpperCase()}] ${log.text}`;
    consoleContent.appendChild(entry);
  });
  consoleContent.scrollTop = consoleContent.scrollHeight;
}

// ==========================================================================
// IntelliSense / Autocomplete Logic (Ctrl+Space)
// ==========================================================================
function getWordBeforeCursor() {
  const pos = codeEditor.selectionStart;
  const text = codeEditor.value.slice(0, pos);
  const match = text.match(/([a-zA-Z0-9_$]+)$/);
  return {
    word: match ? match[1] : '',
    start: match ? pos - match[1].length : pos,
    end: pos
  };
}

function showAutocomplete(explicit = false) {
  const wordInfo = getWordBeforeCursor();
  const query = wordInfo.word.toLowerCase();

  let matches = AUTOCOMPLETE_ITEMS;
  if (query.length > 0) {
    matches = AUTOCOMPLETE_ITEMS.filter(item => item.label.toLowerCase().includes(query));
  } else if (!explicit) {
    hideAutocomplete();
    return;
  }

  if (matches.length === 0) {
    hideAutocomplete();
    return;
  }

  autocompleteState.active = true;
  autocompleteState.items = matches;
  autocompleteState.selectedIndex = 0;
  autocompleteState.prefix = wordInfo.word;
  autocompleteState.cursorStart = wordInfo.start;

  renderAutocompleteList();

  // Position suggestion widget near cursor
  const linesBefore = codeEditor.value.slice(0, wordInfo.start).split('\n');
  const lineIdx = linesBefore.length - 1;
  const colIdx = linesBefore[lineIdx].length;

  const topPos = Math.min(codeEditor.clientHeight - 200, (lineIdx + 1) * 22 - codeEditor.scrollTop + 14);
  const leftPos = Math.min(codeEditor.clientWidth - 300, Math.max(16, colIdx * 8.2 - codeEditor.scrollLeft + 16));

  suggestionWidget.style.top = `${topPos}px`;
  suggestionWidget.style.left = `${leftPos}px`;
  suggestionWidget.classList.add('show');
}

function hideAutocomplete() {
  autocompleteState.active = false;
  suggestionWidget.classList.remove('show');
}

function renderAutocompleteList() {
  suggestionList.innerHTML = '';
  autocompleteState.items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = `suggestion-item ${idx === autocompleteState.selectedIndex ? 'selected' : ''}`;
    el.innerHTML = `
      <span class="suggestion-icon ${item.type}">${item.type[0].toUpperCase()}</span>
      <span class="suggestion-label">${escapeHtml(item.label)}</span>
      <span class="suggestion-desc">${escapeHtml(item.desc || '')}</span>
    `;

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applySuggestion(item);
    });

    suggestionList.appendChild(el);
  });

  const selectedEl = suggestionList.children[autocompleteState.selectedIndex];
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

function applySuggestion(item) {
  const start = autocompleteState.cursorStart;
  const end = codeEditor.selectionEnd;
  const val = codeEditor.value;

  // Clean snippet placeholders $1, ${1:default}
  let insertText = item.insert.replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\d+/g, '');

  codeEditor.value = val.substring(0, start) + insertText + val.substring(end);
  const newPos = start + insertText.length;
  codeEditor.selectionStart = codeEditor.selectionEnd = newPos;

  hideAutocomplete();
  updateLineNumbers();
  updateStatusBar();
  queueAutoRun();
  codeEditor.focus();
}

// ==========================================================================
// Editor Keyboards & Event Handling
// ==========================================================================
function updateLineNumbers() {
  const lines = codeEditor.value.split('\n');
  const count = lines.length;
  let numbersHtml = '';
  for (let i = 1; i <= count; i++) {
    numbersHtml += `<div>${i}</div>`;
  }
  lineNumbers.innerHTML = numbersHtml;
}

function updateStatusBar() {
  const pos = codeEditor.selectionStart || 0;
  const textBefore = codeEditor.value.substring(0, pos);
  const line = textBefore.split('\n').length;
  const lastLine = textBefore.split('\n').pop();
  const col = (lastLine ? lastLine.length : 0) + 1;

  statusLineCol.textContent = `Linha ${line}, Col ${col}`;
  statusCharCount.textContent = `${codeEditor.value.length} caracteres`;
}

codeEditor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
  resultsScroll.scrollTop = codeEditor.scrollTop;
  if (autocompleteState.active) hideAutocomplete();
});

codeEditor.addEventListener('input', () => {
  updateLineNumbers();
  updateStatusBar();
  queueAutoRun();
  showAutocomplete(false);
});

codeEditor.addEventListener('click', () => {
  updateStatusBar();
  hideAutocomplete();
});

codeEditor.addEventListener('keyup', (e) => {
  updateStatusBar();
});

codeEditor.addEventListener('keydown', (e) => {
  // Autocomplete navigation when active
  if (autocompleteState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteState.selectedIndex = (autocompleteState.selectedIndex + 1) % autocompleteState.items.length;
      renderAutocompleteList();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteState.selectedIndex = (autocompleteState.selectedIndex - 1 + autocompleteState.items.length) % autocompleteState.items.length;
      renderAutocompleteList();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selectedItem = autocompleteState.items[autocompleteState.selectedIndex];
      if (selectedItem) {
        applySuggestion(selectedItem);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideAutocomplete();
      return;
    }
  }

  // Ctrl + Space to trigger Autocomplete / IntelliSense
  if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
    e.preventDefault();
    showAutocomplete(true);
    return;
  }

  // Ctrl+Enter or Cmd+Enter to Run
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    triggerExecution();
    return;
  }

  // Ctrl+T to New Tab
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    createNewTab();
    return;
  }

  const start = codeEditor.selectionStart;
  const end = codeEditor.selectionEnd;
  const val = codeEditor.value;

  // Tab key: insert 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    codeEditor.value = val.substring(0, start) + '  ' + val.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
    updateLineNumbers();
    queueAutoRun();
    return;
  }

  // Auto-close brackets and quotes
  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  if (pairs[e.key] && start === end) {
    e.preventDefault();
    const closeChar = pairs[e.key];
    codeEditor.value = val.substring(0, start) + e.key + closeChar + val.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + 1;
    updateLineNumbers();
    queueAutoRun();
    return;
  }

  // Enter key: maintain indent
  if (e.key === 'Enter') {
    const curLine = val.substring(0, start).split('\n').pop();
    const match = curLine.match(/^\s*/);
    let indent = match ? match[0] : '';
    if (curLine.trim().endsWith('{')) {
      indent += '  ';
    }
    if (indent.length > 0) {
      e.preventDefault();
      codeEditor.value = val.substring(0, start) + '\n' + indent + val.substring(end);
      codeEditor.selectionStart = codeEditor.selectionEnd = start + 1 + indent.length;
      updateLineNumbers();
      queueAutoRun();
    }
  }
});

// ==========================================================================
// Splitter Resizing
// ==========================================================================
let isDragging = false;

splitGutter.addEventListener('mousedown', (e) => {
  isDragging = true;
  splitGutter.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const containerRect = workspaceSplit.getBoundingClientRect();
  const offset = e.clientX - containerRect.left;
  const minWidth = 180;
  const maxWidth = containerRect.width - minWidth;

  if (offset >= minWidth && offset <= maxWidth) {
    const editorPane = document.querySelector('.pane-editor');
    const resultsPane = document.querySelector('.pane-results');
    editorPane.style.flex = `0 0 ${offset}px`;
    resultsPane.style.flex = '1 1 auto';
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    splitGutter.classList.remove('dragging');
    document.body.style.cursor = 'default';
  }
});

// ==========================================================================
// Toolbar Controls
// ==========================================================================
btnRun.addEventListener('click', () => {
  triggerExecution();
});

toggleAutoRun.addEventListener('change', () => {
  state.autoRun = toggleAutoRun.checked;
  if (state.autoRun) triggerExecution();
});

envMode.addEventListener('change', () => {
  const active = getActiveTab();
  if (active) {
    active.mode = envMode.value;
    triggerExecution();
    saveState();
  }
});

btnClear.addEventListener('click', () => {
  if (confirm('Deseja limpar todo o código desta aba?')) {
    codeEditor.value = '';
    updateLineNumbers();
    triggerExecution();
  }
});

btnNewTab.addEventListener('click', () => {
  createNewTab();
});

// Templates Menu
btnTemplates.addEventListener('click', (e) => {
  e.stopPropagation();
  templatesMenu.classList.toggle('show');
});

document.addEventListener('click', () => {
  templatesMenu.classList.remove('show');
  hideAutocomplete();
});

templatesMenu.querySelectorAll('a').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tmplKey = item.getAttribute('data-template');
    if (TEMPLATES[tmplKey]) {
      createNewTab(item.textContent.trim(), TEMPLATES[tmplKey]);
    }
  });
});

// NPM Packages Modal
btnPackages.addEventListener('click', () => {
  vscode.postMessage({ type: 'getPackages' });
  renderPackagesList();
  packagesModal.classList.add('show');
});

closePackagesModal.addEventListener('click', () => {
  packagesModal.classList.remove('show');
});

packagesModal.addEventListener('click', (e) => {
  if (e.target === packagesModal) packagesModal.classList.remove('show');
});

function renderPackagesList() {
  packageList.innerHTML = '';
  if (!state.packages || state.packages.length === 0) {
    packageList.innerHTML = '<li class="modal-desc">Nenhum pacote npm detectado no package.json. Você pode usar qualquer módulo nativo do Node.js (fs, path, crypto, os, etc.).</li>';
    return;
  }

  state.packages.forEach(pkg => {
    const li = document.createElement('li');
    li.className = 'package-item';
    li.innerHTML = `
      <span><strong>${escapeHtml(pkg)}</strong></span>
      <button class="package-btn-copy" data-pkg="${escapeHtml(pkg)}">+ Importar</button>
    `;

    li.querySelector('button').addEventListener('click', () => {
      const importCode = `const ${camelCase(pkg)} = require('${pkg}');\n`;
      codeEditor.value = importCode + codeEditor.value;
      updateLineNumbers();
      triggerExecution();
      packagesModal.classList.remove('show');
    });

    packageList.appendChild(li);
  });
}

// Console Clear
consoleClear.addEventListener('click', (e) => {
  e.stopPropagation();
  consoleContent.innerHTML = '';
  consoleCount.textContent = '0';
});

// Utility Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function camelCase(str) {
  return str.replace(/[-_@/]([a-z])/g, (g) => g[1].toUpperCase()).replace(/[@/]/g, '');
}
