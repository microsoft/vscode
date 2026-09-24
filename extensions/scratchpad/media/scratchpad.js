// Acquire VS Code API (or mock if running in standalone browser test)
const isStandalone = typeof acquireVsCodeApi !== 'function';
const vscode = !isStandalone ? acquireVsCodeApi() : {
  postMessage: (msg) => {
    if (msg.type === 'ready') {
      setTimeout(() => {
        window.postMessage({
          type: 'init',
          tabs: null,
          packages: ['react', 'lodash', 'axios', 'express', 'vue'],
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
          try {
            let expr = tr.replace(/;$/, '');
            if (expr.startsWith('await ')) expr = expr.replace(/^await /, '');
            const val = eval(expr);
            outputs.push({
              line: lNum,
              display: typeof val === 'object' ? JSON.stringify(val) : String(val),
              type: Array.isArray(val) ? 'array' : typeof val
            });
          } catch (e) {}
        }
        window.postMessage({
          type: 'results',
          tabId: msg.tabId,
          outputs,
          logs,
          timeMs: 3,
          error: null
        }, '*');
      }, 20);
    }
  },
  setState: () => {},
  getState: () => null
};

// ==========================================================================
// Templates Catalog
// ==========================================================================
const TEMPLATES = {
  'runjs-welcome': `/*
 * Bem-vindo ao RunJS ⚡
 *
 * Para começar, tente escrever algum código.
 * Aqui estão alguns exemplos:
 */

const helloWorld = () => 'Olá, Mundo! 🌍';

helloWorld();

// Você verá os resultados à direita 👉

Math.pow(5, 5);

await Promise.resolve('Aguarde de nível superior 🤩');

[1, 2, 3, 4].map(num => num * 2);

/*
 * O RunJS OSS é 100% gratuito e open-source:
 *  - Suporte a pacotes NPM
 *  - Múltiplas abas ilimitadas
 *  - Snippets de código e TypeScript nativo
 *  - Sem limites ou licenças pagas!
 *
 * Boa programação! 😊
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

// Manipulação e cálculo
const estatisticas = {
  total: time.length,
  devs: filtrarUsuarios(time, 'dev').length
};

estatisticas;`,

  'node-system': `// Acesso completo ao Node.js Standard Library
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Informações do Sistema
const sistemaInfo = {
  plataforma: os.platform(),
  arquitetura: os.arch(),
  cpus: os.cpus().length,
  memoriaLivreMB: Math.round(os.freemem() / 1024 / 1024)
};

sistemaInfo;

// Geração de Hash Criptográfico
const hash = crypto.createHash('sha256').update('MeuProjetoJSStudio').digest('hex');

hash;

path.join('src', 'components', 'App.tsx');`,

  'react-preview': `// Simulação e Teste de Componentes React
function createMockElement(type, props, ...children) {
  return {
    type,
    props: { ...props, children: children.flat() },
    $$typeof: 'react.element'
  };
}

// Componente de Botão
function Button({ label, variant = 'primary' }) {
  return createMockElement('button', { className: \`btn btn-\${variant}\` }, label);
}

// Simulação de Hook de Estado
function useStateSimulation(initialValue) {
  let value = initialValue;
  const setValue = (newVal) => { value = newVal; };
  return [value, setValue];
}

const [count, setCount] = useStateSimulation(0);
count;

Button({ label: 'Salvar Alterações', variant: 'success' });`,

  'vue-reactivity': `// Simulação da Reatividade do Vue 3 Composition API
function ref(initial) {
  let _val = initial;
  return {
    get value() { return _val; },
    set value(v) { _val = v; }
  };
}

function computed(getter) {
  return {
    get value() { return getter(); }
  };
}

const contador = ref(10);
const dobro = computed(() => contador.value * 2);

contador.value;
dobro.value;

contador.value = 25;
dobro.value;`,

  'async-fetch': `// Operações Assíncronas e Top-Level Await
async function buscarDadosSimulados() {
  await new Promise(resolve => setTimeout(resolve, 50));
  return [
    { id: 101, produto: 'Notebook Pro', preco: 4500 },
    { id: 102, produto: 'Monitor 4K', preco: 1800 },
    { id: 103, produto: 'Teclado Mecânico', preco: 350 }
  ];
}

const produtos = await buscarDadosSimulados();
produtos;

const totalValor = produtos.reduce((acc, p) => acc + p.preco, 0);
\`Total do Carrinho: R$ \${totalValor}\`;`
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

    // Double click to rename
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
  // Save current code
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

  // Render a row for each line of the code
  for (let l = 1; l <= totalLines; l++) {
    const row = document.createElement('div');
    row.className = 'result-line-row';

    const item = outputsByLine[l];
    if (item) {
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

  // Handle Error Banner
  if (error) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'error-banner';
    errorBanner.innerHTML = `
      <div class="error-title">❌ Erro ${error.line ? 'na Linha ' + error.line : ''}</div>
      <div class="error-msg">${escapeHtml(error.message)}</div>
    `;
    resultsContainer.appendChild(errorBanner);
  }

  // Handle Console Drawer Logs
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
// Editor Interactions (Indentation, Auto-Brackets, Line Numbers)
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

// Synchronize scroll between editor, line numbers and results
codeEditor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
  resultsScroll.scrollTop = codeEditor.scrollTop;
});

codeEditor.addEventListener('input', () => {
  updateLineNumbers();
  updateStatusBar();
  queueAutoRun();
});

codeEditor.addEventListener('click', updateStatusBar);
codeEditor.addEventListener('keyup', updateStatusBar);

// Smart indentation and auto-closing pairs
codeEditor.addEventListener('keydown', (e) => {
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
  const pairs = {
    '(': ')',
    '[': ']',
    '{': '}',
    '"': '"',
    "'": "'",
    '`': '`'
  };

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
    packageList.innerHTML = '<li class="modal-desc">Nenhum pacote npm detectado no package.json do workspace atual. Você pode usar qualquer módulo nativo do Node.js (fs, path, crypto, os, etc.).</li>';
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
