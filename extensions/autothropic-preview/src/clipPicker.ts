import * as vscode from 'vscode';

interface ClipThumbnail {
  index: number;
  timestamp: number;
  preview: string;
  strip: string;
}

interface AgentInfo {
  id: string;
  name: string;
  color: string;
  status: string;
}

/**
 * Full-featured clip editor with filmstrip, selection tray, agent send.
 * Replaces the old basic ClipPicker.
 */
export class ClipEditor {
  private panel: vscode.WebviewPanel | undefined;

  private readonly _onSend = new vscode.EventEmitter<{ filePaths: string[]; agentId: string }>();
  readonly onSend = this._onSend.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async show(seconds = 3): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'autothropic.clipEditor',
        'Clip Editor',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri],
        },
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
          case 'changeDuration':
            await this.loadThumbnails(msg.seconds);
            break;
          case 'send':
            await this.handleSend(msg.indices, msg.agentId);
            break;
          case 'export':
            await this.handleExport(msg.indices);
            break;
        }
      });
    }

    // Fetch thumbnails, suggested indices, and agents
    let thumbnails: ClipThumbnail[] = [];
    let suggested: number[] = [];
    let agents: AgentInfo[] = [];

    try {
      thumbnails = await vscode.commands.executeCommand<ClipThumbnail[]>(
        '_autothropic.capture.getClipThumbnails', seconds
      ) ?? [];
    } catch { /* capture service not available */ }

    try {
      suggested = await vscode.commands.executeCommand<number[]>(
        '_autothropic.capture.getSuggestedIndices', seconds, 8
      ) ?? [];
    } catch { /* no suggestions */ }

    try {
      agents = await vscode.commands.executeCommand<AgentInfo[]>(
        '_autothropic.agents.getSessions'
      ) ?? [];
    } catch { /* agents extension not available */ }

    this.panel.webview.html = this.getHtml(thumbnails, suggested, agents, seconds);
  }

  private async loadThumbnails(seconds: number): Promise<void> {
    if (!this.panel) { return; }

    let thumbnails: ClipThumbnail[] = [];
    let suggested: number[] = [];

    try {
      thumbnails = await vscode.commands.executeCommand<ClipThumbnail[]>(
        '_autothropic.capture.getClipThumbnails', seconds
      ) ?? [];
    } catch { /* */ }

    try {
      suggested = await vscode.commands.executeCommand<number[]>(
        '_autothropic.capture.getSuggestedIndices', seconds, 8
      ) ?? [];
    } catch { /* */ }

    this.panel.webview.postMessage({
      type: 'updateThumbnails',
      thumbnails,
      suggested,
    });
  }

  private async handleSend(indices: number[], agentId: string): Promise<void> {
    if (indices.length === 0) {
      vscode.window.showWarningMessage('No frames selected');
      return;
    }

    try {
      const result = await vscode.commands.executeCommand<{ filePaths: string[] }>(
        '_autothropic.capture.grabSelected', indices
      );
      if (result?.filePaths && result.filePaths.length > 0) {
        this._onSend.fire({ filePaths: result.filePaths, agentId });
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Send failed: ${err}`);
    }
  }

  private async handleExport(indices: number[]): Promise<void> {
    if (indices.length === 0) {
      vscode.window.showWarningMessage('No frames selected');
      return;
    }

    try {
      const result = await vscode.commands.executeCommand<{ filePaths: string[] }>(
        '_autothropic.capture.grabSelected', indices
      );
      if (result?.filePaths && result.filePaths.length > 0) {
        for (const fp of result.filePaths) {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fp));
        }
        vscode.window.showInformationMessage(`Exported ${result.filePaths.length} frame(s)`);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Export failed: ${err}`);
    }
  }

  private getHtml(thumbnails: ClipThumbnail[], suggested: number[], agents: AgentInfo[], seconds: number): string {
    const now = Date.now();

    const agentOptionsHtml = agents.map(a =>
      `<option value="${a.id}" data-color="${a.color}">${a.name}</option>`
    ).join('');

    const defaultAgent = agents.find(a => a.status === 'waiting') ?? agents[0];

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #111110;
      color: #a8a69e;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }

    /* --- Top Bar --- */
    .top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid #2a2a26;
      flex-shrink: 0;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #d97757; }
    .top-bar .title { font-size: 13px; font-weight: 600; color: #e8e5de; }
    .duration-control {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    .duration-control label { font-size: 11px; color: #7a7870; }
    .duration-control input[type="range"] {
      width: 120px;
      accent-color: #d97757;
    }
    .duration-label {
      font-size: 12px;
      font-weight: 600;
      color: #d97757;
      min-width: 24px;
    }
    .frame-count { font-size: 11px; color: #7a7870; }
    .close-btn {
      background: none;
      border: none;
      color: #5a5850;
      cursor: pointer;
      font-size: 16px;
      padding: 2px 6px;
    }
    .close-btn:hover { color: #e8e5de; }

    /* --- Main View --- */
    .main-view {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      min-height: 0;
      padding: 16px;
    }
    .main-frame {
      position: relative;
      cursor: pointer;
      border-radius: 8px;
      overflow: hidden;
      border: 3px solid transparent;
      transition: border-color 0.15s;
      max-height: 100%;
    }
    .main-frame.selected { border-color: #d97757; }
    .main-frame img {
      display: block;
      max-height: calc(100vh - 280px);
      max-width: 100%;
      object-fit: contain;
    }
    .selection-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #d97757;
      color: #f5f2eb;
      font-size: 12px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .main-frame.selected .selection-badge { display: flex; }
    .info-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: rgba(0,0,0,0.6);
      font-size: 10px;
      color: #a8a69e;
    }
    .nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(17,17,16,0.8);
      border: 1px solid #2a2a26;
      color: #a8a69e;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nav-arrow:hover { background: #232320; color: #e8e5de; }
    .nav-arrow.left { left: 8px; }
    .nav-arrow.right { right: 8px; }

    /* --- Filmstrip --- */
    .filmstrip {
      flex-shrink: 0;
      padding: 6px 16px;
      border-top: 1px solid #2a2a26;
      overflow-x: auto;
      overflow-y: hidden;
      white-space: nowrap;
      scrollbar-width: thin;
      scrollbar-color: #35352f #111110;
    }
    .filmstrip::-webkit-scrollbar { height: 4px; }
    .filmstrip::-webkit-scrollbar-track { background: #111110; }
    .filmstrip::-webkit-scrollbar-thumb { background: #35352f; border-radius: 2px; }
    .strip-thumb {
      display: inline-block;
      width: 56px;
      height: 38px;
      margin-right: 3px;
      border-radius: 3px;
      border: 2px solid transparent;
      overflow: hidden;
      cursor: pointer;
      opacity: 0.35;
      transition: opacity 0.1s, border-color 0.1s;
      vertical-align: middle;
    }
    .strip-thumb:hover { opacity: 0.7; }
    .strip-thumb.cursor { border-color: #e8e5de; opacity: 1; }
    .strip-thumb.selected { border-color: #d97757; opacity: 1; }
    .strip-thumb.cursor.selected { border-color: #d97757; box-shadow: 0 0 0 1px #e8e5de; }
    .strip-thumb img { width: 100%; height: 100%; object-fit: cover; }

    /* --- Selection Tray --- */
    .selection-tray {
      flex-shrink: 0;
      padding: 6px 16px;
      border-top: 1px solid #2a2a26;
      display: none;
      overflow-x: auto;
      white-space: nowrap;
    }
    .selection-tray.visible { display: block; }
    .tray-thumb {
      display: inline-block;
      width: 48px;
      height: 32px;
      margin-right: 4px;
      border-radius: 3px;
      border: 2px solid #d97757;
      overflow: hidden;
      cursor: pointer;
      position: relative;
      vertical-align: middle;
    }
    .tray-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .tray-thumb .tray-badge {
      position: absolute;
      bottom: 1px;
      right: 1px;
      font-size: 8px;
      background: rgba(0,0,0,0.7);
      color: #d97757;
      padding: 0 3px;
      border-radius: 2px;
      font-weight: 700;
    }
    .tray-thumb .tray-remove {
      position: absolute;
      top: -1px;
      right: -1px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #e5534b;
      color: #f5f2eb;
      font-size: 9px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .tray-thumb:hover .tray-remove { display: flex; }

    /* --- Action Bar --- */
    .action-bar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-top: 1px solid #2a2a26;
    }
    .action-btn {
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      border: 1px solid #2a2a26;
      background: #1c1c1a;
      color: #a8a69e;
    }
    .action-btn:hover { background: #232320; color: #e8e5de; }
    .hint { font-size: 10px; color: #5a5850; margin-left: 8px; }
    .spacer { flex: 1; }
    .agent-select {
      background: #1c1c1a;
      border: 1px solid #2a2a26;
      color: #a8a69e;
      padding: 5px 8px;
      border-radius: 5px;
      font-size: 11px;
      font-family: inherit;
    }
    .send-btn {
      padding: 5px 16px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      border: none;
      background: #d97757;
      color: #f5f2eb;
      font-weight: 600;
    }
    .send-btn:hover { background: #c46a4d; }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* --- Empty state --- */
    .empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #5a5850;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="status-dot"></div>
    <span class="title">Clip Editor</span>
    <div class="duration-control">
      <label>Duration</label>
      <input type="range" id="duration-slider" min="1" max="5" step="0.5" value="${seconds}" />
      <span class="duration-label" id="duration-label">${seconds}s</span>
    </div>
    <span class="frame-count" id="frame-count"></span>
  </div>

  <div class="main-view" id="main-view">
    <button class="nav-arrow left" id="nav-left">&#8249;</button>
    <div class="main-frame" id="main-frame">
      <img id="main-img" src="" />
      <span class="selection-badge" id="main-badge"></span>
      <div class="info-bar">
        <span id="time-label"></span>
        <span id="pos-label"></span>
      </div>
    </div>
    <button class="nav-arrow right" id="nav-right">&#8250;</button>
  </div>

  <div class="filmstrip" id="filmstrip"></div>
  <div class="selection-tray" id="selection-tray"></div>

  <div class="action-bar">
    <button class="action-btn" id="btn-autoselect">Auto-select</button>
    <button class="action-btn" id="btn-clear">Clear</button>
    <span class="hint">Arrows navigate / Space toggles</span>
    <span class="spacer"></span>
    ${agents.length > 0 ? `<select class="agent-select" id="agent-select">${agentOptionsHtml}</select>` : ''}
    <button class="send-btn" id="btn-send" disabled>Send 0 frames</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let thumbnails = ${JSON.stringify(thumbnails)};
    let selected = new Set(${JSON.stringify(suggested)});
    let cursor = 0;
    const now = ${now};
    const agents = ${JSON.stringify(agents)};
    const defaultAgentId = ${JSON.stringify(defaultAgent?.id ?? '')};

    function init() {
      renderFilmstrip();
      renderSelectionTray();
      updateMainView();
      updateSendButton();
      updateFrameCount();
      if (document.getElementById('agent-select') && defaultAgentId) {
        document.getElementById('agent-select').value = defaultAgentId;
      }
    }

    function renderFilmstrip() {
      const fs = document.getElementById('filmstrip');
      if (thumbnails.length === 0) {
        fs.innerHTML = '<span style="color:#5a5850;font-size:11px">No frames captured. Load a URL in preview first.</span>';
        return;
      }
      let html = '';
      for (let i = 0; i < thumbnails.length; i++) {
        const cls = [];
        if (i === cursor) cls.push('cursor');
        if (selected.has(i)) cls.push('selected');
        html += '<div class="strip-thumb ' + cls.join(' ') + '" data-idx="' + i + '"><img src="' + thumbnails[i].strip + '" /></div>';
      }
      fs.innerHTML = html;
      scrollFilmstripToCursor();
    }

    function renderSelectionTray() {
      const tray = document.getElementById('selection-tray');
      const sorted = Array.from(selected).sort((a, b) => a - b);
      if (sorted.length === 0) {
        tray.classList.remove('visible');
        return;
      }
      tray.classList.add('visible');
      let html = '';
      sorted.forEach((idx, order) => {
        const t = thumbnails[idx];
        if (!t) return;
        html += '<div class="tray-thumb" data-idx="' + idx + '">' +
          '<img src="' + t.strip + '" />' +
          '<span class="tray-badge">' + (order + 1) + '</span>' +
          '<span class="tray-remove" data-remove="' + idx + '">x</span>' +
          '</div>';
      });
      tray.innerHTML = html;
    }

    function updateMainView() {
      if (thumbnails.length === 0) return;
      const t = thumbnails[cursor];
      document.getElementById('main-img').src = t.preview;
      const frame = document.getElementById('main-frame');
      const badge = document.getElementById('main-badge');
      if (selected.has(cursor)) {
        frame.classList.add('selected');
        const sorted = Array.from(selected).sort((a, b) => a - b);
        badge.textContent = sorted.indexOf(cursor) + 1;
      } else {
        frame.classList.remove('selected');
      }

      const elapsed = ((t.timestamp - now) / 1000).toFixed(1);
      document.getElementById('time-label').textContent = elapsed + 's';
      document.getElementById('pos-label').textContent = (cursor + 1) + '/' + thumbnails.length;
    }

    function updateSendButton() {
      const btn = document.getElementById('btn-send');
      const count = selected.size;
      const agentSel = document.getElementById('agent-select');
      const agentName = agentSel ? agentSel.options[agentSel.selectedIndex]?.text ?? '' : '';
      btn.textContent = count > 0
        ? 'Send ' + count + ' frame' + (count > 1 ? 's' : '') + (agentName ? ' to ' + agentName : '')
        : 'Send 0 frames';
      btn.disabled = count === 0;
    }

    function updateFrameCount() {
      document.getElementById('frame-count').textContent =
        selected.size + '/' + thumbnails.length;
    }

    function toggleSelection(idx) {
      if (selected.has(idx)) {
        selected.delete(idx);
      } else {
        if (selected.size >= 30) return;
        selected.add(idx);
      }
      renderFilmstrip();
      renderSelectionTray();
      updateMainView();
      updateSendButton();
      updateFrameCount();
    }

    function setCursor(idx) {
      if (idx < 0 || idx >= thumbnails.length) return;
      cursor = idx;
      renderFilmstrip();
      updateMainView();
    }

    function scrollFilmstripToCursor() {
      const fs = document.getElementById('filmstrip');
      const el = fs.querySelector('.strip-thumb.cursor');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    // --- Event handlers ---
    document.getElementById('nav-left').addEventListener('click', () => setCursor(cursor - 1));
    document.getElementById('nav-right').addEventListener('click', () => setCursor(cursor + 1));
    document.getElementById('main-frame').addEventListener('click', () => toggleSelection(cursor));

    document.getElementById('filmstrip').addEventListener('click', (e) => {
      const thumb = e.target.closest('.strip-thumb');
      if (thumb) setCursor(parseInt(thumb.dataset.idx));
    });
    document.getElementById('filmstrip').addEventListener('dblclick', (e) => {
      const thumb = e.target.closest('.strip-thumb');
      if (thumb) toggleSelection(parseInt(thumb.dataset.idx));
    });

    document.getElementById('selection-tray').addEventListener('click', (e) => {
      const remove = e.target.closest('.tray-remove');
      if (remove) {
        toggleSelection(parseInt(remove.dataset.remove));
        return;
      }
      const thumb = e.target.closest('.tray-thumb');
      if (thumb) setCursor(parseInt(thumb.dataset.idx));
    });

    document.getElementById('btn-autoselect').addEventListener('click', () => {
      vscode.postMessage({ type: 'changeDuration', seconds: parseFloat(document.getElementById('duration-slider').value) });
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
      selected.clear();
      renderFilmstrip();
      renderSelectionTray();
      updateMainView();
      updateSendButton();
      updateFrameCount();
    });
    document.getElementById('btn-send').addEventListener('click', () => {
      const agentSel = document.getElementById('agent-select');
      const agentId = agentSel ? agentSel.value : '';
      vscode.postMessage({
        type: 'send',
        indices: Array.from(selected).sort((a, b) => a - b),
        agentId,
      });
    });

    const agentSel = document.getElementById('agent-select');
    if (agentSel) {
      agentSel.addEventListener('change', updateSendButton);
    }

    document.getElementById('duration-slider').addEventListener('input', (e) => {
      document.getElementById('duration-label').textContent = e.target.value + 's';
    });
    document.getElementById('duration-slider').addEventListener('change', (e) => {
      vscode.postMessage({ type: 'changeDuration', seconds: parseFloat(e.target.value) });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); setCursor(cursor - 1); break;
        case 'ArrowRight': e.preventDefault(); setCursor(cursor + 1); break;
        case ' ':
        case 'Enter': e.preventDefault(); toggleSelection(cursor); break;
        case 'Escape': break; // Let VS Code handle close
      }
    });

    // Handle updates from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'updateThumbnails') {
        thumbnails = msg.thumbnails;
        selected = new Set(msg.suggested);
        cursor = 0;
        init();
      }
    });

    init();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this._onSend.dispose();
    this.panel?.dispose();
  }
}
