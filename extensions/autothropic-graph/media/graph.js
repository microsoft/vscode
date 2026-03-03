// @ts-check
/// <reference lib="dom" />

/**
 * Agent Graph — interactive node graph for multi-agent orchestration.
 * Ported from autothropic's GraphView.tsx + GraphNode.tsx + GraphEdge.tsx.
 *
 * Runs inside a VS Code webview. Communicates with the extension host
 * via vscode.postMessage / onDidReceiveMessage.
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const NODE_W = 180;
  const NODE_H = 100;
  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 2;
  const PORT_GAP = 20;
  const BACKWARD_MARGIN = 40;

  const CONDITION_LABELS = { all: '', 'code-changes': 'code', errors: 'err', 'summary-only': 'sum' };
  const AGENT_COLORS = ['#d97757','#539bf5','#57ab5a','#9d4edd','#D4A574','#f28482','#4cc9f0','#d4876a'];

  const ROLE_PRESETS = [
    { label: 'Leader', prompt: 'You are the team leader. Coordinate work across agents. Break down tasks, delegate to workers, and synthesize their outputs into a cohesive result.' },
    { label: 'Reviewer', prompt: 'You are a strict code reviewer. Review code for bugs, security issues, performance, and quality. Provide clear, actionable feedback.' },
    { label: 'Builder', prompt: 'You are a builder/implementer. Write clean, working code to complete the assigned task. Follow best practices and write tests when appropriate.' },
    { label: 'Tester', prompt: 'You are a QA tester. Write comprehensive tests, verify edge cases, and ensure code correctness. Report failures clearly with reproduction steps.' },
    { label: 'Debugger', prompt: 'You are a debugger. Investigate issues, trace root causes, and fix bugs. Use systematic debugging approaches and explain your findings.' },
    { label: 'Architect', prompt: 'You are a software architect. Design system architecture, define interfaces, plan technical approaches, and ensure consistency across the codebase.' },
    { label: 'Verifier', prompt: 'You are a verifier. Check that implementations match requirements, validate outputs, and confirm correctness before signing off.' },
    { label: 'Minion', prompt: 'You are a task executor. Follow instructions precisely, complete assigned work thoroughly, and report results concisely.' },
  ];

  /** @type {any[]} */ let sessions = [];
  /** @type {any[]} */ let edges = [];
  /** @type {Record<string, string[]>} */ let outputPreviews = {};
  /** @type {any} */ let goalState = null;
  /** @type {any} */ let orchestratorState = null;
  let zoom = 1;
  let panX = 0, panY = 0;
  let selectedId = null;
  let isPanning = false;
  let panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;

  // Edge connection drag state
  let connectFromId = null;
  let connectMouseX = 0, connectMouseY = 0;

  // Node drag state
  let dragNodeId = null;
  let dragStartX = 0, dragStartY = 0, dragOrigX = 0, dragOrigY = 0;

  // Pulse state
  const pulsingEdges = new Map(); // key -> timer

  // DOM refs
  const container = document.getElementById('graph-container');
  const edgeLayer = document.getElementById('edge-layer');
  const nodeLayer = document.getElementById('node-layer');
  const zoomLabel = document.getElementById('zoom-level');
  const statsEl = document.getElementById('stats');
  const instructionsEl = document.getElementById('instructions');
  const presetsDropdown = document.getElementById('presets-dropdown');
  const edgeMenu = document.getElementById('edge-menu');
  const contextMenu = document.getElementById('context-menu');
  const broadcastInput = document.getElementById('broadcast-input');
  const idleCountEl = document.getElementById('idle-count');
  const goalBar = document.getElementById('goal-bar');
  const goalPlanningEl = document.getElementById('goal-planning');
  const goalTasksEl = document.getElementById('goal-tasks');
  const goalActionsEl = document.getElementById('goal-actions');
  const goalProgressFill = document.getElementById('goal-progress-fill');
  const goalProgressText = document.getElementById('goal-progress-text');
  const goalPromptText = document.getElementById('goal-prompt-text');

  // --- Init ---
  vscode.postMessage({ type: 'ready' });

  // --- Message handling ---
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'update':
        sessions = msg.sessions || [];
        edges = msg.edges || [];
        outputPreviews = msg.outputPreviews || {};
        goalState = msg.goalState || null;
        orchestratorState = msg.orchestratorState || null;
        render();
        break;
      case 'edgePulse':
        pulseEdge(msg.fromId, msg.toId);
        break;
    }
  });

  // --- Render ---
  function render() {
    renderNodes();
    renderEdges();
    updateStats();
    updateInstructions();
    renderGoalBar();
    renderPipelineBar();
  }

  function renderNodes() {
    nodeLayer.innerHTML = '';
    for (const session of sessions) {
      const node = createNodeElement(session);
      nodeLayer.appendChild(node);
    }
  }

  function createNodeElement(session) {
    const isOrch = session.isOrchestrator;
    const needsInput = session.needsInput;
    let classes = 'graph-node';
    if (session.id === selectedId) classes += ' selected';
    if (session.status === 'paused') classes += ' paused';
    if (isOrch) classes += ' orchestrator';
    if (needsInput) classes += ' needs-input';
    const el = document.createElement('div');
    el.className = classes;
    el.style.left = session.graphPosition.x + 'px';
    el.style.top = session.graphPosition.y + 'px';
    el.dataset.nodeId = session.id;
    el.style.setProperty('--node-color', session.color);

    if (needsInput) {
      el.style.animation = 'input-pulse 1.5s ease-in-out infinite';
      el.style.setProperty('--pulse-color', '#d4a04a66');
    } else if (session.status === 'running') {
      el.style.animation = 'node-pulse 2s ease-in-out infinite';
      el.style.setProperty('--pulse-color', session.color + '66');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    header.style.backgroundColor = session.color + '15';
    header.style.borderBottom = '1px solid ' + session.color + '30';

    // Orchestrator crown icon
    if (isOrch) {
      const crown = document.createElement('span');
      crown.className = 'orchestrator-icon';
      crown.textContent = '★';
      header.appendChild(crown);
    }

    const dot = document.createElement('span');
    dot.className = 'status-dot' + (session.status === 'running' ? ' running' : '');
    dot.style.background = statusColor(session.status);
    header.appendChild(dot);

    // Needs-input bell icon
    if (needsInput) {
      const bell = document.createElement('span');
      bell.className = 'input-bell';
      bell.textContent = '🔔';
      bell.title = 'Needs your input';
      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        showInputModal(session);
      });
      header.appendChild(bell);
    }

    if (session.humanInLoop) {
      const eye = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      eye.setAttribute('width', '9');
      eye.setAttribute('height', '9');
      eye.setAttribute('viewBox', '0 0 24 24');
      eye.setAttribute('fill', 'none');
      eye.setAttribute('stroke', '#d4a04a');
      eye.setAttribute('stroke-width', '2.5');
      eye.setAttribute('stroke-linecap', 'round');
      eye.setAttribute('stroke-linejoin', 'round');
      eye.classList.add('hitl-icon');
      eye.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      header.appendChild(eye);
    }

    const name = document.createElement('span');
    name.className = 'node-name';
    name.textContent = session.name;
    header.appendChild(name);

    // Show task badge if linked to a goal
    if (session.taskId && goalState) {
      const task = (goalState.tasks || []).find(t => t.id === session.taskId);
      if (task) {
        const taskBadge = document.createElement('span');
        taskBadge.className = 'node-task-badge ' + task.status;
        taskBadge.textContent = taskIcon(task.status);
        taskBadge.title = `Task: ${task.title} (${task.status})`;
        header.appendChild(taskBadge);
      }
    }

    const status = document.createElement('span');
    status.className = 'node-status';
    status.textContent = session.status;
    header.appendChild(status);

    el.appendChild(header);

    // Body — live output, exited banner, or fallback
    const body = document.createElement('div');
    body.className = 'node-body';
    if (session.status === 'exited') {
      const exitedBanner = document.createElement('div');
      exitedBanner.className = 'node-exited';
      exitedBanner.textContent = 'Claude exited';
      body.appendChild(exitedBanner);
      const restartBtn = document.createElement('button');
      restartBtn.className = 'node-restart-btn';
      restartBtn.textContent = 'Restart';
      restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'restartSession', id: session.id });
      });
      body.appendChild(restartBtn);
    } else {
      const lines = outputPreviews[session.id];
      if (lines && lines.length > 0) {
        const output = document.createElement('div');
        output.className = 'node-output';
        for (const line of lines.slice(-3)) {
          const lineEl = document.createElement('div');
          lineEl.className = 'line';
          lineEl.textContent = line.slice(0, 120);
          output.appendChild(lineEl);
        }
        body.appendChild(output);
      } else {
        const empty = document.createElement('div');
        empty.className = 'node-empty';
        empty.textContent = session.systemPrompt ? session.systemPrompt.slice(0, 80) + (session.systemPrompt.length > 80 ? '...' : '') : 'Idle';
        body.appendChild(empty);
      }
    }
    el.appendChild(body);

    // Input port
    const inputPort = document.createElement('div');
    inputPort.className = 'port input';
    inputPort.dataset.port = 'input';
    inputPort.dataset.nodeId = session.id;
    el.appendChild(inputPort);

    // Output port
    const outputPort = document.createElement('div');
    outputPort.className = 'port output';
    outputPort.dataset.port = 'output';
    outputPort.dataset.nodeId = session.id;
    el.appendChild(outputPort);

    // Event listeners
    el.addEventListener('mousedown', (e) => onNodeMouseDown(e, session));
    el.addEventListener('dblclick', () => {
      vscode.postMessage({ type: 'focusTerminal', id: session.id });
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedId = session.id;
      renderNodes();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, session);
    });

    inputPort.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      if (connectFromId && connectFromId !== session.id) {
        vscode.postMessage({ type: 'addEdge', from: connectFromId, to: session.id });
        connectFromId = null;
        renderEdges();
      }
    });

    outputPort.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      connectFromId = session.id;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      connectMouseX = canvasPos.x;
      connectMouseY = canvasPos.y;
    });

    return el;
  }

  function renderEdges() {
    // Use SVG namespace
    const ns = 'http://www.w3.org/2000/svg';
    edgeLayer.innerHTML = '';

    // Defs
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('overflow', 'visible');
    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#d97757');
    marker.appendChild(polygon);
    defs.appendChild(marker);

    // Grid pattern
    const pattern = document.createElementNS(ns, 'pattern');
    pattern.setAttribute('id', 'grid');
    pattern.setAttribute('width', '20');
    pattern.setAttribute('height', '20');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const gridPath = document.createElementNS(ns, 'path');
    gridPath.setAttribute('d', 'M 20 0 L 0 0 0 20');
    gridPath.setAttribute('fill', 'none');
    gridPath.setAttribute('stroke', '#232320');
    gridPath.setAttribute('stroke-width', '0.5');
    pattern.appendChild(gridPath);
    defs.appendChild(pattern);
    edgeLayer.appendChild(defs);

    // Apply transform to SVG
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);

    // Grid background
    const gridRect = document.createElementNS(ns, 'rect');
    gridRect.setAttribute('x', '-5000');
    gridRect.setAttribute('y', '-5000');
    gridRect.setAttribute('width', '10000');
    gridRect.setAttribute('height', '10000');
    gridRect.setAttribute('fill', 'url(#grid)');
    g.appendChild(gridRect);

    // Edges
    for (const edge of edges) {
      const from = sessions.find(s => s.id === edge.from);
      const to = sessions.find(s => s.id === edge.to);
      if (!from || !to) continue;

      const x1 = from.graphPosition.x + NODE_W;
      const y1 = from.graphPosition.y + NODE_H / 2;
      const x2 = to.graphPosition.x;
      const y2 = to.graphPosition.y + NODE_H / 2;

      const pathD = buildEdgePath(x1, y1, x2, y2, from, to);
      const edgeKey = edge.from + '->' + edge.to;
      const isActive = pulsingEdges.has(edgeKey);

      // Shadow
      const shadow = document.createElementNS(ns, 'path');
      shadow.setAttribute('d', pathD);
      shadow.setAttribute('fill', 'none');
      shadow.setAttribute('stroke', '#000');
      shadow.setAttribute('stroke-width', '4');
      shadow.setAttribute('stroke-opacity', '0.2');
      g.appendChild(shadow);

      // Hit area
      const hitArea = document.createElementNS(ns, 'path');
      hitArea.setAttribute('d', pathD);
      hitArea.setAttribute('fill', 'none');
      hitArea.setAttribute('stroke', 'transparent');
      hitArea.setAttribute('stroke-width', '16');
      hitArea.style.cursor = 'context-menu';
      hitArea.style.pointerEvents = 'stroke';
      hitArea.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showEdgeMenu(e.clientX, e.clientY, edge);
      });
      g.appendChild(hitArea);

      // Main edge
      const edgePath = document.createElementNS(ns, 'path');
      edgePath.setAttribute('d', pathD);
      edgePath.setAttribute('fill', 'none');
      edgePath.setAttribute('stroke', isActive ? '#d97757' : '#5a5850');
      edgePath.setAttribute('stroke-width', isActive ? '3' : '2');
      if (!isActive) edgePath.setAttribute('stroke-dasharray', '6 4');
      edgePath.setAttribute('marker-end', 'url(#arrowhead)');
      edgePath.style.pointerEvents = 'none';
      edgePath.style.transition = 'stroke 0.3s, stroke-width 0.3s';
      g.appendChild(edgePath);

      // Animated pulse circle
      if (isActive) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#d97757');
        circle.setAttribute('opacity', '0.9');
        const motion = document.createElementNS(ns, 'animateMotion');
        motion.setAttribute('dur', '0.8s');
        motion.setAttribute('fill', 'freeze');
        motion.setAttribute('path', pathD);
        circle.appendChild(motion);
        const fadeAnim = document.createElementNS(ns, 'animate');
        fadeAnim.setAttribute('attributeName', 'opacity');
        fadeAnim.setAttribute('from', '0.9');
        fadeAnim.setAttribute('to', '0');
        fadeAnim.setAttribute('dur', '0.8s');
        fadeAnim.setAttribute('fill', 'freeze');
        circle.appendChild(fadeAnim);
        g.appendChild(circle);
      }

      // Label
      const condLabel = CONDITION_LABELS[edge.condition] || '';
      const iterLabel = edge.maxIterations > 0 ? `${edge.iterationCount}/${edge.maxIterations}` : '';
      const label = [condLabel, iterLabel].filter(Boolean).join(' ');
      if (label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 8;
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', String(midX));
        text.setAttribute('y', String(midY));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#888');
        text.setAttribute('font-size', '9');
        text.setAttribute('font-family', 'monospace');
        text.style.pointerEvents = 'none';
        text.textContent = label;
        g.appendChild(text);
      }
    }

    // Connect drag preview line
    if (connectFromId) {
      const from = sessions.find(s => s.id === connectFromId);
      if (from) {
        const x1 = from.graphPosition.x + NODE_W;
        const y1 = from.graphPosition.y + NODE_H / 2;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(connectMouseX));
        line.setAttribute('y2', String(connectMouseY));
        line.setAttribute('stroke', '#d97757');
        line.setAttribute('stroke-width', String(2 / zoom));
        line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('stroke-opacity', '0.6');
        g.appendChild(line);
      }
    }

    edgeLayer.appendChild(g);
  }

  function buildEdgePath(x1, y1, x2, y2, from, to) {
    const dx = x2 - x1;
    if (dx > -PORT_GAP) {
      const cpOffset = Math.max(Math.abs(dx) * 0.4, 40);
      return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
    }

    const fromTop = from.graphPosition.y;
    const fromBot = from.graphPosition.y + NODE_H;
    const toTop = to.graphPosition.y;
    const toBot = to.graphPosition.y + NODE_H;

    let minY = Infinity, maxY = -Infinity;
    for (const s of sessions) {
      minY = Math.min(minY, s.graphPosition.y);
      maxY = Math.max(maxY, s.graphPosition.y + NODE_H);
    }

    const spaceAbove = Math.min(fromTop, toTop) - minY;
    const spaceBelow = maxY - Math.max(fromBot, toBot);
    const routeAbove = spaceAbove >= spaceBelow - 20;

    const routeY = routeAbove
      ? Math.min(fromTop, toTop) - BACKWARD_MARGIN
      : Math.max(fromBot, toBot) + BACKWARD_MARGIN;

    const exitX = x1 + PORT_GAP;
    const entryX = x2 - PORT_GAP;
    const cornerR = 16;
    const vDir = routeAbove ? -1 : 1;

    return [
      `M ${x1} ${y1}`,
      `L ${exitX} ${y1}`,
      `Q ${exitX + cornerR} ${y1}, ${exitX + cornerR} ${y1 + vDir * cornerR}`,
      `L ${exitX + cornerR} ${routeY + (-vDir * cornerR)}`,
      `Q ${exitX + cornerR} ${routeY}, ${exitX} ${routeY}`,
      `L ${entryX} ${routeY}`,
      `Q ${entryX - cornerR} ${routeY}, ${entryX - cornerR} ${routeY + (-vDir * cornerR)}`,
      `L ${entryX - cornerR} ${y2 + (vDir * cornerR)}`,
      `Q ${entryX - cornerR} ${y2}, ${entryX} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ');
  }

  // --- Interactions ---

  function screenToCanvas(sx, sy) {
    const rect = container.getBoundingClientRect();
    return {
      x: (sx - rect.left - panX) / zoom,
      y: (sy - rect.top - panY) / zoom,
    };
  }

  // Pan: mousedown on background
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest('.graph-node') || target.closest('.port')) return;

    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    document.body.classList.add('grabbing');
    hideMenus();
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = panStartPanX + (e.clientX - panStartX);
      panY = panStartPanY + (e.clientY - panStartY);
      applyTransform();
    }
    if (dragNodeId) {
      const dx = (e.clientX - dragStartX) / zoom;
      const dy = (e.clientY - dragStartY) / zoom;
      const session = sessions.find(s => s.id === dragNodeId);
      if (session) {
        session.graphPosition.x = Math.max(0, dragOrigX + dx);
        session.graphPosition.y = Math.max(0, dragOrigY + dy);
        const nodeEl = document.querySelector(`[data-node-id="${dragNodeId}"]`);
        if (nodeEl) {
          nodeEl.style.left = session.graphPosition.x + 'px';
          nodeEl.style.top = session.graphPosition.y + 'px';
        }
        renderEdges();
      }
    }
    if (connectFromId) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      connectMouseX = canvasPos.x;
      connectMouseY = canvasPos.y;
      renderEdges();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      document.body.classList.remove('grabbing');
    }
    if (dragNodeId) {
      const session = sessions.find(s => s.id === dragNodeId);
      if (session) {
        vscode.postMessage({ type: 'updatePosition', id: dragNodeId, x: session.graphPosition.x, y: session.graphPosition.y });
      }
      dragNodeId = null;
    }
    if (connectFromId) {
      connectFromId = null;
      renderEdges();
    }
  });

  function onNodeMouseDown(e, session) {
    if (e.target.closest('.port')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragNodeId = session.id;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigX = session.graphPosition.x;
    dragOrigY = session.graphPosition.y;
    hideMenus();
  }

  // Wheel: zoom / pan
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = 1 - e.deltaY * 0.005;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomFactor));
      const scale = newZoom / zoom;
      panX = mouseX - scale * (mouseX - panX);
      panY = mouseY - scale * (mouseY - panY);
      zoom = newZoom;
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
    }
    applyTransform();
  }, { passive: false });

  function applyTransform() {
    nodeLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    renderEdges();
  }

  // --- Fit to view ---
  function fitToView() {
    if (sessions.length === 0) return;
    const rect = container.getBoundingClientRect();
    const padX = 60, padY = 40;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of sessions) {
      minX = Math.min(minX, s.graphPosition.x);
      minY = Math.min(minY, s.graphPosition.y);
      maxX = Math.max(maxX, s.graphPosition.x + NODE_W);
      maxY = Math.max(maxY, s.graphPosition.y + NODE_H);
    }

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const scaleX = (rect.width - padX * 2) / contentW;
    const scaleY = (rect.height - padY * 2) / contentH;
    zoom = Math.min(scaleX, scaleY, MAX_ZOOM, 1);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    panX = rect.width / 2 - cx * zoom;
    panY = rect.height / 2 - cy * zoom;
    applyTransform();
    renderNodes();
  }

  // --- Toolbar ---
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.3);
    const s = newZoom / zoom;
    panX = cx - s * (cx - panX);
    panY = cy - s * (cy - panY);
    zoom = newZoom;
    applyTransform();
    renderNodes();
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.3);
    const s = newZoom / zoom;
    panX = cx - s * (cx - panX);
    panY = cy - s * (cy - panY);
    zoom = newZoom;
    applyTransform();
    renderNodes();
  });

  document.getElementById('btn-fit').addEventListener('click', fitToView);

  document.getElementById('btn-add-agent').addEventListener('click', () => {
    vscode.postMessage({ type: 'spawnAgent' });
  });

  // --- Presets ---
  document.getElementById('btn-presets').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!presetsDropdown.classList.contains('hidden')) {
      presetsDropdown.classList.add('hidden');
      return;
    }
    presetsDropdown.innerHTML = '';
    const presets = [
      { id: 'pipeline', label: 'Pipeline', description: 'Sequential: A → B → C' },
      { id: 'star', label: 'Star (Leader + Workers)', description: 'Leader delegates to N workers' },
      { id: 'fan-out-fan-in', label: 'Fan-out / Fan-in', description: 'Source → parallel Workers → Aggregator' },
      { id: 'review-loop', label: 'Review Loop', description: 'Builder ↔ Reviewer with iteration cap' },
    ];
    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = 'preset-item';
      btn.innerHTML = `<div class="preset-label">${p.label}</div><div class="preset-desc">${p.description}</div>`;
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyTopology', presetId: p.id });
        presetsDropdown.classList.add('hidden');
        setTimeout(fitToView, 200);
      });
      presetsDropdown.appendChild(btn);
    }
    presetsDropdown.classList.remove('hidden');
  });

  // --- Broadcast bar ---
  document.getElementById('btn-pause-all').addEventListener('click', () => {
    vscode.postMessage({ type: 'pauseAll' });
  });
  document.getElementById('btn-resume-all').addEventListener('click', () => {
    vscode.postMessage({ type: 'resumeAll' });
  });
  document.getElementById('btn-send-all').addEventListener('click', () => {
    const msg = broadcastInput.value.trim();
    if (msg) {
      vscode.postMessage({ type: 'broadcast', message: msg });
      broadcastInput.value = '';
    }
  });
  broadcastInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const msg = broadcastInput.value.trim();
      if (msg) {
        vscode.postMessage({ type: 'broadcast', message: msg });
        broadcastInput.value = '';
      }
    }
  });

  // --- Edge context menu ---
  function showEdgeMenu(x, y, edge) {
    hideMenus();
    edgeMenu.innerHTML = '';

    const conditions = [
      { value: 'all', label: 'All output', desc: 'Always forward' },
      { value: 'code-changes', label: 'Code changes', desc: 'File modifications only' },
      { value: 'errors', label: 'Errors only', desc: 'Error/failure output' },
      { value: 'summary-only', label: 'Summary only', desc: 'Aggressive summarization' },
    ];

    const section1 = document.createElement('div');
    section1.className = 'menu-section';
    section1.textContent = 'CONDITION';
    edgeMenu.appendChild(section1);

    for (const c of conditions) {
      const btn = document.createElement('button');
      btn.className = 'menu-item' + (edge.condition === c.value ? ' active' : '');
      btn.textContent = c.label;
      btn.title = c.desc;
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'updateEdge', edgeId: edge.id, patch: { condition: c.value } });
        hideMenus();
      });
      edgeMenu.appendChild(btn);
    }

    edgeMenu.appendChild(createDivider());

    const section2 = document.createElement('div');
    section2.className = 'menu-section';
    section2.textContent = 'MAX ITERATIONS';
    edgeMenu.appendChild(section2);

    const iters = [0, 1, 2, 3, 5, 10];
    for (const n of iters) {
      const btn = document.createElement('button');
      btn.className = 'menu-item' + (edge.maxIterations === n ? ' active' : '');
      btn.textContent = n === 0 ? '∞ Unlimited' : String(n);
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'updateEdge', edgeId: edge.id, patch: { maxIterations: n } });
        hideMenus();
      });
      edgeMenu.appendChild(btn);
    }

    edgeMenu.appendChild(createDivider());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'menu-item destructive';
    deleteBtn.textContent = 'Delete edge';
    deleteBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'removeEdge', edgeId: edge.id });
      hideMenus();
    });
    edgeMenu.appendChild(deleteBtn);

    edgeMenu.style.left = x + 'px';
    edgeMenu.style.top = y + 'px';
    edgeMenu.classList.remove('hidden');
  }

  // --- Node context menu ---
  function showContextMenu(x, y, session) {
    hideMenus();
    contextMenu.innerHTML = '';

    // Rename
    const renameBtn = document.createElement('button');
    renameBtn.className = 'menu-item';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      const name = prompt('New name:', session.name);
      if (name) vscode.postMessage({ type: 'renameSession', id: session.id, name });
      hideMenus();
    });
    contextMenu.appendChild(renameBtn);

    // Set Role — section header
    const roleSection = document.createElement('div');
    roleSection.className = 'menu-section';
    roleSection.textContent = 'ROLE';
    contextMenu.appendChild(roleSection);

    // Role preset grid
    const roleGrid = document.createElement('div');
    roleGrid.className = 'role-grid';
    for (const preset of ROLE_PRESETS) {
      const chip = document.createElement('button');
      chip.className = 'role-chip';
      chip.textContent = preset.label;
      chip.addEventListener('click', () => {
        vscode.postMessage({ type: 'setRole', id: session.id, role: preset.prompt });
        vscode.postMessage({ type: 'renameSession', id: session.id, name: preset.label });
        hideMenus();
      });
      roleGrid.appendChild(chip);
    }
    contextMenu.appendChild(roleGrid);

    // Custom role
    const customRoleBtn = document.createElement('button');
    customRoleBtn.className = 'menu-item';
    customRoleBtn.textContent = 'Custom Role...';
    customRoleBtn.addEventListener('click', () => {
      const role = prompt('System prompt:', session.systemPrompt || '');
      if (role !== null) vscode.postMessage({ type: 'setRole', id: session.id, role });
      hideMenus();
    });
    contextMenu.appendChild(customRoleBtn);

    contextMenu.appendChild(createDivider());

    // Colors
    for (const c of AGENT_COLORS) {
      const btn = document.createElement('button');
      btn.className = 'menu-item' + (session.color === c ? ' active' : '');
      btn.textContent = '● ' + c;
      btn.style.color = c;
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'setColor', id: session.id, color: c });
        hideMenus();
      });
      contextMenu.appendChild(btn);
    }

    contextMenu.appendChild(createDivider());

    // HITL
    const hitlBtn = document.createElement('button');
    hitlBtn.className = 'menu-item';
    hitlBtn.textContent = session.humanInLoop ? '✓ HITL Enabled' : 'Enable HITL';
    hitlBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleHITL', id: session.id, enabled: !session.humanInLoop });
      hideMenus();
    });
    contextMenu.appendChild(hitlBtn);

    contextMenu.appendChild(createDivider());

    // Delete
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'menu-item destructive';
    deleteBtn.textContent = 'Delete Agent';
    deleteBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'removeSession', id: session.id });
      hideMenus();
    });
    contextMenu.appendChild(deleteBtn);

    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.remove('hidden');
  }

  function createDivider() {
    const div = document.createElement('div');
    div.className = 'menu-divider';
    return div;
  }

  function hideMenus() {
    edgeMenu.classList.add('hidden');
    contextMenu.classList.add('hidden');
    presetsDropdown.classList.add('hidden');
  }

  // Hide menus on click outside
  document.addEventListener('mousedown', (e) => {
    if (!edgeMenu.contains(e.target) && !contextMenu.contains(e.target) && !presetsDropdown.contains(e.target)) {
      hideMenus();
    }
  });

  // --- Edge pulse ---
  function pulseEdge(fromId, toId) {
    const key = fromId + '->' + toId;
    const existing = pulsingEdges.get(key);
    if (existing) clearTimeout(existing);
    pulsingEdges.set(key, setTimeout(() => {
      pulsingEdges.delete(key);
      renderEdges();
    }, 800));
    renderEdges();
  }

  // --- Stats ---
  function updateStats() {
    const active = sessions.filter(s => s.status === 'running').length;
    const idle = sessions.filter(s => s.status === 'waiting').length;
    statsEl.textContent = `${active} active · ${idle} idle`;
    idleCountEl.textContent = `${idle} idle`;
  }

  function updateInstructions() {
    if (sessions.length > 0 && edges.length === 0) {
      instructionsEl.classList.remove('hidden');
    } else {
      instructionsEl.classList.add('hidden');
    }
  }

  // --- Goal Bar ---
  function renderGoalBar() {
    if (!goalState) {
      goalBar.classList.add('hidden');
      goalPlanningEl.classList.add('hidden');
      container.style.top = '36px';
      return;
    }

    if (goalState.status === 'planning') {
      goalBar.classList.add('hidden');
      goalPlanningEl.classList.remove('hidden');
      container.style.top = '72px';
      return;
    }

    goalPlanningEl.classList.add('hidden');
    goalBar.classList.remove('hidden');
    container.style.top = '110px';

    const tasks = goalState.tasks || [];
    const doneCount = tasks.filter(t => t.status === 'done' || t.status === 'merged').length;
    const total = tasks.length;
    const pct = total > 0 ? (doneCount / total) * 100 : 0;

    goalPromptText.textContent = goalState.prompt.length > 60
      ? goalState.prompt.slice(0, 60) + '...'
      : goalState.prompt;
    goalProgressText.textContent = `${doneCount}/${total} tasks complete`;
    goalProgressFill.style.width = pct + '%';

    // Task chips
    goalTasksEl.innerHTML = '';
    for (const task of tasks) {
      const chip = document.createElement('div');
      chip.className = 'goal-task-chip ' + task.status;
      chip.title = task.description || task.title;

      const icon = document.createElement('span');
      icon.className = 'goal-task-icon';
      icon.textContent = taskIcon(task.status);
      chip.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = task.title.length > 20 ? task.title.slice(0, 20) + '...' : task.title;
      chip.appendChild(label);

      // Click to focus the agent's terminal
      if (task.assignedTo) {
        chip.style.cursor = 'pointer';
        chip.addEventListener('dblclick', () => {
          vscode.postMessage({ type: 'focusTerminal', id: task.assignedTo });
        });
      }

      goalTasksEl.appendChild(chip);
    }

    // Action buttons
    goalActionsEl.innerHTML = '';

    if (goalState.status === 'done' || doneCount === total) {
      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'goal-merge-btn';
      mergeBtn.textContent = 'Merge All';
      mergeBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'mergeAll', goalId: goalState.id });
      });
      goalActionsEl.appendChild(mergeBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'goal-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancelGoal', goalId: goalState.id });
    });
    goalActionsEl.appendChild(cancelBtn);
  }

  function taskIcon(status) {
    switch (status) {
      case 'pending': return '○';
      case 'assigned': return '◐';
      case 'running': return '●';
      case 'done': return '✓';
      case 'failed': return '✗';
      case 'merged': return '⊕';
      default: return '○';
    }
  }

  // --- Talk to Main Agent button ---
  const talkMainBtn = document.createElement('button');
  talkMainBtn.id = 'btn-talk-main';
  talkMainBtn.textContent = '💬 Main Agent';
  talkMainBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'focusOrchestrator' });
  });
  document.getElementById('info-bar').insertBefore(talkMainBtn, document.getElementById('btn-presets'));

  // --- Set Goal button ---
  const goalInputVisible = { value: false };
  const setGoalBtn = document.createElement('button');
  setGoalBtn.id = 'btn-set-goal';
  setGoalBtn.textContent = '⚡ Set Goal';
  document.getElementById('info-bar').insertBefore(setGoalBtn, document.getElementById('btn-add-agent'));

  const goalInputContainer = document.createElement('div');
  goalInputContainer.id = 'goal-input-container';
  goalInputContainer.className = 'hidden';
  goalInputContainer.innerHTML = `
    <input id="goal-input" type="text" placeholder="Describe your goal..." />
    <button id="btn-goal-go">Go</button>
    <button id="btn-goal-cancel-input">✕</button>
  `;
  document.getElementById('info-bar').parentElement.appendChild(goalInputContainer);

  setGoalBtn.addEventListener('click', () => {
    if (goalState) {
      vscode.postMessage({ type: 'cancelGoal', goalId: goalState.id });
      return;
    }
    goalInputContainer.classList.toggle('hidden');
    if (!goalInputContainer.classList.contains('hidden')) {
      document.getElementById('goal-input').focus();
    }
  });

  goalInputContainer.addEventListener('click', (e) => e.stopPropagation());

  const submitGoal = () => {
    const input = document.getElementById('goal-input');
    const prompt = input.value.trim();
    if (prompt) {
      vscode.postMessage({ type: 'startGoal', prompt });
      input.value = '';
      goalInputContainer.classList.add('hidden');
    }
  };

  // Delegate events for dynamically created elements
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-goal-go') submitGoal();
    if (e.target.id === 'btn-goal-cancel-input') goalInputContainer.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    const goalInput = document.getElementById('goal-input');
    if (goalInput && document.activeElement === goalInput) {
      if (e.key === 'Enter') { e.preventDefault(); submitGoal(); }
      if (e.key === 'Escape') { goalInputContainer.classList.add('hidden'); }
    }
  });

  // --- Pipeline Progress Bar ---
  function renderPipelineBar() {
    let pipelineBar = document.getElementById('pipeline-bar');
    if (!orchestratorState || !orchestratorState.planActive) {
      if (pipelineBar) pipelineBar.classList.add('hidden');
      return;
    }

    if (!pipelineBar) {
      pipelineBar = document.createElement('div');
      pipelineBar.id = 'pipeline-bar';
      document.body.appendChild(pipelineBar);
    }
    pipelineBar.classList.remove('hidden');
    pipelineBar.innerHTML = '';

    const stage = orchestratorState.currentStage;
    const taskIdx = orchestratorState.currentTaskIndex;
    const total = orchestratorState.totalTasks;
    const pending = orchestratorState.pendingInputCount;

    // Stage label
    const stageLabel = document.createElement('span');
    stageLabel.className = 'pipeline-stage';
    stageLabel.textContent = `Stage: ${stage}`;
    pipelineBar.appendChild(stageLabel);

    // Task progress
    const taskLabel = document.createElement('span');
    taskLabel.className = 'pipeline-tasks';
    taskLabel.textContent = total > 0 ? `Task ${Math.min(taskIdx + 1, total)}/${total}` : '';
    pipelineBar.appendChild(taskLabel);

    // Pending input indicator
    if (pending > 0) {
      const inputLabel = document.createElement('span');
      inputLabel.className = 'pipeline-input-needed';
      inputLabel.textContent = `⚠ ${pending} needs input`;
      pipelineBar.appendChild(inputLabel);
    }

    // Talk to Main Agent button
    const talkBtn = document.createElement('button');
    talkBtn.className = 'pipeline-talk-btn';
    talkBtn.textContent = '💬 Main Agent';
    talkBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'focusOrchestrator' });
    });
    pipelineBar.appendChild(talkBtn);
  }

  // --- Input Modal ---
  function showInputModal(session) {
    // Remove existing modal if any
    let existing = document.getElementById('input-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'input-modal';

    const lines = outputPreviews[session.id] || [];
    const context = lines.slice(-3).join('\n') || 'Agent is waiting for input...';

    modal.innerHTML = `
      <div class="input-modal-header">
        <span class="input-modal-dot" style="background: ${session.color}"></span>
        <span class="input-modal-name">${session.name}</span>
        <button class="input-modal-close">✕</button>
      </div>
      <div class="input-modal-context">${escapeHtml(context)}</div>
      <div class="input-modal-row">
        <input class="input-modal-field" type="text" placeholder="Type your response..." autofocus />
        <button class="input-modal-send">Send</button>
      </div>
      <button class="input-modal-terminal">Open Terminal</button>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector('.input-modal-field');
    const sendBtn = modal.querySelector('.input-modal-send');
    const closeBtn = modal.querySelector('.input-modal-close');
    const termBtn = modal.querySelector('.input-modal-terminal');

    const send = () => {
      const val = input.value.trim();
      if (val) {
        vscode.postMessage({ type: 'sendInput', sessionId: session.id, input: val });
        modal.remove();
      }
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
      if (e.key === 'Escape') modal.remove();
    });
    closeBtn.addEventListener('click', () => modal.remove());
    termBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'focusTerminal', id: session.id });
      modal.remove();
    });

    setTimeout(() => input.focus(), 50);
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Helpers ---
  function statusColor(status) {
    switch (status) {
      case 'running': return '#57ab5a';
      case 'waiting': return '#539bf5';
      case 'paused': return '#d4a04a';
      case 'error': return '#e5534b';
      case 'exited': return '#e5534b';
      default: return '#7a7870';
    }
  }

  // Initial fit after first data load
  let firstLoad = true;
  const originalRender = render;
  render = function () {
    originalRender();
    if (firstLoad && sessions.length > 0) {
      firstLoad = false;
      setTimeout(fitToView, 50);
    }
  };
})();
