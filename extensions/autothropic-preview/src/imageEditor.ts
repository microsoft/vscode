import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface AgentInfo {
  id: string;
  name: string;
  color: string;
  status: string;
}

export class ImageEditor {
  private panel: vscode.WebviewPanel | undefined;

  private readonly _onSend = new vscode.EventEmitter<{ filePaths: string[]; agentId: string }>();
  readonly onSend = this._onSend.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async show(imagePath: string): Promise<void> {
    // Read the image as a data URL
    const imageBuffer = await vscode.workspace.fs.readFile(vscode.Uri.file(imagePath));
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const dataUrl = `data:${mime};base64,${Buffer.from(imageBuffer).toString('base64')}`;

    // Fetch agents for "Send to" dropdown
    let agents: AgentInfo[] = [];
    try {
      agents = await vscode.commands.executeCommand<AgentInfo[]>(
        '_autothropic.agents.getSessions'
      ) ?? [];
    } catch { /* agents extension not available */ }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.panel.webview.postMessage({ type: 'loadImage', dataUrl, imagePath, agents });
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'autothropic.imageEditor',
        'Screenshot Editor',
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
          case 'send':
            await this.handleSend(msg.dataUrl, msg.agentId);
            break;
          case 'save':
            await this.handleSave(msg.dataUrl);
            break;
          case 'copy':
            await this.handleCopy(msg.dataUrl);
            break;
          case 'discard':
            this.panel?.dispose();
            break;
        }
      });

      this.panel.webview.html = this.getHtml(dataUrl, imagePath, agents);
    }
  }

  private async handleSend(dataUrl: string, agentId: string): Promise<void> {
    const filePath = await this.saveDataUrlToTemp(dataUrl);
    if (filePath) {
      this._onSend.fire({ filePaths: [filePath], agentId });
    }
  }

  private async handleSave(dataUrl: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `screenshot-${Date.now()}.png`)),
      filters: { 'PNG Image': ['png'] },
    });
    if (uri) {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      await vscode.workspace.fs.writeFile(uri, Buffer.from(base64, 'base64'));
      vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`);
    }
  }

  private async handleCopy(dataUrl: string): Promise<void> {
    // Save to temp, then copy via clipboard command
    const filePath = await this.saveDataUrlToTemp(dataUrl);
    if (filePath) {
      await vscode.env.clipboard.writeText(filePath);
      vscode.window.showInformationMessage('Screenshot path copied to clipboard');
    }
  }

  private async saveDataUrlToTemp(dataUrl: string): Promise<string | null> {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Buffer.from(base64, 'base64');
      const tmpDir = path.join(os.tmpdir(), 'autothropic-screenshots');
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { /* exists */ }
      const filePath = path.join(tmpDir, `annotated-${Date.now()}.png`);
      fs.writeFileSync(filePath, bytes);
      return filePath;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save screenshot: ${err}`);
      return null;
    }
  }

  private getHtml(dataUrl: string, _imagePath: string, agents: AgentInfo[]): string {
    const agentOptionsHtml = agents.map(a =>
      `<option value="${a.id}">${a.name}</option>`
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

/* --- Toolbar --- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid #2a2a26;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.toolbar-sep {
  width: 1px;
  height: 20px;
  background: #2a2a26;
  margin: 0 6px;
}
.tool-button {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #a8a69e;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
}
.tool-button:hover { background: #232320; color: #e8e5de; }
.tool-button.active { background: #d97757; color: #f5f2eb; border-color: #d97757; }
.tool-button svg { width: 14px; height: 14px; }

/* Color swatches */
.color-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.1s;
}
.color-swatch:hover { border-color: #555; }
.color-swatch.active { border-color: #e8e5de; }
.color-input {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
}

/* Stroke width */
.width-button {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #a8a69e;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
}
.width-button:hover { background: #232320; }
.width-button.active { background: #d97757; color: #f5f2eb; }

/* --- Canvas area --- */
.canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 16px;
}
.canvas-container {
  position: relative;
  display: inline-block;
  cursor: crosshair;
}
.canvas-container canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}
#bg-canvas { position: relative; }

/* --- Action bar --- */
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #2a2a26;
  flex-shrink: 0;
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
.action-btn.danger { color: #e5534b; }
.action-btn.danger:hover { background: #2a1515; }
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

/* Text input overlay */
.text-input-overlay {
  position: absolute;
  display: none;
  z-index: 10;
}
.text-input-overlay input {
  background: rgba(0,0,0,0.7);
  border: 1px solid #d97757;
  color: #fff;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  min-width: 120px;
}
</style>
</head>
<body>
  <div class="toolbar" id="toolbar">
    <div class="toolbar-group" id="tools">
      <button class="tool-button active" data-tool="pen" title="Pen (P)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
        Pen
      </button>
      <button class="tool-button" data-tool="line" title="Line (L)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        Line
      </button>
      <button class="tool-button" data-tool="rect" title="Rectangle (R)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        Rect
      </button>
      <button class="tool-button" data-tool="arrow" title="Arrow (A)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/></svg>
        Arrow
      </button>
      <button class="tool-button" data-tool="text" title="Text (T)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        Text
      </button>
      <button class="tool-button" data-tool="eraser" title="Eraser (E)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.2 2l7.8 7.8-6.2 6.2"/><path d="M6.5 13.5L14 6"/></svg>
        Eraser
      </button>
    </div>

    <div class="toolbar-sep"></div>

    <div class="toolbar-group" id="colors">
      <div class="color-swatch active" data-color="#ff3b30" style="background:#ff3b30"></div>
      <div class="color-swatch" data-color="#ff9500" style="background:#ff9500"></div>
      <div class="color-swatch" data-color="#ffcc00" style="background:#ffcc00"></div>
      <div class="color-swatch" data-color="#34c759" style="background:#34c759"></div>
      <div class="color-swatch" data-color="#007aff" style="background:#007aff"></div>
      <div class="color-swatch" data-color="#af52de" style="background:#af52de"></div>
      <div class="color-swatch" data-color="#ffffff" style="background:#ffffff"></div>
      <div class="color-swatch" data-color="#000000" style="background:#000000;border:1px solid #444"></div>
      <input type="color" class="color-input" id="custom-color" value="#ff3b30" title="Custom color" />
    </div>

    <div class="toolbar-sep"></div>

    <div class="toolbar-group" id="widths">
      <button class="width-button" data-width="2">Thin</button>
      <button class="width-button active" data-width="4">Med</button>
      <button class="width-button" data-width="8">Thick</button>
    </div>

    <div class="toolbar-sep"></div>

    <div class="toolbar-group">
      <button class="tool-button" id="btn-undo" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        Undo
      </button>
      <button class="tool-button" id="btn-redo" title="Redo (Ctrl+Y)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
        Redo
      </button>
    </div>
  </div>

  <div class="canvas-wrap" id="canvas-wrap">
    <div class="canvas-container" id="canvas-container">
      <canvas id="bg-canvas"></canvas>
      <canvas id="draw-canvas"></canvas>
      <canvas id="preview-canvas"></canvas>
      <div class="text-input-overlay" id="text-input-overlay">
        <input type="text" id="text-input" placeholder="Type text..." />
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="action-btn danger" id="btn-discard">Discard</button>
    <button class="action-btn" id="btn-copy">Copy</button>
    <button class="action-btn" id="btn-save">Save</button>
    <span class="spacer"></span>
    ${agents.length > 0 ? `<select class="agent-select" id="agent-select">${agentOptionsHtml}</select>` : ''}
    <button class="send-btn" id="btn-send">Send to Agent</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // --- State ---
    let currentTool = 'pen';
    let currentColor = '#ff3b30';
    let currentWidth = 4;
    let operations = [];  // { type, points, color, width, text, x, y, ... }
    let redoStack = [];
    let isDrawing = false;
    let startX = 0, startY = 0;
    let currentPoints = [];
    let img = null;
    let displayScale = 1;

    const bgCanvas = document.getElementById('bg-canvas');
    const drawCanvas = document.getElementById('draw-canvas');
    const previewCanvas = document.getElementById('preview-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const drawCtx = drawCanvas.getContext('2d');
    const previewCtx = previewCanvas.getContext('2d');
    const container = document.getElementById('canvas-container');
    const wrap = document.getElementById('canvas-wrap');

    // --- Load image ---
    function loadImage(dataUrl) {
      img = new Image();
      img.onload = function() {
        fitCanvases();
        redrawAll();
      };
      img.src = dataUrl;
    }

    function fitCanvases() {
      if (!img) return;
      const wrapRect = wrap.getBoundingClientRect();
      const maxW = wrapRect.width - 32;
      const maxH = wrapRect.height - 32;
      displayScale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * displayScale);
      const h = Math.round(img.height * displayScale);

      bgCanvas.width = w; bgCanvas.height = h;
      drawCanvas.width = w; drawCanvas.height = h;
      previewCanvas.width = w; previewCanvas.height = h;
      container.style.width = w + 'px';
      container.style.height = h + 'px';
    }

    function redrawAll() {
      if (!img) return;
      // Background
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      bgCtx.drawImage(img, 0, 0, bgCanvas.width, bgCanvas.height);

      // Replay operations onto draw canvas
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      for (const op of operations) {
        drawOperation(drawCtx, op);
      }

      // Clear preview
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }

    function drawOperation(ctx, op) {
      ctx.save();
      ctx.strokeStyle = op.color;
      ctx.fillStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (op.type) {
        case 'pen': {
          if (op.points.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(op.points[0].x, op.points[0].y);
          for (let i = 1; i < op.points.length; i++) {
            ctx.lineTo(op.points[i].x, op.points[i].y);
          }
          ctx.stroke();
          break;
        }
        case 'line': {
          ctx.beginPath();
          ctx.moveTo(op.x1, op.y1);
          ctx.lineTo(op.x2, op.y2);
          ctx.stroke();
          break;
        }
        case 'rect': {
          ctx.beginPath();
          ctx.strokeRect(op.x, op.y, op.w, op.h);
          break;
        }
        case 'arrow': {
          const dx = op.x2 - op.x1;
          const dy = op.y2 - op.y1;
          const angle = Math.atan2(dy, dx);
          const headLen = Math.max(10, op.width * 3);
          ctx.beginPath();
          ctx.moveTo(op.x1, op.y1);
          ctx.lineTo(op.x2, op.y2);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(op.x2, op.y2);
          ctx.lineTo(op.x2 - headLen * Math.cos(angle - Math.PI / 6), op.y2 - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(op.x2, op.y2);
          ctx.lineTo(op.x2 - headLen * Math.cos(angle + Math.PI / 6), op.y2 - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
          break;
        }
        case 'text': {
          const fontSize = Math.max(14, op.width * 4);
          ctx.font = 'bold ' + fontSize + 'px system-ui, -apple-system, sans-serif';
          ctx.fillText(op.text, op.x, op.y);
          break;
        }
        case 'eraser': {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = op.width * 4;
          if (op.points.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(op.points[0].x, op.points[0].y);
          for (let i = 1; i < op.points.length; i++) {
            ctx.lineTo(op.points[i].x, op.points[i].y);
          }
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }

    // --- Mouse events on preview canvas ---
    function getCanvasPos(e) {
      const rect = previewCanvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    previewCanvas.addEventListener('mousedown', function(e) {
      if (currentTool === 'text') {
        const pos = getCanvasPos(e);
        showTextInput(pos.x, pos.y);
        return;
      }
      isDrawing = true;
      const pos = getCanvasPos(e);
      startX = pos.x;
      startY = pos.y;
      currentPoints = [{ x: pos.x, y: pos.y }];
    });

    previewCanvas.addEventListener('mousemove', function(e) {
      if (!isDrawing) return;
      const pos = getCanvasPos(e);

      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

      if (currentTool === 'pen' || currentTool === 'eraser') {
        currentPoints.push({ x: pos.x, y: pos.y });
        drawOperation(previewCtx, {
          type: currentTool,
          points: currentPoints,
          color: currentColor,
          width: currentWidth,
        });
      } else if (currentTool === 'line') {
        drawOperation(previewCtx, {
          type: 'line',
          x1: startX, y1: startY,
          x2: pos.x, y2: pos.y,
          color: currentColor,
          width: currentWidth,
        });
      } else if (currentTool === 'rect') {
        drawOperation(previewCtx, {
          type: 'rect',
          x: Math.min(startX, pos.x),
          y: Math.min(startY, pos.y),
          w: Math.abs(pos.x - startX),
          h: Math.abs(pos.y - startY),
          color: currentColor,
          width: currentWidth,
        });
      } else if (currentTool === 'arrow') {
        drawOperation(previewCtx, {
          type: 'arrow',
          x1: startX, y1: startY,
          x2: pos.x, y2: pos.y,
          color: currentColor,
          width: currentWidth,
        });
      }
    });

    previewCanvas.addEventListener('mouseup', function(e) {
      if (!isDrawing) return;
      isDrawing = false;
      const pos = getCanvasPos(e);

      let op = null;
      if (currentTool === 'pen' || currentTool === 'eraser') {
        currentPoints.push({ x: pos.x, y: pos.y });
        op = { type: currentTool, points: currentPoints.slice(), color: currentColor, width: currentWidth };
      } else if (currentTool === 'line') {
        op = { type: 'line', x1: startX, y1: startY, x2: pos.x, y2: pos.y, color: currentColor, width: currentWidth };
      } else if (currentTool === 'rect') {
        op = { type: 'rect', x: Math.min(startX, pos.x), y: Math.min(startY, pos.y), w: Math.abs(pos.x - startX), h: Math.abs(pos.y - startY), color: currentColor, width: currentWidth };
      } else if (currentTool === 'arrow') {
        op = { type: 'arrow', x1: startX, y1: startY, x2: pos.x, y2: pos.y, color: currentColor, width: currentWidth };
      }

      if (op) {
        operations.push(op);
        redoStack = [];
        redrawAll();
      }

      currentPoints = [];
    });

    previewCanvas.addEventListener('mouseleave', function() {
      if (isDrawing) {
        isDrawing = false;
        // Commit whatever we had
        if (currentTool === 'pen' || currentTool === 'eraser') {
          if (currentPoints.length > 1) {
            operations.push({ type: currentTool, points: currentPoints.slice(), color: currentColor, width: currentWidth });
            redoStack = [];
          }
        }
        currentPoints = [];
        redrawAll();
      }
    });

    // --- Text input ---
    function showTextInput(x, y) {
      const overlay = document.getElementById('text-input-overlay');
      const input = document.getElementById('text-input');
      overlay.style.display = 'block';
      overlay.style.left = x + 'px';
      overlay.style.top = y + 'px';
      input.style.color = currentColor;
      input.value = '';
      input.focus();
    }

    document.getElementById('text-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = e.target.value.trim();
        if (text) {
          const overlay = document.getElementById('text-input-overlay');
          const x = parseInt(overlay.style.left);
          const y = parseInt(overlay.style.top);
          operations.push({ type: 'text', text: text, x: x, y: y, color: currentColor, width: currentWidth });
          redoStack = [];
          redrawAll();
        }
        document.getElementById('text-input-overlay').style.display = 'none';
      }
      if (e.key === 'Escape') {
        document.getElementById('text-input-overlay').style.display = 'none';
      }
    });

    document.getElementById('text-input').addEventListener('blur', function() {
      document.getElementById('text-input-overlay').style.display = 'none';
    });

    // --- Tool selection ---
    document.getElementById('tools').addEventListener('click', function(e) {
      const btn = e.target.closest('.tool-button');
      if (!btn || !btn.dataset.tool) return;
      currentTool = btn.dataset.tool;
      document.querySelectorAll('#tools .tool-button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // --- Color selection ---
    document.getElementById('colors').addEventListener('click', function(e) {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      currentColor = swatch.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      document.getElementById('custom-color').value = currentColor;
    });

    document.getElementById('custom-color').addEventListener('input', function(e) {
      currentColor = e.target.value;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    });

    // --- Width selection ---
    document.getElementById('widths').addEventListener('click', function(e) {
      const btn = e.target.closest('.width-button');
      if (!btn || !btn.dataset.width) return;
      currentWidth = parseInt(btn.dataset.width);
      document.querySelectorAll('.width-button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // --- Undo / Redo ---
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    function undo() {
      if (operations.length === 0) return;
      redoStack.push(operations.pop());
      redrawAll();
    }

    function redo() {
      if (redoStack.length === 0) return;
      operations.push(redoStack.pop());
      redrawAll();
    }

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }

      switch (e.key.toLowerCase()) {
        case 'p': selectTool('pen'); break;
        case 'l': selectTool('line'); break;
        case 'r': selectTool('rect'); break;
        case 'a': selectTool('arrow'); break;
        case 't': selectTool('text'); break;
        case 'e': selectTool('eraser'); break;
      }
    });

    function selectTool(tool) {
      currentTool = tool;
      document.querySelectorAll('#tools .tool-button').forEach(b => {
        b.classList.toggle('active', b.dataset.tool === tool);
      });
    }

    // --- Composite and export ---
    function getCompositeDataUrl() {
      // Create a full-resolution composite (at original image size)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = img.width;
      exportCanvas.height = img.height;
      const ctx = exportCanvas.getContext('2d');

      // Draw background image at full res
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Scale up annotations from display coords to full res
      const scale = img.width / bgCanvas.width;
      ctx.save();
      ctx.scale(scale, scale);
      for (const op of operations) {
        drawOperation(ctx, op);
      }
      ctx.restore();

      return exportCanvas.toDataURL('image/png');
    }

    // --- Action buttons ---
    document.getElementById('btn-send').addEventListener('click', function() {
      const agentSel = document.getElementById('agent-select');
      const agentId = agentSel ? agentSel.value : '';
      vscode.postMessage({ type: 'send', dataUrl: getCompositeDataUrl(), agentId: agentId });
    });

    document.getElementById('btn-save').addEventListener('click', function() {
      vscode.postMessage({ type: 'save', dataUrl: getCompositeDataUrl() });
    });

    document.getElementById('btn-copy').addEventListener('click', function() {
      vscode.postMessage({ type: 'copy', dataUrl: getCompositeDataUrl() });
    });

    document.getElementById('btn-discard').addEventListener('click', function() {
      vscode.postMessage({ type: 'discard' });
    });

    // --- Handle messages from extension ---
    window.addEventListener('message', function(e) {
      const msg = e.data;
      if (msg.type === 'loadImage') {
        operations = [];
        redoStack = [];
        loadImage(msg.dataUrl);
      }
    });

    // --- Window resize ---
    window.addEventListener('resize', function() {
      if (img && img.complete) {
        fitCanvases();
        redrawAll();
      }
    });

    // --- Initial load ---
    loadImage(${JSON.stringify(dataUrl)});
    ${defaultAgent ? `if (document.getElementById('agent-select')) { document.getElementById('agent-select').value = ${JSON.stringify(defaultAgent.id)}; }` : ''}
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this._onSend.dispose();
    this.panel?.dispose();
  }
}
