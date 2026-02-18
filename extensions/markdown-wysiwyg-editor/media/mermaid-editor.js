/**
 * Mermaid WYSIWYG Diagram Editor
 * Provides visual property editing for flowchart, pie chart, and sequence diagrams.
 * Falls back to source editing for unsupported diagram types.
 */
window.MermaidDiagramEditor = (function () {
	'use strict';

	let renderCounter = 0;

	// ===== Utilities =====

	function escapeHtml(str) {
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function el(tag, cls, children) {
		const e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (typeof children === 'string') { e.textContent = children; }
		else if (Array.isArray(children)) { children.forEach(c => { if (c) { e.appendChild(c); } }); }
		return e;
	}

	function inputEl(cls, value, placeholder) {
		const e = document.createElement('input');
		e.type = 'text';
		e.className = 'mw-input' + (cls ? ' ' + cls : '');
		e.value = value || '';
		if (placeholder) { e.placeholder = placeholder; }
		return e;
	}

	function selectEl(cls, options, selected) {
		const e = document.createElement('select');
		e.className = 'mw-select' + (cls ? ' ' + cls : '');
		options.forEach(opt => {
			const o = document.createElement('option');
			o.value = opt.value;
			o.textContent = opt.label;
			if (opt.value === selected) { o.selected = true; }
			e.appendChild(o);
		});
		return e;
	}

	function generateNodeId(existingIds) {
		for (let i = 0; i < 26; i++) {
			const id = String.fromCharCode(65 + i);
			if (!existingIds.has(id)) { return id; }
		}
		for (let i = 0; i < 26; i++) {
			for (let j = 0; j < 26; j++) {
				const id = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
				if (!existingIds.has(id)) { return id; }
			}
		}
		return 'N' + Date.now();
	}

	// ===== Type Detection =====

	function detectType(source) {
		const first = source.trim().split('\n')[0].trim().toLowerCase();
		if (/^(graph|flowchart)\s/i.test(first)) { return 'flowchart'; }
		if (/^sequencediagram/i.test(first)) { return 'sequence'; }
		if (/^pie/i.test(first)) { return 'pie'; }
		if (/^classDiagram/i.test(first)) { return 'class'; }
		if (/^stateDiagram/i.test(first)) { return 'state'; }
		if (/^erDiagram/i.test(first)) { return 'er'; }
		if (/^gantt/i.test(first)) { return 'gantt'; }
		if (/^xychart-beta/i.test(first)) { return 'bar'; }
		return 'unknown';
	}

	// ===== Flowchart Parser/Builder =====

	const SHAPE_OPTIONS = [
		{ value: 'rect', label: 'Rectangle [...]' },
		{ value: 'rounded', label: 'Rounded (...)' },
		{ value: 'diamond', label: 'Diamond {...}' },
		{ value: 'circle', label: 'Circle ((...))' },
		{ value: 'stadium', label: 'Stadium ([...])' },
		{ value: 'hexagon', label: 'Hexagon {{...}}' },
		{ value: 'subroutine', label: 'Subroutine [[...]]' },
		{ value: 'cylinder', label: 'Cylinder [(...)' },
	];

	const EDGE_TYPE_OPTIONS = [
		{ value: '-->', label: 'Arrow  -->' },
		{ value: '---', label: 'Line  ---' },
		{ value: '-.->', label: 'Dotted  -.->' },
		{ value: '==>', label: 'Thick  ==>' },
	];

	const DIRECTION_OPTIONS = [
		{ value: 'TD', label: 'Top Down (TD)' },
		{ value: 'LR', label: 'Left Right (LR)' },
		{ value: 'BT', label: 'Bottom Top (BT)' },
		{ value: 'RL', label: 'Right Left (RL)' },
	];

	function parseNodeRef(raw) {
		raw = raw.trim();
		const patterns = [
			{ shape: 'circle', re: /^([\w]+)\(\((.+)\)\)$/ },
			{ shape: 'stadium', re: /^([\w]+)\(\[(.+)\]\)$/ },
			{ shape: 'subroutine', re: /^([\w]+)\[\[(.+)\]\]$/ },
			{ shape: 'cylinder', re: /^([\w]+)\[\((.+)\)\]$/ },
			{ shape: 'hexagon', re: /^([\w]+)\{\{(.+)\}\}$/ },
			{ shape: 'diamond', re: /^([\w]+)\{(.+)\}$/ },
			{ shape: 'rounded', re: /^([\w]+)\(([^[\]]+)\)$/ },
			{ shape: 'rect', re: /^([\w]+)\[([^\[]+)\]$/ },
		];
		for (const { shape, re } of patterns) {
			const m = raw.match(re);
			if (m) { return { id: m[1], label: m[2], shape }; }
		}
		const idMatch = raw.match(/^([\w]+)$/);
		if (idMatch) { return { id: idMatch[1], label: idMatch[1], shape: 'rect' }; }
		return null;
	}

	function buildNodeRef(node) {
		const shapes = {
			rect: ['[', ']'], rounded: ['(', ')'], diamond: ['{', '}'],
			circle: ['((', '))'], stadium: ['([', '])'], subroutine: ['[[', ']]'],
			cylinder: ['[(', ')]'], hexagon: ['{{', '}}'],
		};
		const s = shapes[node.shape] || shapes.rect;
		return node.id + s[0] + node.label + s[1];
	}

	function parseFlowchartLine(line) {
		const tokens = [];
		const edgeRe = /(-->|---|-\.->|==>)(\|[^|]*\|)?/g;
		let lastIdx = 0;
		let m;
		while ((m = edgeRe.exec(line)) !== null) {
			const before = line.substring(lastIdx, m.index).trim();
			if (before) { tokens.push({ type: 'node', raw: before }); }
			const label = m[2] ? m[2].slice(1, -1) : '';
			tokens.push({ type: 'edge', op: m[1], label });
			lastIdx = m.index + m[0].length;
		}
		const after = line.substring(lastIdx).trim();
		if (after) { tokens.push({ type: 'node', raw: after }); }
		return tokens;
	}

	function parseFlowchart(source) {
		const lines = source.split('\n');
		const firstLine = lines[0].trim();
		const headerMatch = firstLine.match(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
		if (!headerMatch) { return null; }

		const keyword = headerMatch[1];
		const direction = headerMatch[2].toUpperCase();
		const nodes = new Map();
		const edges = [];
		const subgraphs = [];
		const subgraphStack = []; // stack for nested subgraphs

		const registerNode = (ref, subgraphId) => {
			if (!ref) { return; }
			if (nodes.has(ref.id)) {
				if (ref.label !== ref.id) {
					const existing = nodes.get(ref.id);
					existing.label = ref.label;
					existing.shape = ref.shape;
				}
				if (subgraphId && !nodes.get(ref.id).subgraph) {
					nodes.get(ref.id).subgraph = subgraphId;
				}
			} else {
				nodes.set(ref.id, { id: ref.id, label: ref.label, shape: ref.shape, subgraph: subgraphId || '' });
			}
		};

		for (let i = 1; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (!trimmed || trimmed.startsWith('%%')) { continue; }

			// Subgraph start: "subgraph Title" or "subgraph id [Title]"
			const subMatch = trimmed.match(/^subgraph\s+(.+)$/i);
			if (subMatch) {
				let sgTitle = subMatch[1].trim();
				let sgId = '';
				// "subgraph id [Title]" form
				const bracketMatch = sgTitle.match(/^(\S+)\s+\[(.+)\]$/);
				if (bracketMatch) {
					sgId = bracketMatch[1];
					sgTitle = bracketMatch[2];
				} else {
					sgId = sgTitle.replace(/\s+/g, '_');
				}
				subgraphs.push({ id: sgId, title: sgTitle });
				subgraphStack.push(sgId);
				continue;
			}

			// Subgraph end
			if (/^end$/i.test(trimmed)) {
				subgraphStack.pop();
				continue;
			}

			// Skip style/classDef/etc.
			if (/^(style|classDef|class|linkStyle|click|direction)\b/i.test(trimmed)) {
				continue;
			}

			const currentSubgraph = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : '';

			const tokens = parseFlowchartLine(trimmed);
			const nodeTokens = tokens.filter(t => t.type === 'node');
			const edgeTokens = tokens.filter(t => t.type === 'edge');

			for (const nt of nodeTokens) {
				const ref = parseNodeRef(nt.raw);
				// Skip invisible placeholder nodes generated for empty subgraphs
				if (ref && ref.id.endsWith('_placeholder')) { continue; }
				registerNode(ref, currentSubgraph);
			}

			for (let j = 0; j < edgeTokens.length; j++) {
				if (j < nodeTokens.length && j + 1 < nodeTokens.length) {
					const fromRef = parseNodeRef(nodeTokens[j].raw);
					const toRef = parseNodeRef(nodeTokens[j + 1].raw);
					if (fromRef && toRef) {
						edges.push({ from: fromRef.id, to: toRef.id, label: edgeTokens[j].label, type: edgeTokens[j].op });
					}
				}
			}
		}

		return { type: 'flowchart', keyword, direction, nodes: [...nodes.values()], edges, subgraphs };
	}

	function buildFlowchart(data) {
		const kw = data.keyword || 'graph';
		let result = kw + ' ' + data.direction + '\n';
		const defined = new Set();
		const subgraphs = data.subgraphs || [];

		// Helper: emit a node definition (first occurrence gets shape/label)
		function nodeStr(nodeId) {
			if (defined.has(nodeId)) { return nodeId; }
			defined.add(nodeId);
			const node = data.nodes.find(n => n.id === nodeId);
			return node ? buildNodeRef(node) : nodeId;
		}

		// Emit subgraphs with their member nodes and intra-subgraph edges
		for (const sg of subgraphs) {
			const memberNodes = data.nodes.filter(n => n.subgraph === sg.id);
			if (sg.id === sg.title || sg.title === sg.id.replace(/_/g, ' ')) {
				result += '    subgraph ' + sg.title + '\n';
			} else {
				result += '    subgraph ' + sg.id + ' [' + sg.title + ']\n';
			}
			// Emit member node declarations
			if (memberNodes.length === 0) {
				// Add invisible placeholder so Mermaid renders a cluster box
				result += '        ' + sg.id + '_placeholder[ ]:::mw-invisible\n';
			}
			for (const node of memberNodes) {
				result += '        ' + nodeStr(node.id) + '\n';
			}
			// Emit edges where both endpoints are in this subgraph
			const memberIds = new Set(memberNodes.map(n => n.id));
			for (const edge of data.edges) {
				if (memberIds.has(edge.from) && memberIds.has(edge.to)) {
					let edgeStr = ' ' + edge.type;
					if (edge.label) { edgeStr += '|' + edge.label + '|'; }
					edgeStr += ' ';
					result += '        ' + nodeStr(edge.from) + edgeStr + nodeStr(edge.to) + '\n';
				}
			}
			result += '    end\n';
		}

		// Add invisible class definition for placeholder nodes
		if (subgraphs.some(sg => data.nodes.filter(n => n.subgraph === sg.id).length === 0)) {
			result += '    classDef mw-invisible fill:none,stroke:none,color:transparent,font-size:0\n';
		}

		// Emit remaining edges (cross-subgraph or unassigned)
		const sgNodeIds = new Set(data.nodes.filter(n => n.subgraph).map(n => n.id));
		for (const edge of data.edges) {
			// Skip edges already emitted inside a subgraph
			const fromNode = data.nodes.find(n => n.id === edge.from);
			const toNode = data.nodes.find(n => n.id === edge.to);
			if (fromNode && toNode && fromNode.subgraph && fromNode.subgraph === toNode.subgraph) { continue; }
			let edgeStr = ' ' + edge.type;
			if (edge.label) { edgeStr += '|' + edge.label + '|'; }
			edgeStr += ' ';
			result += '    ' + nodeStr(edge.from) + edgeStr + nodeStr(edge.to) + '\n';
		}

		// Emit remaining unconnected nodes
		for (const node of data.nodes) {
			if (!defined.has(node.id)) {
				result += '    ' + buildNodeRef(node) + '\n';
			}
		}

		return result.trimEnd();
	}

	// ===== Pie Chart Parser/Builder =====

	function parsePie(source) {
		const lines = source.split('\n');
		let title = '';
		let showData = false;
		const slices = [];

		for (const line of lines) {
			const trimmed = line.trim();
			const titleMatch = trimmed.match(/^pie\s+(?:showData\s+)?title\s+(.+)$/i);
			if (titleMatch) { title = titleMatch[1].trim(); continue; }
			if (/^pie\s+showData/i.test(trimmed)) { showData = true; continue; }
			if (/^pie$/i.test(trimmed)) { continue; }
			const sliceMatch = trimmed.match(/^"([^"]+)"\s*:\s*([\d.]+)$/);
			if (sliceMatch) {
				slices.push({ label: sliceMatch[1], value: parseFloat(sliceMatch[2]) });
			}
		}

		return { type: 'pie', title, showData, slices };
	}

	function buildPie(data) {
		let result = 'pie';
		if (data.showData) { result += ' showData'; }
		if (data.title) { result += ' title ' + data.title; }
		result += '\n';
		for (const slice of data.slices) {
			result += '    "' + slice.label + '" : ' + slice.value + '\n';
		}
		return result.trimEnd();
	}

	// ===== Sequence Diagram Parser/Builder =====

	const SEQ_MSG_OPTIONS = [
		{ value: '->>', label: 'Solid Arrow ->>'},
		{ value: '-->>', label: 'Dotted Arrow -->>'},
		{ value: '->', label: 'Solid Line ->'},
		{ value: '-->', label: 'Dotted Line -->'},
		{ value: '-x', label: 'Cross -x'},
		{ value: '--x', label: 'Dotted Cross --x'},
	];

	function parseSequence(source) {
		const lines = source.split('\n');
		const participants = [];
		const messages = [];
		const rawLines = [];

		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (i === 0 && /^sequenceDiagram/i.test(trimmed)) { continue; }

			const partMatch = trimmed.match(/^participant\s+(\S+)(?:\s+as\s+(.+))?$/i);
			if (partMatch) {
				participants.push({ name: partMatch[1], alias: partMatch[2] || '' });
				continue;
			}

			const actorMatch = trimmed.match(/^actor\s+(\S+)(?:\s+as\s+(.+))?$/i);
			if (actorMatch) {
				participants.push({ name: actorMatch[1], alias: actorMatch[2] || '', isActor: true });
				continue;
			}

			const msgMatch = trimmed.match(/^(\S+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\+?\-?\s*(\S+)\s*:\s*(.+)$/);
			if (msgMatch) {
				messages.push({
					from: msgMatch[1], to: msgMatch[3],
					text: msgMatch[4].trim(), msgType: msgMatch[2]
				});
				continue;
			}

			// Preserve everything else (notes, loops, alt, etc.)
			rawLines.push(lines[i]);
		}

		return { type: 'sequence', participants, messages, rawLines };
	}

	function buildSequence(data) {
		let result = 'sequenceDiagram\n';

		for (const p of data.participants) {
			const keyword = p.isActor ? 'actor' : 'participant';
			let line = '    ' + keyword + ' ' + p.name;
			if (p.alias) { line += ' as ' + p.alias; }
			result += line + '\n';
		}

		// Re-insert raw lines (notes, loops, etc.) before messages
		for (const raw of data.rawLines) {
			result += raw + '\n';
		}

		for (const msg of data.messages) {
			result += '    ' + msg.from + msg.msgType + msg.to + ': ' + msg.text + '\n';
		}

		return result.trimEnd();
	}

	// ===== State Diagram Parser/Builder =====

	const STATE_DIRECTION_OPTIONS = [
		{ value: 'TB', label: 'Top to Bottom (TB)' },
		{ value: 'LR', label: 'Left to Right (LR)' },
		{ value: 'BT', label: 'Bottom to Top (BT)' },
		{ value: 'RL', label: 'Right to Left (RL)' },
	];

	function parseState(source) {
		const lines = source.split('\n');
		const firstLine = lines[0].trim();
		if (!/^stateDiagram(-v2)?/i.test(firstLine)) { return null; }

		const version = firstLine.match(/stateDiagram(-v2)?/i)[0];
		const states = new Map();
		const transitions = [];
		const rawLines = [];
		let direction = '';

		const ensureState = (name) => {
			if (name === '[*]') { return; } // start/end pseudo-state
			if (!states.has(name)) {
				states.set(name, { id: name, label: '', description: '' });
			}
		};

		for (let i = 1; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (!trimmed || trimmed.startsWith('%%')) { continue; }

			// Direction
			const dirMatch = trimmed.match(/^direction\s+(TB|BT|LR|RL)$/i);
			if (dirMatch) { direction = dirMatch[1].toUpperCase(); continue; }

			// State description: state "Description" as StateName
			const stateDescMatch = trimmed.match(/^state\s+"([^"]+)"\s+as\s+(\S+)$/i);
			if (stateDescMatch) {
				const label = stateDescMatch[1];
				const id = stateDescMatch[2];
				ensureState(id);
				states.get(id).label = label;
				continue;
			}

			// Transition: StateA --> StateB : label
			const transMatch = trimmed.match(/^(\S+)\s*-->\s*(\S+)(?:\s*:\s*(.+))?$/);
			if (transMatch) {
				const from = transMatch[1];
				const to = transMatch[2];
				const label = transMatch[3] ? transMatch[3].trim() : '';
				ensureState(from);
				ensureState(to);
				transitions.push({ from, to, label });
				continue;
			}

			// State with note or simple state declaration
			const stateSimple = trimmed.match(/^state\s+(\S+)$/i);
			if (stateSimple) {
				ensureState(stateSimple[1]);
				continue;
			}

			// Preserve everything else (notes, composite states, etc.)
			rawLines.push(lines[i]);
		}

		return { type: 'state', version, direction, states: [...states.values()], transitions, rawLines };
	}

	function buildState(data) {
		let result = data.version + '\n';

		if (data.direction) {
			result += '    direction ' + data.direction + '\n';
		}

		// State descriptions/declarations
		const referencedStates = new Set();
		for (const t of data.transitions) {
			if (t.from !== '[*]') { referencedStates.add(t.from); }
			if (t.to !== '[*]') { referencedStates.add(t.to); }
		}
		for (const state of data.states) {
			if (state.label) {
				result += '    state "' + state.label + '" as ' + state.id + '\n';
			} else if (!referencedStates.has(state.id)) {
				// Declare unreferenced states so they appear in the diagram
				result += '    state ' + state.id + '\n';
			}
		}

		// Raw lines (notes, composite states, etc.)
		for (const raw of data.rawLines) {
			result += raw + '\n';
		}

		// Transitions
		for (const t of data.transitions) {
			let line = '    ' + t.from + ' --> ' + t.to;
			if (t.label) { line += ' : ' + t.label; }
			result += line + '\n';
		}

		return result.trimEnd();
	}

	// ===== Bar Chart (xychart-beta) Parser/Builder =====

	function parseBarChart(source) {
		const lines = source.split('\n');
		const firstLine = lines[0].trim();
		if (!/^xychart-beta/i.test(firstLine)) { return null; }

		const horizontal = /^xychart-beta\s+horizontal/i.test(firstLine);
		let title = '';
		let xAxisLabel = '';
		let xCategories = [];
		let yAxisLabel = '';
		let yMin = null;
		let yMax = null;
		const bars = [];
		const lineData = [];
		const rawLines = [];

		for (let i = 1; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (!trimmed || trimmed.startsWith('%%')) { continue; }

			// title "text"
			const titleMatch = trimmed.match(/^title\s+"([^"]*)"/i);
			if (titleMatch) { title = titleMatch[1]; continue; }

			// x-axis with optional label and categories or numeric range
			const xAxisMatch = trimmed.match(/^x-axis/i);
			if (xAxisMatch) {
				const rest = trimmed.substring(6).trim();
				// Extract optional label in quotes
				let remaining = rest;
				const labelMatch = remaining.match(/^"([^"]*)"\s*/);
				if (labelMatch) {
					xAxisLabel = labelMatch[1];
					remaining = remaining.substring(labelMatch[0].length);
				}
				// Extract categories [item1, item2, ...]
				const catMatch = remaining.match(/\[([^\]]*)\]/);
				if (catMatch) {
					xCategories = catMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
				}
				continue;
			}

			// y-axis with optional label and optional range
			const yAxisMatchTest = trimmed.match(/^y-axis/i);
			if (yAxisMatchTest) {
				const rest = trimmed.substring(6).trim();
				let remaining = rest;
				const labelMatch = remaining.match(/^"([^"]*)"\s*/);
				if (labelMatch) {
					yAxisLabel = labelMatch[1];
					remaining = remaining.substring(labelMatch[0].length);
				}
				const rangeMatch = remaining.match(/([\d.]+)\s*-->\s*([\d.]+)/);
				if (rangeMatch) {
					yMin = parseFloat(rangeMatch[1]);
					yMax = parseFloat(rangeMatch[2]);
				}
				continue;
			}

			// bar [val1, val2, ...]
			const barMatch = trimmed.match(/^bar\s*\[([^\]]*)\]/i);
			if (barMatch) {
				const values = barMatch[1].split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
				bars.push({ values });
				continue;
			}

			// line [val1, val2, ...]
			const lineMatch = trimmed.match(/^line\s*\[([^\]]*)\]/i);
			if (lineMatch) {
				const values = lineMatch[1].split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
				lineData.push({ values });
				continue;
			}

			// Preserve everything else
			rawLines.push(lines[i]);
		}

		return {
			type: 'bar', title, horizontal,
			xAxisLabel, xCategories,
			yAxisLabel, yMin, yMax,
			bars, lines: lineData, rawLines
		};
	}

	function buildBarChart(data) {
		let result = 'xychart-beta';
		if (data.horizontal) { result += ' horizontal'; }
		result += '\n';

		if (data.title) {
			result += '    title "' + data.title + '"\n';
		}

		// x-axis
		if (data.xCategories && data.xCategories.length > 0) {
			let xLine = '    x-axis';
			if (data.xAxisLabel) { xLine += ' "' + data.xAxisLabel + '"'; }
			xLine += ' [' + data.xCategories.join(', ') + ']';
			result += xLine + '\n';
		}

		// y-axis
		if (data.yAxisLabel || data.yMin !== null || data.yMax !== null) {
			let yLine = '    y-axis';
			if (data.yAxisLabel) { yLine += ' "' + data.yAxisLabel + '"'; }
			if (data.yMin !== null && data.yMax !== null) {
				yLine += ' ' + data.yMin + ' --> ' + data.yMax;
			}
			result += yLine + '\n';
		}

		// Raw lines (preserved unknown directives)
		for (const raw of data.rawLines) {
			result += raw + '\n';
		}

		// bar data
		for (const b of data.bars) {
			result += '    bar [' + b.values.join(', ') + ']\n';
		}

		// line data
		for (const l of data.lines) {
			result += '    line [' + l.values.join(', ') + ']\n';
		}

		return result.trimEnd();
	}

	// ===== Interactive Inline Editing =====

	let activePopover = null;
	let _seqDragJustCompleted = false;

	function dismissPopover() {
		if (activePopover) { activePopover.remove(); activePopover = null; }
	}

	function showPopoverAt(container, anchorEl, formContent) {
		dismissPopover();
		const popover = el('div', 'mw-popover');
		popover.appendChild(formContent);
		popover.addEventListener('click', e => e.stopPropagation());
		popover.addEventListener('mousedown', e => e.stopPropagation());
		container.appendChild(popover);
		activePopover = popover;

		const containerRect = container.getBoundingClientRect();
		const anchorRect = anchorEl.getBoundingClientRect();
		let left = anchorRect.left - containerRect.left + anchorRect.width / 2;
		let top = anchorRect.bottom - containerRect.top + 10;
		popover.style.left = left + 'px';
		popover.style.top = top + 'px';

		requestAnimationFrame(() => {
			const popRect = popover.getBoundingClientRect();
			if (popRect.right > containerRect.right - 8) {
				popover.style.left = Math.max(8, containerRect.width - popRect.width - 8) + 'px';
				popover.style.transform = 'none';
			}
			if (popRect.left < containerRect.left + 8) {
				popover.style.left = '8px';
				popover.style.transform = 'none';
			}
			if (popRect.bottom > containerRect.bottom - 8) {
				popover.style.top = (anchorRect.top - containerRect.top - popRect.height - 10) + 'px';
			}
		});

		setTimeout(() => {
			const firstInput = popover.querySelector('input[type="text"]');
			if (firstInput) { firstInput.focus(); firstInput.select(); }
		}, 50);
		return popover;
	}

	function buildPopoverForm(fields, onDone, onDelete) {
		const form = el('div', 'mw-popover-form');
		fields.forEach(field => {
			const row = el('div', 'mw-popover-field');
			if (field.label) { row.appendChild(el('span', 'mw-popover-label', field.label)); }
			if (field.type === 'select') {
				const sel = selectEl('mw-popover-select', field.options, field.value);
				sel.addEventListener('change', () => field.onChange(sel.value));
				row.appendChild(sel);
			} else if (field.type === 'number') {
				const inp = inputEl('mw-popover-input', String(field.value), field.placeholder || '');
				inp.type = 'number'; inp.min = '0'; inp.step = 'any';
				inp.addEventListener('input', () => field.onChange(inp.value));
				inp.addEventListener('keydown', e => {
					if (e.key === 'Enter') { e.preventDefault(); onDone(); }
					if (e.key === 'Escape') { e.preventDefault(); dismissPopover(); }
				});
				row.appendChild(inp);
			} else {
				const inp = inputEl('mw-popover-input', field.value, field.placeholder || '');
				inp.addEventListener('input', () => field.onChange(inp.value));
				inp.addEventListener('keydown', e => {
					if (e.key === 'Enter') { e.preventDefault(); onDone(); }
					if (e.key === 'Escape') { e.preventDefault(); dismissPopover(); }
				});
				row.appendChild(inp);
			}
			form.appendChild(row);
		});
		const actions = el('div', 'mw-popover-actions');
		if (onDelete) {
			const delBtn = el('button', 'mw-popover-delete-btn', 'Delete');
			delBtn.addEventListener('click', e => { e.stopPropagation(); onDelete(); });
			actions.appendChild(delBtn);
		}
		actions.appendChild(el('div', 'mw-spacer'));
		const doneBtn = el('button', 'mw-popover-done-btn', 'Done');
		doneBtn.addEventListener('click', e => { e.stopPropagation(); onDone(); });
		actions.appendChild(doneBtn);
		form.appendChild(actions);
		return form;
	}

	// ===== Action Bars =====

	function createActionBar(data, diagramType, onChange) {
		const bar = el('div', 'mw-action-bar');
		const hint = el('span', 'mw-action-hint', 'Click on the diagram to edit');
		bar.appendChild(hint);
		bar.appendChild(el('div', 'mw-spacer'));

		if (diagramType === 'sequence') {
			const addPart = el('button', 'mw-action-btn', '+ Participant');
			addPart.addEventListener('click', () => {
				const existing = new Set(data.participants.map(p => p.name));
				let name = 'Participant'; let c = 1;
				while (existing.has(name + c)) { c++; }
				data.participants.push({ name: name + c, alias: '' });
				onChange();
			});
			bar.appendChild(addPart);
			const addMsg = el('button', 'mw-action-btn', '+ Message');
			addMsg.addEventListener('click', () => {
				if (data.participants.length < 2) { return; }
				data.messages.push({ from: data.participants[0].name, to: data.participants[1].name, text: 'message', msgType: '->>' });
				onChange();
			});
			bar.appendChild(addMsg);
		}

		if (diagramType === 'flowchart') {
			const dirLabel = el('span', 'mw-action-label', 'Direction:');
			bar.appendChild(dirLabel);
			const dirSelect = selectEl('mw-action-select', DIRECTION_OPTIONS, data.direction);
			dirSelect.addEventListener('change', () => { data.direction = dirSelect.value; onChange(); });
			bar.appendChild(dirSelect);
			const addNode = el('button', 'mw-action-btn', '+ Node');
			addNode.addEventListener('click', () => {
				const existingIds = new Set(data.nodes.map(n => n.id));
				data.nodes.push({ id: generateNodeId(existingIds), label: 'New Node', shape: 'rect', subgraph: '' });
				onChange();
			});
			bar.appendChild(addNode);
			const addEdge = el('button', 'mw-action-btn', '+ Connection');
			addEdge.addEventListener('click', () => {
				if (data.nodes.length < 2) { return; }
				data.edges.push({ from: data.nodes[0].id, to: data.nodes[1].id, label: '', type: '-->' });
				onChange();
			});
			bar.appendChild(addEdge);
			const addSubgraph = el('button', 'mw-action-btn', '+ Subgraph');
			addSubgraph.addEventListener('click', () => {
				if (!data.subgraphs) { data.subgraphs = []; }
				const existingIds = new Set(data.subgraphs.map(s => s.id));
				let name = 'Subgraph'; let c = 1;
				while (existingIds.has(name + c)) { c++; }
				data.subgraphs.push({ id: name + c, title: name + ' ' + c });
				onChange();
			});
			bar.appendChild(addSubgraph);
		}

		if (diagramType === 'pie') {
			const titleLabel = el('span', 'mw-action-label', 'Title:');
			bar.appendChild(titleLabel);
			const titleInput = inputEl('mw-action-input', data.title, 'Chart title');
			titleInput.addEventListener('input', () => { data.title = titleInput.value; onChange(); });
			bar.appendChild(titleInput);
			const addSlice = el('button', 'mw-action-btn', '+ Slice');
			addSlice.addEventListener('click', () => {
				data.slices.push({ label: 'New Slice', value: 10 });
				onChange();
			});
			bar.appendChild(addSlice);
		}

		if (diagramType === 'state') {
			if (data.direction || data.version.includes('v2')) {
				const dirLabel = el('span', 'mw-action-label', 'Direction:');
				bar.appendChild(dirLabel);
				const dirSelect = selectEl('mw-action-select', STATE_DIRECTION_OPTIONS, data.direction || 'TB');
				dirSelect.addEventListener('change', () => { data.direction = dirSelect.value; onChange(); });
				bar.appendChild(dirSelect);
			}
			const addState = el('button', 'mw-action-btn', '+ State');
			addState.addEventListener('click', () => {
				const existingIds = new Set(data.states.map(s => s.id));
				let name = 'NewState'; let c = 1;
				while (existingIds.has(name + c)) { c++; }
				const newId = name + c;
				data.states.push({ id: newId, label: newId, description: '' });
				onChange();
			});
			bar.appendChild(addState);
			const addTrans = el('button', 'mw-action-btn', '+ Transition');
			addTrans.addEventListener('click', () => {
				if (data.states.length < 1) { return; }
				const from = data.states.length > 0 ? data.states[0].id : '[*]';
				const to = data.states.length > 1 ? data.states[1].id : data.states[0].id;
				data.transitions.push({ from, to, label: '' });
				onChange();
			});
			bar.appendChild(addTrans);
		}

		if (diagramType === 'bar') {
			const titleLabel = el('span', 'mw-action-label', 'Title:');
			bar.appendChild(titleLabel);
			const titleInput = inputEl('mw-action-input', data.title, 'Chart title');
			titleInput.addEventListener('input', () => { data.title = titleInput.value; onChange(); });
			bar.appendChild(titleInput);
			const horizLabel = el('span', 'mw-action-label', '');
			const horizCheck = document.createElement('input');
			horizCheck.type = 'checkbox';
			horizCheck.checked = data.horizontal || false;
			horizCheck.addEventListener('change', () => { data.horizontal = horizCheck.checked; onChange(); });
			horizLabel.appendChild(horizCheck);
			horizLabel.appendChild(document.createTextNode(' Horizontal'));
			bar.appendChild(horizLabel);
			const addBar = el('button', 'mw-action-btn', '+ Bar');
			addBar.addEventListener('click', () => {
				const catNum = data.xCategories.length + 1;
				data.xCategories.push('Item ' + catNum);
				for (const b of data.bars) { b.values.push(10); }
				for (const l of data.lines) { l.values.push(10); }
				if (data.bars.length === 0) { data.bars.push({ values: [10] }); }
				onChange();
			});
			bar.appendChild(addBar);
		}

		return bar;
	}

	// ===== SVG Click Handlers =====

	function handleSequenceClick(e, svg, data, container, onChange) {
		let target = e.target;
		while (target && target !== svg) {
			const cls = target.getAttribute && target.getAttribute('class') || '';
			if (cls.includes('actor') && (target.tagName === 'text' || target.tagName === 'tspan' || target.tagName === 'rect')) {
				const textEl = target.tagName === 'rect'
					? (target.nextElementSibling && target.nextElementSibling.tagName === 'text' ? target.nextElementSibling : target)
					: (target.tagName === 'tspan' ? target.parentElement : target);
				const text = (textEl.textContent || '').trim();
				if (!text) { target = target.parentElement; continue; }
				const participant = data.participants.find(p => p.name === text || p.alias === text || (p.alias || p.name) === text);
				if (participant) {
					showParticipantPopover(container, target.closest('g') || target, participant, data, onChange);
					return;
				}
			}
			if (cls.includes('messageText') || (target.tagName === 'tspan' && target.parentElement && (target.parentElement.getAttribute('class') || '').includes('messageText'))) {
				const msgEl = cls.includes('messageText') ? target : target.parentElement;
				const allMsgTexts = Array.from(svg.querySelectorAll('.messageText'));
				let msgIdx = allMsgTexts.indexOf(msgEl);
				if (msgIdx < 0 && target.parentElement) { msgIdx = allMsgTexts.indexOf(target.parentElement); }
				if (msgIdx >= 0 && msgIdx < data.messages.length) {
					showMessagePopover(container, msgEl, data.messages[msgIdx], msgIdx, data, onChange);
					return;
				}
			}
			if (cls.includes('messageLine')) {
				// Check data-msg-idx attribute first (hit-area overlays)
				const idxAttr = target.getAttribute('data-msg-idx');
				let lineIdx;
				if (idxAttr !== null) {
					lineIdx = parseInt(idxAttr, 10);
				} else {
					const allLines = Array.from(svg.querySelectorAll('[class*="messageLine"]:not(.mw-hit-area):not(.mw-endpoint-handle)'));
					lineIdx = allLines.indexOf(target);
				}
				if (lineIdx >= 0 && lineIdx < data.messages.length) {
					showMessagePopover(container, target, data.messages[lineIdx], lineIdx, data, onChange);
					return;
				}
			}
			target = target.parentElement;
		}
		dismissPopover();
	}

	function showParticipantPopover(container, anchorEl, participant, data, onChange) {
		const fields = [
			{ label: 'Name', value: participant.name, placeholder: 'Identifier', onChange: (v) => {
				const oldName = participant.name; participant.name = v;
				data.messages.forEach(msg => { if (msg.from === oldName) { msg.from = v; } if (msg.to === oldName) { msg.to = v; } });
			}},
			{ label: 'Display', value: participant.alias || '', placeholder: 'Display name (optional)', onChange: (v) => { participant.alias = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => { const idx = data.participants.indexOf(participant); if (idx >= 0) { data.participants.splice(idx, 1); } dismissPopover(); onChange(); }
		);
		showPopoverAt(container, anchorEl, form);
	}

	// ===== Sequence Diagram Message Drag =====

	function setupSequenceDrag(svg, data, container, onChange) {
		let dragIndicators = [];

		function screenToSVG(clientX, clientY) {
			const pt = svg.createSVGPoint();
			pt.x = clientX;
			pt.y = clientY;
			const ctm = svg.getScreenCTM();
			return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
		}

		function getParticipantCenters() {
			// Try multiple selectors for participant labels
			let allActorTexts = Array.from(svg.querySelectorAll('text.actor'));
			if (allActorTexts.length === 0) {
				allActorTexts = Array.from(svg.querySelectorAll('[class*="actor"] text'));
			}
			const centers = [];
			const seen = new Set();
			for (const p of data.participants) {
				const displayName = p.alias || p.name;
				for (const textEl of allActorTexts) {
					if ((textEl.textContent || '').trim() === displayName && !seen.has(p.name)) {
						try {
							const bbox = textEl.getBBox();
							centers.push({ name: p.name, x: bbox.x + bbox.width / 2 });
						} catch (_) {
							// getBBox can fail if element is not rendered
						}
						seen.add(p.name);
						break;
					}
				}
			}
			// Fallback: use actor rects
			if (centers.length < data.participants.length) {
				const rects = Array.from(svg.querySelectorAll('rect.actor'));
				for (let i = 0; i < data.participants.length; i++) {
					if (seen.has(data.participants[i].name)) { continue; }
					if (rects[i]) {
						try {
							const bbox = rects[i].getBBox();
							centers.push({ name: data.participants[i].name, x: bbox.x + bbox.width / 2 });
							seen.add(data.participants[i].name);
						} catch (_) {}
					}
				}
			}
			return centers;
		}

		function getMessageYPositions() {
			const texts = Array.from(svg.querySelectorAll('.messageText'));
			return texts.slice(0, data.messages.length).map(t => {
				const bbox = t.getBBox();
				return bbox.y + bbox.height / 2;
			});
		}

		function findNearestParticipant(svgX, centers) {
			let nearest = null;
			let minDist = Infinity;
			for (const c of centers) {
				const d = Math.abs(svgX - c.x);
				if (d < minDist) { minDist = d; nearest = c; }
			}
			return nearest;
		}

		function clearIndicators() {
			dragIndicators.forEach(ind => ind.remove());
			dragIndicators = [];
		}

		function addIndicator(element) {
			svg.appendChild(element);
			dragIndicators.push(element);
		}

		// Prevent click handler from firing after a drag
		svg.addEventListener('click', (e) => {
			if (_seqDragJustCompleted) {
				_seqDragJustCompleted = false;
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		}, true);

		const msgLines = Array.from(svg.querySelectorAll('[class*="messageLine"]'));
		const msgTexts = Array.from(svg.querySelectorAll('.messageText'));
		const participantCentersInit = getParticipantCenters();

		// Add invisible wider hit-area overlays on message lines for easier clicking/dragging
		const HIT_AREA_WIDTH = 20; // px in SVG units, much wider than the 1-2px line
		const GRAB_HANDLE_RADIUS = 10;
		for (let i = 0; i < Math.min(msgLines.length, data.messages.length); i++) {
			const lineEl = msgLines[i];
			try {
				let lx1, ly1, lx2, ly2;
				if (lineEl.tagName === 'line') {
					lx1 = parseFloat(lineEl.getAttribute('x1') || '0');
					ly1 = parseFloat(lineEl.getAttribute('y1') || '0');
					lx2 = parseFloat(lineEl.getAttribute('x2') || '0');
					ly2 = parseFloat(lineEl.getAttribute('y2') || '0');
				} else {
					const bb = lineEl.getBBox();
					lx1 = bb.x; ly1 = bb.y + bb.height / 2;
					lx2 = bb.x + bb.width; ly2 = ly1;
				}

				// Wide invisible line overlay for the whole message
				const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				hitLine.setAttribute('x1', String(lx1));
				hitLine.setAttribute('y1', String(ly1));
				hitLine.setAttribute('x2', String(lx2));
				hitLine.setAttribute('y2', String(ly2));
				hitLine.setAttribute('stroke', 'transparent');
				hitLine.setAttribute('stroke-width', String(HIT_AREA_WIDTH));
				hitLine.setAttribute('class', 'messageLine mw-hit-area');
				hitLine.setAttribute('data-msg-idx', String(i));
				hitLine.style.cursor = 'grab';
				lineEl.parentElement.appendChild(hitLine);

				// Endpoint grab handles — determine which end is from/to
				const leftX = Math.min(lx1, lx2);
				const rightX = Math.max(lx1, lx2);
				const midY = (ly1 + ly2) / 2;
				if (Math.abs(lx2 - lx1) > 10) { // Not a self-message
					const msg = data.messages[i];
					const fromCenter = participantCentersInit.find(p => p.name === msg.from);
					const toCenter = participantCentersInit.find(p => p.name === msg.to);
					for (const ex of [leftX, rightX]) {
						const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
						handle.setAttribute('cx', String(ex));
						handle.setAttribute('cy', String(midY));
						handle.setAttribute('r', String(GRAB_HANDLE_RADIUS));
						handle.setAttribute('fill', 'rgba(0, 122, 204, 0.15)');
						handle.setAttribute('stroke', 'rgba(0, 122, 204, 0.4)');
						handle.setAttribute('stroke-width', '1.5');
						handle.setAttribute('class', 'messageLine mw-endpoint-handle');
						handle.setAttribute('data-msg-idx', String(i));
						// Tag which endpoint this handle represents
						let epRole = 'from';
						if (fromCenter && toCenter) {
							epRole = Math.abs(ex - fromCenter.x) < Math.abs(ex - toCenter.x) ? 'from' : 'to';
						}
						handle.setAttribute('data-endpoint', epRole);
						handle.style.cursor = 'ew-resize';
						handle.style.opacity = '0';
						handle.style.pointerEvents = 'none';
						lineEl.parentElement.appendChild(handle);
					}
				}
			} catch (_) { /* skip if getBBox fails */ }
		}

		// Determine which end of a line is "from" vs "to" using participant centers
		function classifyLineEndpoints(lineEl, msg, centers) {
			const fromCenter = centers.find(p => p.name === msg.from);
			const toCenter = centers.find(p => p.name === msg.to);
			if (!fromCenter || !toCenter) { return null; }

			let x1, x2;
			if (lineEl.tagName === 'line') {
				x1 = parseFloat(lineEl.getAttribute('x1') || '0');
				x2 = parseFloat(lineEl.getAttribute('x2') || '0');
			} else if (lineEl.tagName === 'path') {
				try {
					const bbox = lineEl.getBBox();
					x1 = bbox.x;
					x2 = bbox.x + bbox.width;
				} catch (_) { return null; }
			} else { return null; }

			const lineLen = Math.abs(x2 - x1);
			if (lineLen < 10) { return null; } // Self-message

			return { fromX: fromCenter.x, toX: toCenter.x, lineLeft: Math.min(x1, x2), lineRight: Math.max(x1, x2), lineLen };
		}

		// Set cursor hints on message elements — show ew-resize near ends
		for (let i = 0; i < data.messages.length; i++) {
			if (msgLines[i]) { msgLines[i].style.cursor = 'grab'; }
			if (msgTexts[i]) { msgTexts[i].style.cursor = 'grab'; }
		}

		// Re-query msgLines to include hit-area overlays for mousedown matching
		const allMsgLineEls = Array.from(svg.querySelectorAll('[class*="messageLine"]'));

		// Show endpoint handles on hover over hit-area or handles
		svg.addEventListener('mouseover', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-hit-area') || tcls.includes('mw-endpoint-handle')) {
				const idx = t.getAttribute('data-msg-idx');
				if (idx !== null) {
					svg.querySelectorAll('.mw-endpoint-handle[data-msg-idx="' + idx + '"]').forEach(h => { h.style.opacity = '1'; h.style.pointerEvents = 'all'; });
				}
			}
		});
		svg.addEventListener('mouseout', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-hit-area') || tcls.includes('mw-endpoint-handle')) {
				const idx = t.getAttribute('data-msg-idx');
				if (idx !== null) {
					setTimeout(() => {
						const stillHovered = svg.querySelector('.mw-endpoint-handle[data-msg-idx="' + idx + '"]:hover, .mw-hit-area[data-msg-idx="' + idx + '"]:hover');
						if (!stillHovered) {
							svg.querySelectorAll('.mw-endpoint-handle[data-msg-idx="' + idx + '"]').forEach(h => { h.style.opacity = '0'; h.style.pointerEvents = 'none'; });
						}
					}, 100);
				}
			}
		});

		svg.addEventListener('mousedown', (e) => {
			if (e.button !== 0 || activePopover) { return; }

			let target = e.target;
			let msgIdx = -1;

			while (target && target !== svg) {
				const cls = (target.getAttribute && target.getAttribute('class')) || '';
				if (cls.includes('messageLine')) {
					// Check data-msg-idx first (hit-area overlays)
					const idxAttr = target.getAttribute('data-msg-idx');
					if (idxAttr !== null) {
						msgIdx = parseInt(idxAttr, 10);
						if (msgIdx >= 0 && msgIdx < data.messages.length) { break; }
						msgIdx = -1;
					} else {
						msgIdx = msgLines.indexOf(target);
						if (msgIdx >= 0 && msgIdx < data.messages.length) { break; }
						msgIdx = -1;
					}
				}
				if (cls.includes('messageText')) {
					msgIdx = msgTexts.indexOf(target);
					if (msgIdx >= 0 && msgIdx < data.messages.length) { break; }
					msgIdx = -1;
				}
				if (target.tagName === 'tspan' && target.parentElement) {
					const pcls = (target.parentElement.getAttribute('class')) || '';
					if (pcls.includes('messageText')) {
						msgIdx = msgTexts.indexOf(target.parentElement);
						if (msgIdx >= 0 && msgIdx < data.messages.length) { break; }
						msgIdx = -1;
					}
				}
				target = target.parentElement;
			}

			if (msgIdx < 0) { return; }

			const startPt = screenToSVG(e.clientX, e.clientY);
			const startScreenX = e.clientX;
			const startScreenY = e.clientY;
			const participantCenters = getParticipantCenters();

			// Force endpoint mode if an endpoint handle was clicked directly
			const clickedCls = (e.target.getAttribute && e.target.getAttribute('class')) || '';
			const clickedHandle = clickedCls.includes('mw-endpoint-handle');
			const handleEndpoint = clickedHandle ? (e.target.getAttribute('data-endpoint') || '') : '';

			// Determine drag mode
			let dragMode = 'reorder';
			const lineEl = msgLines[msgIdx];
			const msg = data.messages[msgIdx];

			if (clickedHandle && (handleEndpoint === 'from' || handleEndpoint === 'to')) {
				// Handle was explicitly tagged — use it directly
				dragMode = 'endpoint-' + handleEndpoint;
			} else {
				const endpoints = lineEl ? classifyLineEndpoints(lineEl, msg, participantCenters) : null;
				if (endpoints) {
					const ENDPOINT_FRACTION = 0.35;
					const zoneSize = endpoints.lineLen * ENDPOINT_FRACTION;
					const distToFrom = Math.abs(startPt.x - endpoints.fromX);
					const distToTo = Math.abs(startPt.x - endpoints.toX);
					const minDist = Math.min(distToFrom, distToTo);

					if (minDist < zoneSize) {
						dragMode = distToFrom < distToTo ? 'endpoint-from' : 'endpoint-to';
					}
				}
			}

			let dragStarted = false;
			let dropIdx = msgIdx;
			let targetParticipant = null;
			const DRAG_THRESHOLD = 6;

			const onMouseMove = (moveE) => {
				const dx = moveE.clientX - startScreenX;
				const dy = moveE.clientY - startScreenY;

				if (!dragStarted) {
					if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
					// Lock in mode: if predominantly vertical, always reorder
					if (dragMode === 'reorder' && Math.abs(dx) > Math.abs(dy) * 2) { return; }
					if (dragMode.startsWith('endpoint-') && Math.abs(dy) > Math.abs(dx) * 3) {
						dragMode = 'reorder';
					}
					dragStarted = true;
					container.classList.add('mw-dragging');
					document.body.style.cursor = dragMode === 'reorder' ? 'ns-resize' : 'ew-resize';
					// Clear any accidental text selection that started
					const sel = window.getSelection();
					if (sel) { sel.removeAllRanges(); }
				}

				moveE.preventDefault();
				const svgPt = screenToSVG(moveE.clientX, moveE.clientY);
				clearIndicators();

				if (dragMode === 'reorder') {
					const msgYs = getMessageYPositions();
					if (msgYs.length === 0) { return; }
					dropIdx = 0;
					for (let i = 0; i < msgYs.length; i++) {
						if (svgPt.y > msgYs[i]) { dropIdx = i + 1; }
					}

					const vb = svg.viewBox.baseVal;
					const svgW = vb && vb.width > 0 ? vb.width : parseFloat(svg.getAttribute('width') || '800');
					let indicatorY;
					if (dropIdx === 0) { indicatorY = msgYs[0] - 20; }
					else if (dropIdx >= msgYs.length) { indicatorY = msgYs[msgYs.length - 1] + 20; }
					else { indicatorY = (msgYs[dropIdx - 1] + msgYs[dropIdx]) / 2; }

					const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
					line.setAttribute('x1', '50');
					line.setAttribute('y1', String(indicatorY));
					line.setAttribute('x2', String(svgW - 50));
					line.setAttribute('y2', String(indicatorY));
					line.setAttribute('stroke', '#007acc');
					line.setAttribute('stroke-width', '2.5');
					line.setAttribute('stroke-dasharray', '8,4');
					line.setAttribute('pointer-events', 'none');
					addIndicator(line);

					// Fade the message being dragged
					if (msgTexts[msgIdx]) { msgTexts[msgIdx].style.opacity = '0.3'; }
					if (msgLines[msgIdx]) { msgLines[msgIdx].style.opacity = '0.3'; }
				} else {
					// Endpoint drag — highlight nearest participant
					const nearest = findNearestParticipant(svgPt.x, participantCenters);
					targetParticipant = nearest ? nearest.name : null;

					if (nearest) {
						const vb = svg.viewBox.baseVal;
						const svgH = vb && vb.height > 0 ? vb.height : parseFloat(svg.getAttribute('height') || '600');
						const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
						rect.setAttribute('x', String(nearest.x - 40));
						rect.setAttribute('y', '0');
						rect.setAttribute('width', '80');
						rect.setAttribute('height', String(svgH));
						rect.setAttribute('fill', 'rgba(0, 122, 204, 0.12)');
						rect.setAttribute('pointer-events', 'none');
						svg.insertBefore(rect, svg.firstChild);
						dragIndicators.push(rect);

						// Draw the proposed line from other endpoint to highlighted participant
						const otherField = dragMode === 'endpoint-from' ? 'to' : 'from';
						const otherCenter = participantCenters.find(p => p.name === data.messages[msgIdx][otherField]);
						if (otherCenter && lineEl) {
							let msgY;
							if (lineEl.tagName === 'line') {
								msgY = parseFloat(lineEl.getAttribute('y1') || '0');
							} else {
								try { const bb = lineEl.getBBox(); msgY = bb.y + bb.height / 2; } catch (_) { msgY = null; }
							}
							if (msgY !== null) {
								const previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
								previewLine.setAttribute('x1', String(otherCenter.x));
								previewLine.setAttribute('y1', String(msgY));
								previewLine.setAttribute('x2', String(nearest.x));
								previewLine.setAttribute('y2', String(msgY));
								previewLine.setAttribute('stroke', '#007acc');
								previewLine.setAttribute('stroke-width', '2');
								previewLine.setAttribute('stroke-dasharray', '6,3');
								previewLine.setAttribute('pointer-events', 'none');
								addIndicator(previewLine);

								const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
								circle.setAttribute('cx', String(nearest.x));
								circle.setAttribute('cy', String(msgY));
								circle.setAttribute('r', '5');
								circle.setAttribute('fill', '#007acc');
								circle.setAttribute('pointer-events', 'none');
								addIndicator(circle);
							}
						}
					}

					// Fade original message
					if (msgTexts[msgIdx]) { msgTexts[msgIdx].style.opacity = '0.3'; }
					if (msgLines[msgIdx]) { msgLines[msgIdx].style.opacity = '0.3'; }
				}
			};

			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				clearIndicators();
				container.classList.remove('mw-dragging');
				document.body.style.cursor = '';

				if (msgTexts[msgIdx]) { msgTexts[msgIdx].style.opacity = ''; }
				if (msgLines[msgIdx]) { msgLines[msgIdx].style.opacity = ''; }

				if (!dragStarted) { return; } // Was just a click

				_seqDragJustCompleted = true;
				setTimeout(() => { _seqDragJustCompleted = false; }, 200);

				if (dragMode === 'reorder') {
					let targetIdx = dropIdx;
					if (targetIdx > msgIdx) { targetIdx--; }
					if (msgIdx !== targetIdx && targetIdx >= 0 && targetIdx < data.messages.length) {
						const [msg] = data.messages.splice(msgIdx, 1);
						data.messages.splice(targetIdx, 0, msg);
						onChange();
					}
				} else if (targetParticipant) {
					const msg = data.messages[msgIdx];
					const field = dragMode === 'endpoint-from' ? 'from' : 'to';
					if (msg[field] !== targetParticipant) {
						msg[field] = targetParticipant;
						onChange();
					}
				}
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});
	}

	function showMessagePopover(container, anchorEl, message, idx, data, onChange) {
		const partOptions = data.participants.map(p => ({ value: p.name, label: p.alias || p.name }));
		const fields = [
			{ label: 'From', type: 'select', options: partOptions, value: message.from, onChange: (v) => { message.from = v; } },
			{ label: 'To', type: 'select', options: partOptions, value: message.to, onChange: (v) => { message.to = v; } },
			{ label: 'Arrow', type: 'select', options: SEQ_MSG_OPTIONS, value: message.msgType, onChange: (v) => { message.msgType = v; } },
			{ label: 'Text', value: message.text, placeholder: 'Message text', onChange: (v) => { message.text = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => { data.messages.splice(idx, 1); dismissPopover(); onChange(); }
		);
		showPopoverAt(container, anchorEl, form);
	}

	function handleFlowchartClick(e, svg, data, container, onChange) {
		let target = e.target;
		while (target && target !== svg) {
			const cls = target.getAttribute && target.getAttribute('class') || '';
			const nodeGroup = cls.includes('node') ? target : (target.closest && target.closest('.node'));
			if (nodeGroup) {
				const gId = nodeGroup.getAttribute('id') || '';
				const match = gId.match(/flowchart-(\w+)-/);
				let node = match ? data.nodes.find(n => n.id === match[1]) : null;
				if (!node) {
					const labelText = (nodeGroup.textContent || '').trim();
					node = data.nodes.find(n => n.label === labelText);
				}
				if (node) { showNodePopover(container, nodeGroup, node, data, onChange); return; }
			}
			const edgeLabelGroup = cls.includes('edgeLabel') ? target : (target.closest && target.closest('.edgeLabel'));
			if (edgeLabelGroup) {
				const allLabels = Array.from(svg.querySelectorAll('.edgeLabel'));
				const edgeIdx = allLabels.indexOf(edgeLabelGroup);
				if (edgeIdx >= 0 && edgeIdx < data.edges.length) {
					showEdgePopover(container, edgeLabelGroup, data.edges[edgeIdx], edgeIdx, data, onChange);
					return;
				}
			}
			if (cls.includes('edgePath') || (target.closest && target.closest('.edgePath'))) {
				const edgePath = cls.includes('edgePath') ? target : target.closest('.edgePath');
				const allPaths = Array.from(svg.querySelectorAll('.edgePath'));
				const pathIdx = allPaths.indexOf(edgePath);
				if (pathIdx >= 0 && pathIdx < data.edges.length) {
					showEdgePopover(container, edgePath, data.edges[pathIdx], pathIdx, data, onChange);
					return;
				}
			}
			// Click on subgraph cluster (label or background rect)
			const clusterGroup = cls.includes('cluster') ? target : (target.closest && target.closest('.cluster, [id*="flowchart-subGraph"], [id*="subGraph"]'));
			if (clusterGroup && data.subgraphs && data.subgraphs.length > 0) {
				const clusterId = (clusterGroup.getAttribute('id') || '').toLowerCase();
				let sg = null;
				if (clusterId) {
					sg = data.subgraphs.find(s => clusterId.includes(s.id.toLowerCase()));
				}
				if (!sg) {
					const textEls = clusterGroup.querySelectorAll('text, tspan');
					for (const te of textEls) {
						const labelText = (te.textContent || '').trim();
						if (labelText) {
							sg = data.subgraphs.find(s => s.title === labelText || s.id === labelText);
							if (sg) { break; }
						}
					}
				}
				if (sg) {
					showSubgraphPopover(container, clusterGroup, sg, data, onChange);
					return;
				}
			}
			target = target.parentElement;
		}
		dismissPopover();
	}

	function showSubgraphPopover(container, anchorEl, sg, data, onChange) {
		const form = el('div', 'mw-popover-form');

		// Title field
		const titleRow = el('div', 'mw-popover-row');
		const titleLabel = el('label', 'mw-popover-label', 'Title');
		titleRow.appendChild(titleLabel);
		const titleInput = document.createElement('input');
		titleInput.type = 'text';
		titleInput.className = 'mw-popover-input';
		titleInput.value = sg.title;
		titleInput.addEventListener('input', () => { sg.title = titleInput.value; });
		titleRow.appendChild(titleInput);
		form.appendChild(titleRow);

		// Node membership section
		const memberLabel = el('div', 'mw-popover-label', 'Nodes in this subgraph:');
		memberLabel.style.marginTop = '8px';
		memberLabel.style.marginBottom = '4px';
		memberLabel.style.fontWeight = 'bold';
		form.appendChild(memberLabel);

		const nodeList = el('div', 'mw-subgraph-node-list');
		nodeList.style.maxHeight = '150px';
		nodeList.style.overflowY = 'auto';
		nodeList.style.marginBottom = '8px';

		for (const node of data.nodes) {
			const row = el('div', 'mw-subgraph-node-row');
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '6px';
			row.style.padding = '2px 0';

			const cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.checked = node.subgraph === sg.id;
			cb.addEventListener('change', () => {
				node.subgraph = cb.checked ? sg.id : '';
			});
			row.appendChild(cb);

			const lbl = el('span', '', node.label || node.id);
			lbl.style.fontSize = '12px';
			if (node.subgraph && node.subgraph !== sg.id) {
				const otherSg = data.subgraphs.find(s => s.id === node.subgraph);
				lbl.textContent += ' (' + (otherSg ? otherSg.title : node.subgraph) + ')';
				lbl.style.opacity = '0.6';
			}
			row.appendChild(lbl);
			nodeList.appendChild(row);
		}
		form.appendChild(nodeList);

		// Actions
		const actions = el('div', 'mw-popover-actions');
		const delBtn = el('button', 'mw-popover-delete-btn', 'Delete');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const idx = data.subgraphs.indexOf(sg);
			if (idx >= 0) {
				for (const node of data.nodes) {
					if (node.subgraph === sg.id) { node.subgraph = ''; }
				}
				data.subgraphs.splice(idx, 1);
			}
			dismissPopover(); onChange();
		});
		actions.appendChild(delBtn);
		actions.appendChild(el('div', 'mw-spacer'));
		const doneBtn = el('button', 'mw-popover-done-btn', 'Done');
		doneBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			dismissPopover(); onChange();
		});
		actions.appendChild(doneBtn);
		form.appendChild(actions);

		showPopoverAt(container, anchorEl, form);
	}

	function showNodePopover(container, anchorEl, node, data, onChange) {
		const subgraphOptions = [{ value: '', label: '(none)' }];
		if (data.subgraphs) {
			for (const sg of data.subgraphs) {
				subgraphOptions.push({ value: sg.id, label: sg.title || sg.id });
			}
		}
		const fields = [
			{ label: 'Label', value: node.label, placeholder: 'Node label', onChange: (v) => { node.label = v; } },
			{ label: 'Shape', type: 'select', options: SHAPE_OPTIONS, value: node.shape, onChange: (v) => { node.shape = v; } },
			{ label: 'Subgraph', type: 'select', options: subgraphOptions, value: node.subgraph || '', onChange: (v) => { node.subgraph = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => {
				const idx = data.nodes.indexOf(node);
				if (idx >= 0) { data.nodes.splice(idx, 1); data.edges = data.edges.filter(e => e.from !== node.id && e.to !== node.id); }
				dismissPopover(); onChange();
			}
		);
		showPopoverAt(container, anchorEl, form);
	}

	function showEdgePopover(container, anchorEl, edge, idx, data, onChange) {
		const nodeOptions = data.nodes.map(n => ({ value: n.id, label: n.id + ': ' + n.label }));
		const fields = [
			{ label: 'From', type: 'select', options: nodeOptions, value: edge.from, onChange: (v) => { edge.from = v; } },
			{ label: 'Type', type: 'select', options: EDGE_TYPE_OPTIONS, value: edge.type, onChange: (v) => { edge.type = v; } },
			{ label: 'To', type: 'select', options: nodeOptions, value: edge.to, onChange: (v) => { edge.to = v; } },
			{ label: 'Label', value: edge.label, placeholder: 'Edge label', onChange: (v) => { edge.label = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => { data.edges.splice(idx, 1); dismissPopover(); onChange(); }
		);
		showPopoverAt(container, anchorEl, form);
	}

	// ===== Flowchart Endpoint Drag =====

	let _flowDragJustCompleted = false;

	function setupFlowchartDrag(svg, data, container, onChange) {
		let dragIndicators = [];

		function screenToSVG(clientX, clientY) {
			const pt = svg.createSVGPoint();
			pt.x = clientX;
			pt.y = clientY;
			const ctm = svg.getScreenCTM();
			return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
		}

		function getNodeCenters() {
			const centers = [];
			const svgCTM = svg.getCTM();
			const nodeGroups = svg.querySelectorAll('.node');
			nodeGroups.forEach(group => {
				const gId = group.getAttribute('id') || '';
				const match = gId.match(/flowchart-(\w+)-/) || gId.match(/(\w+)/);
				let node = match ? data.nodes.find(n => n.id === match[1]) : null;
				if (!node) {
					const textEls = group.querySelectorAll('text, tspan');
					for (const te of textEls) {
						const t = (te.textContent || '').trim();
						node = data.nodes.find(n => n.id === t || n.label === t);
						if (node) { break; }
					}
				}
				if (node && !centers.find(c => c.id === node.id)) {
					try {
						const bbox = group.getBBox();
						const localCx = bbox.x + bbox.width / 2;
						const localCy = bbox.y + bbox.height / 2;
						const ctm = group.getCTM();
						let cx = localCx, cy = localCy;
						let rootBbox = bbox;
						if (ctm && svgCTM) {
							const pt = svg.createSVGPoint();
							pt.x = localCx; pt.y = localCy;
							const rootPt = pt.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							cx = rootPt.x; cy = rootPt.y;
							const pt1 = svg.createSVGPoint();
							pt1.x = bbox.x; pt1.y = bbox.y;
							const rp1 = pt1.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							const pt2 = svg.createSVGPoint();
							pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
							const rp2 = pt2.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							rootBbox = { x: Math.min(rp1.x, rp2.x), y: Math.min(rp1.y, rp2.y),
								width: Math.abs(rp2.x - rp1.x), height: Math.abs(rp2.y - rp1.y) };
						}
						centers.push({ id: node.id, x: cx, y: cy, bbox: rootBbox });
					} catch (_) {}
				}
			});
			return centers;
		}

		function findNearestNode(svgX, svgY, centers) {
			let nearest = null;
			let minDist = Infinity;
			for (const c of centers) {
				const margin = 30;
				const inBBox = c.bbox && svgX >= c.bbox.x - margin && svgX <= c.bbox.x + c.bbox.width + margin &&
					svgY >= c.bbox.y - margin && svgY <= c.bbox.y + c.bbox.height + margin;
				const d = Math.hypot(svgX - c.x, svgY - c.y);
				if (d < minDist && (inBBox || d <= 200)) { minDist = d; nearest = c; }
			}
			return nearest;
		}

		function toSVGRoot(element, x, y) {
			try {
				const pt = svg.createSVGPoint();
				pt.x = x; pt.y = y;
				const ctm = element.getCTM();
				if (ctm) {
					const svgCTM = svg.getCTM();
					if (svgCTM) { return pt.matrixTransform(ctm).matrixTransform(svgCTM.inverse()); }
					return pt.matrixTransform(ctm);
				}
			} catch (_) {}
			return { x, y };
		}

		function clearIndicators() {
			dragIndicators.forEach(ind => ind.remove());
			dragIndicators = [];
		}

		function addIndicator(element) {
			svg.appendChild(element);
			dragIndicators.push(element);
		}

		// Prevent click handler from firing after a drag
		svg.addEventListener('click', (e) => {
			if (_flowDragJustCompleted) {
				_flowDragJustCompleted = false;
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		}, true);

		// Gather edge paths paired with labels using Mermaid's parallel container structure
		const edgePathContainer = svg.querySelector('.edgePaths');
		const edgeLabelContainer = svg.querySelector('.edgeLabels');
		const edgePathGroups = edgePathContainer ? Array.from(edgePathContainer.children) : [];
		const edgeLabelGroups = edgeLabelContainer ? Array.from(edgeLabelContainer.children) : [];

		let edgePaths = [];
		if (edgePathGroups.length > 0) {
			for (let i = 0; i < edgePathGroups.length; i++) {
				const eg = edgePathGroups[i];
				const p = eg.querySelector('path') || (eg.tagName === 'path' ? eg : null);
				if (!p) { continue; }
				let label = '';
				if (i < edgeLabelGroups.length) {
					const txt = (edgeLabelGroups[i].textContent || '').trim().replace(/\s+/g, ' ');
					if (txt) { label = txt; }
				}
				let edgeFrom = '', edgeTo = '';
				const edgeId = eg.getAttribute('id') || '';
				const idMatch = edgeId.match(/^(?:edge|id|L)-(.+?)-(.+?)-(\d+)$/i);
				if (idMatch) { edgeFrom = idMatch[1]; edgeTo = idMatch[2]; }
				edgePaths.push({ group: eg, path: p, label, edgeFrom, edgeTo });
			}
		}
		// Fallback
		if (edgePaths.length < data.edges.length) {
			const groups = Array.from(svg.querySelectorAll('.edgePath'));
			if (groups.length >= data.edges.length) {
				edgePaths = [];
				for (let i = 0; i < groups.length; i++) {
					const eg = groups[i];
					const p = eg.querySelector('path') || (eg.tagName === 'path' ? eg : null);
					if (!p) { continue; }
					let label = '';
					if (i < edgeLabelGroups.length) {
						const txt = (edgeLabelGroups[i].textContent || '').trim().replace(/\s+/g, ' ');
						if (txt) { label = txt; }
					}
					let edgeFrom = '', edgeTo = '';
					const edgeId = eg.getAttribute('id') || '';
					const idMatch = edgeId.match(/^(?:edge|id|L)-(.+?)-(.+?)-(\d+)$/i);
					if (idMatch) { edgeFrom = idMatch[1]; edgeTo = idMatch[2]; }
					edgePaths.push({ group: eg, path: p, label, edgeFrom, edgeTo });
				}
			}
		}

		const nodeCentersInit = getNodeCenters();

		// Match SVG paths to data.edges
		const matchedIndices = new Set();
		let fallbackIdx = 0;

		for (let i = 0; i < edgePaths.length; i++) {
			const { group: edgeGroup, path: pathEl, label: svgLabel, edgeFrom, edgeTo } = edgePaths[i];

			try {
				const pathLen = pathEl.getTotalLength();
				if (pathLen < 10) { continue; }

				let matchedIdx = -1;
				const normLabel = svgLabel.replace(/\s+/g, ' ').trim();

				const rawStart = pathEl.getPointAtLength(0);
				const rawEnd = pathEl.getPointAtLength(pathLen);
				const startPt = toSVGRoot(pathEl, rawStart.x, rawStart.y);
				const endPt = toSVGRoot(pathEl, rawEnd.x, rawEnd.y);
				const nearStart = findNearestNode(startPt.x, startPt.y, nodeCentersInit);
				const nearEnd = findNearestNode(endPt.x, endPt.y, nodeCentersInit);

				// Strategy 1: Edge ID from/to
				if (edgeFrom && edgeTo) {
					for (let ei = 0; ei < data.edges.length; ei++) {
						if (matchedIndices.has(ei)) { continue; }
						const e = data.edges[ei];
						if (e.from === edgeFrom && e.to === edgeTo) { matchedIdx = ei; break; }
					}
				}

				// Strategy 2: Label + endpoints
				if (matchedIdx < 0 && normLabel && nearStart && nearEnd) {
					for (let ei = 0; ei < data.edges.length; ei++) {
						if (matchedIndices.has(ei)) { continue; }
						const e = data.edges[ei];
						const eLabel = (e.label || '').replace(/\s+/g, ' ').trim();
						if (eLabel === normLabel &&
							((e.from === nearStart.id && e.to === nearEnd.id) ||
							 (e.from === nearEnd.id && e.to === nearStart.id))) {
							matchedIdx = ei; break;
						}
					}
				}

				// Strategy 3: Label alone
				if (matchedIdx < 0 && normLabel) {
					for (let ei = 0; ei < data.edges.length; ei++) {
						if (matchedIndices.has(ei)) { continue; }
						const eLabel = (data.edges[ei].label || '').replace(/\s+/g, ' ').trim();
						if (eLabel === normLabel) { matchedIdx = ei; break; }
					}
				}

				// Strategy 4: Proximity
				if (matchedIdx < 0 && nearStart && nearEnd) {
					for (let ei = 0; ei < data.edges.length; ei++) {
						if (matchedIndices.has(ei)) { continue; }
						const e = data.edges[ei];
						if (e.from === nearStart.id && e.to === nearEnd.id) { matchedIdx = ei; break; }
					}
					if (matchedIdx < 0) {
						for (let ei = 0; ei < data.edges.length; ei++) {
							if (matchedIndices.has(ei)) { continue; }
							const e = data.edges[ei];
							if (e.from === nearEnd.id && e.to === nearStart.id) { matchedIdx = ei; break; }
						}
					}
				}

				// Strategy 5: Fallback
				if (matchedIdx < 0) {
					while (fallbackIdx < data.edges.length && matchedIndices.has(fallbackIdx)) { fallbackIdx++; }
					if (fallbackIdx >= data.edges.length) { continue; }
					matchedIdx = fallbackIdx;
				}
				matchedIndices.add(matchedIdx);

				const edge = data.edges[matchedIdx];

				// Hit area overlay
				const hitPath = pathEl.cloneNode(false);
				hitPath.setAttribute('stroke', 'transparent');
				hitPath.setAttribute('stroke-width', '20');
				hitPath.setAttribute('fill', 'none');
				hitPath.setAttribute('class', 'mw-state-hit-area');
				hitPath.setAttribute('data-edge-idx', String(matchedIdx));
				hitPath.style.cursor = 'grab';
				hitPath.style.pointerEvents = 'stroke';
				svg.appendChild(hitPath);

				// Determine from/to roles by comparing both endpoints to both node centers
				const fromCenter = nodeCentersInit.find(c => c.id === edge.from);
				const toCenter = nodeCentersInit.find(c => c.id === edge.to);
				const endpoints = [
					{ x: startPt.x, y: startPt.y, role: 'from' },
					{ x: endPt.x, y: endPt.y, role: 'to' }
				];
				if (fromCenter && toCenter) {
					// Compare both possible assignments and pick the one with smaller total distance
					const dStartFrom = Math.hypot(startPt.x - fromCenter.x, startPt.y - fromCenter.y);
					const dEndTo = Math.hypot(endPt.x - toCenter.x, endPt.y - toCenter.y);
					const dStartTo = Math.hypot(startPt.x - toCenter.x, startPt.y - toCenter.y);
					const dEndFrom = Math.hypot(endPt.x - fromCenter.x, endPt.y - fromCenter.y);
					const normalCost = dStartFrom + dEndTo;
					const swappedCost = dStartTo + dEndFrom;
					if (swappedCost < normalCost) {
						endpoints[0].role = 'to';
						endpoints[1].role = 'from';
					}
				}

				for (const ep of endpoints) {
					const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
					handle.setAttribute('cx', String(ep.x));
					handle.setAttribute('cy', String(ep.y));
					handle.setAttribute('r', '10');
					handle.setAttribute('fill', 'rgba(0, 122, 204, 0.15)');
					handle.setAttribute('stroke', 'rgba(0, 122, 204, 0.4)');
					handle.setAttribute('stroke-width', '1.5');
					handle.setAttribute('class', 'mw-state-endpoint-handle');
					handle.setAttribute('data-edge-idx', String(matchedIdx));
					handle.setAttribute('data-endpoint', ep.role);
					handle.setAttribute('data-from', edge.from);
					handle.setAttribute('data-to', edge.to);
					handle.setAttribute('data-label', edge.label || '');
					handle.style.cursor = 'crosshair';
					handle.style.opacity = '0';
					handle.style.pointerEvents = 'none';
					svg.appendChild(handle);
				}
			} catch (_) {}
		}

		// Show/hide endpoint handles on hover
		svg.addEventListener('mouseover', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-state-hit-area') || tcls.includes('mw-state-endpoint-handle')) {
				const idx = t.getAttribute('data-edge-idx');
				if (idx !== null) {
				svg.querySelectorAll('.mw-state-endpoint-handle[data-edge-idx="' + idx + '"]').forEach(h => { h.style.opacity = '1'; h.style.pointerEvents = 'all'; });
				}
			}
		});
		svg.addEventListener('mouseout', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-state-hit-area') || tcls.includes('mw-state-endpoint-handle')) {
				const idx = t.getAttribute('data-edge-idx');
				if (idx !== null) {
					setTimeout(() => {
						const stillHovered = svg.querySelector('.mw-state-endpoint-handle[data-edge-idx="' + idx + '"]:hover, .mw-state-hit-area[data-edge-idx="' + idx + '"]:hover');
						if (!stillHovered) {
							svg.querySelectorAll('.mw-state-endpoint-handle[data-edge-idx="' + idx + '"]').forEach(h => { h.style.opacity = '0'; h.style.pointerEvents = 'none'; });
						}
					}, 100);
				}
			}
		});

		// Mousedown on endpoint handles starts a drag
		svg.addEventListener('mousedown', (e) => {
			if (e.button !== 0 || activePopover) { return; }

			const targetCls = (e.target.getAttribute && e.target.getAttribute('class')) || '';
			if (!targetCls.includes('mw-state-endpoint-handle')) { return; }

			const endpoint = e.target.getAttribute('data-endpoint');
			const handleFrom = e.target.getAttribute('data-from');
			const handleTo = e.target.getAttribute('data-to');
			const handleLabel = e.target.getAttribute('data-label') || '';
			if (!endpoint || !handleFrom || !handleTo) { return; }

			// Find edge by from/to/label
			let edgeIdx = -1;
			for (let ei = 0; ei < data.edges.length; ei++) {
				const ed = data.edges[ei];
				if (ed.from === handleFrom && ed.to === handleTo && (ed.label || '') === handleLabel) {
					edgeIdx = ei; break;
				}
			}
			if (edgeIdx < 0) {
				const idxStr = e.target.getAttribute('data-edge-idx');
				edgeIdx = idxStr !== null ? parseInt(idxStr, 10) : -1;
			}
			if (edgeIdx < 0 || edgeIdx >= data.edges.length) { return; }

			const startScreenX = e.clientX;
			const startScreenY = e.clientY;
			const nodeCenters = getNodeCenters();
			let dragStarted = false;
			let targetNode = null;
			const DRAG_THRESHOLD = 6;

			const onMouseMove = (moveE) => {
				const dx = moveE.clientX - startScreenX;
				const dy = moveE.clientY - startScreenY;

				if (!dragStarted) {
					if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
					dragStarted = true;
					container.classList.add('mw-dragging');
					document.body.style.cursor = 'crosshair';
					const sel = window.getSelection();
					if (sel) { sel.removeAllRanges(); }
				}

				moveE.preventDefault();
				const svgPt = screenToSVG(moveE.clientX, moveE.clientY);
				clearIndicators();

				const nearest = findNearestNode(svgPt.x, svgPt.y, nodeCenters);
				targetNode = nearest ? nearest.id : null;

				if (nearest) {
					const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
					rect.setAttribute('x', String(nearest.bbox.x - 4));
					rect.setAttribute('y', String(nearest.bbox.y - 4));
					rect.setAttribute('width', String(nearest.bbox.width + 8));
					rect.setAttribute('height', String(nearest.bbox.height + 8));
					rect.setAttribute('rx', '8');
					rect.setAttribute('ry', '8');
					rect.setAttribute('fill', 'none');
					rect.setAttribute('stroke', '#007acc');
					rect.setAttribute('stroke-width', '3');
					rect.setAttribute('stroke-dasharray', '6,3');
					rect.setAttribute('pointer-events', 'none');
					addIndicator(rect);

					const otherField = endpoint === 'from' ? 'to' : 'from';
					const otherCenter = nodeCenters.find(c => c.id === data.edges[edgeIdx][otherField]);
					if (otherCenter) {
						const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
						line.setAttribute('x1', String(otherCenter.x));
						line.setAttribute('y1', String(otherCenter.y));
						line.setAttribute('x2', String(nearest.x));
						line.setAttribute('y2', String(nearest.y));
						line.setAttribute('stroke', '#007acc');
						line.setAttribute('stroke-width', '2');
						line.setAttribute('stroke-dasharray', '6,3');
						line.setAttribute('pointer-events', 'none');
						addIndicator(line);
					}
				}
			};

			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				clearIndicators();
				container.classList.remove('mw-dragging');
				document.body.style.cursor = '';

				if (!dragStarted) { return; }

				_flowDragJustCompleted = true;
				setTimeout(() => { _flowDragJustCompleted = false; }, 200);

				if (targetNode) {
					const edge = data.edges[edgeIdx];
					if (edge[endpoint] !== targetNode) {
						edge[endpoint] = targetNode;
						onChange();
					}
				}
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});

		// ===== Node Drag (create connections + subgraph assignment) =====
		// Drag from a node to another node to create a new edge,
		// or drag onto a subgraph cluster to assign the node to that subgraph
		{
			// Gather subgraph cluster bounding boxes
			function getSubgraphClusters() {
				if (!data.subgraphs || data.subgraphs.length === 0) { return []; }
				const clusters = [];
				const matchedSgIds = new Set();
				const svgCTM = svg.getCTM();
				// Try multiple selectors for cluster elements
				const clusterEls = svg.querySelectorAll('.cluster, [id*="flowchart-subGraph"], [id*="subGraph"]');
				clusterEls.forEach(cluster => {
					const clusterId = (cluster.getAttribute('id') || '').toLowerCase();
					let sg = null;
					// Match by ID (case-insensitive)
					if (clusterId) {
						sg = data.subgraphs.find(s => clusterId.includes(s.id.toLowerCase()));
					}
					// Match by title text
					if (!sg) {
						const textEls = cluster.querySelectorAll('text, tspan');
						for (const te of textEls) {
							const labelText = (te.textContent || '').trim();
							if (labelText) {
								sg = data.subgraphs.find(s => s.title === labelText || s.id === labelText);
								if (sg) { break; }
							}
						}
					}
					if (sg && !clusters.find(c => c.sg.id === sg.id)) {
						matchedSgIds.add(sg.id);
						try {
							const bbox = cluster.getBBox();
							const ctm = cluster.getCTM();
							let rootBbox = bbox;
							if (ctm && svgCTM) {
								const pt1 = svg.createSVGPoint();
								pt1.x = bbox.x; pt1.y = bbox.y;
								const rp1 = pt1.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
								const pt2 = svg.createSVGPoint();
								pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
								const rp2 = pt2.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
								rootBbox = { x: Math.min(rp1.x, rp2.x), y: Math.min(rp1.y, rp2.y),
									width: Math.abs(rp2.x - rp1.x), height: Math.abs(rp2.y - rp1.y) };
							}
							// Ensure minimum cluster size for drop targeting
							if (rootBbox.width < 60) { rootBbox.x -= (60 - rootBbox.width) / 2; rootBbox.width = 60; }
							if (rootBbox.height < 40) { rootBbox.y -= (40 - rootBbox.height) / 2; rootBbox.height = 40; }
							clusters.push({ sg, bbox: rootBbox, element: cluster, synthetic: false });
						} catch (_) {}
					}
				});

				// Track unmatched subgraphs for HTML overlay drop zones
				clusters._unmatchedSgs = data.subgraphs.filter(s => !matchedSgIds.has(s.id));

				return clusters;
			}

			function findClusterAt(svgX, svgY, clusters) {
				let best = null;
				let bestArea = Infinity;
				const margin = 10; // Allow slight overflow for easier targeting
				for (const c of clusters) {
					if (svgX >= c.bbox.x - margin && svgX <= c.bbox.x + c.bbox.width + margin &&
						svgY >= c.bbox.y - margin && svgY <= c.bbox.y + c.bbox.height + margin) {
						const area = c.bbox.width * c.bbox.height;
						if (area < bestArea) { bestArea = area; best = c; }
					}
				}
				return best;
			}

			svg.addEventListener('mousedown', (e) => {
				if (e.button !== 0 || activePopover) { return; }

				const nodeGroup = e.target.closest && e.target.closest('.node');
				if (!nodeGroup) { return; }

				// Don't interfere with endpoint handle drags
				const targetCls = (e.target.getAttribute && e.target.getAttribute('class')) || '';
				if (targetCls.includes('mw-state-endpoint-handle') || targetCls.includes('mw-state-hit-area')) { return; }

				// Find which data node this is
				const gId = nodeGroup.getAttribute('id') || '';
				const match = gId.match(/flowchart-(\w+)-/);
				let sourceNode = match ? data.nodes.find(n => n.id === match[1]) : null;
				if (!sourceNode) {
					const labelText = (nodeGroup.textContent || '').trim();
					sourceNode = data.nodes.find(n => n.label === labelText);
				}
				if (!sourceNode) { return; }

				const startScreenX = e.clientX;
				const startScreenY = e.clientY;
				let dragStarted = false;
				let targetNodeId = null;
				let targetCluster = null;
				const clusters = getSubgraphClusters();
				const nodeCenters = getNodeCenters();
				const DRAG_THRESHOLD = 8;
				const unmatchedSgs = clusters._unmatchedSgs || [];
				const htmlDropZones = []; // HTML overlay elements for empty subgraphs

				const onMouseMove = (moveE) => {
					const dx = moveE.clientX - startScreenX;
					const dy = moveE.clientY - startScreenY;

					if (!dragStarted) {
						if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
						dragStarted = true;
						container.classList.add('mw-dragging');
						document.body.style.cursor = 'crosshair';
						const sel = window.getSelection();
						if (sel) { sel.removeAllRanges(); }

						// Create HTML overlay drop zones for empty subgraphs
						if (unmatchedSgs.length > 0) {
							const svgRect = svg.getBoundingClientRect();
							const containerRect = container.getBoundingClientRect();
							// Position below SVG, relative to container
							const topPos = svgRect.bottom - containerRect.top + container.scrollTop + 10;
							const svgLeftOffset = svgRect.left - containerRect.left + container.scrollLeft;
							let xPos = svgLeftOffset;
							for (const sg of unmatchedSgs) {
								if (sourceNode.subgraph && sg.id === sourceNode.subgraph) { continue; }
								const zone = document.createElement('div');
								zone.className = 'mw-drop-zone';
								zone.textContent = sg.title;
								zone.dataset.sgId = sg.id;
								zone.style.cssText = 'position:absolute;padding:8px 16px;border:2px dashed rgba(0,122,204,0.4);' +
									'border-radius:6px;background:rgba(0,122,204,0.06);color:rgba(0,122,204,0.7);' +
									'font-size:12px;pointer-events:none;z-index:10;white-space:nowrap;';
								zone.style.left = xPos + 'px';
								zone.style.top = topPos + 'px';
								container.appendChild(zone);
								htmlDropZones.push({ sg, element: zone });
								xPos += zone.offsetWidth + 12;
							}
						}
					}

					moveE.preventDefault();
					const svgPt = screenToSVG(moveE.clientX, moveE.clientY);
					clearIndicators();

					// Check HTML overlay drop zones first (screen coordinates)
					let htmlHit = null;
					for (const dz of htmlDropZones) {
						const r = dz.element.getBoundingClientRect();
						const m = 6; // margin for easier targeting
						if (moveE.clientX >= r.left - m && moveE.clientX <= r.right + m &&
							moveE.clientY >= r.top - m && moveE.clientY <= r.bottom + m) {
							htmlHit = dz;
						}
					}

					// Highlight hovered HTML drop zone
					for (const dz of htmlDropZones) {
						if (dz === htmlHit) {
							dz.element.style.borderColor = '#007acc';
							dz.element.style.background = 'rgba(0,122,204,0.15)';
							dz.element.style.color = '#007acc';
							dz.element.style.fontWeight = '600';
						} else {
							dz.element.style.borderColor = 'rgba(0,122,204,0.4)';
							dz.element.style.background = 'rgba(0,122,204,0.06)';
							dz.element.style.color = 'rgba(0,122,204,0.7)';
							dz.element.style.fontWeight = '';
						}
					}

					if (htmlHit) {
						// Hovering over an HTML drop zone for an empty subgraph
						targetNodeId = null;
						targetCluster = { sg: htmlHit.sg, synthetic: true };
					} else {
					// Check SVG subgraph clusters (takes priority over node connections)
					// Skip the source node's own subgraph so dragging out of it works
					let cluster = findClusterAt(svgPt.x, svgPt.y, clusters);
					if (cluster && sourceNode.subgraph && cluster.sg.id === sourceNode.subgraph) {
						// If hovering over own subgraph, look for a different (nested) cluster
						const otherClusters = clusters.filter(c => c.sg.id !== sourceNode.subgraph);
						cluster = findClusterAt(svgPt.x, svgPt.y, otherClusters);
					}

					// Only check for node connection if NOT over a subgraph cluster
					const nearNode = !cluster ? findNearestNode(svgPt.x, svgPt.y, nodeCenters) : null;
					const hoverNode = nearNode && nearNode.id !== sourceNode.id ? nearNode : null;

					if (cluster) {
						// Hovering over a subgraph — show subgraph assignment indicator
						targetNodeId = null;
						targetCluster = cluster;

						const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
						rect.setAttribute('x', String(cluster.bbox.x - 2));
						rect.setAttribute('y', String(cluster.bbox.y - 2));
						rect.setAttribute('width', String(cluster.bbox.width + 4));
						rect.setAttribute('height', String(cluster.bbox.height + 4));
						rect.setAttribute('rx', '6');
						rect.setAttribute('ry', '6');
						rect.setAttribute('fill', 'rgba(0, 122, 204, 0.08)');
						rect.setAttribute('stroke', '#007acc');
						rect.setAttribute('stroke-width', '3');
						rect.setAttribute('stroke-dasharray', '6,3');
						rect.setAttribute('pointer-events', 'none');
						addIndicator(rect);

						const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
						label.setAttribute('x', String(svgPt.x + 15));
						label.setAttribute('y', String(svgPt.y - 10));
						label.setAttribute('fill', '#007acc');
						label.setAttribute('font-size', '12');
						label.setAttribute('pointer-events', 'none');
						label.textContent = '→ Move to ' + cluster.sg.title;
						addIndicator(label);
					} else if (hoverNode) {
						// Hovering over another node — show connection indicator
						targetNodeId = hoverNode.id;
						targetCluster = null;

						// Highlight target node
						const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
						rect.setAttribute('x', String(hoverNode.bbox.x - 4));
						rect.setAttribute('y', String(hoverNode.bbox.y - 4));
						rect.setAttribute('width', String(hoverNode.bbox.width + 8));
						rect.setAttribute('height', String(hoverNode.bbox.height + 8));
						rect.setAttribute('rx', '8');
						rect.setAttribute('ry', '8');
						rect.setAttribute('fill', 'none');
						rect.setAttribute('stroke', '#007acc');
						rect.setAttribute('stroke-width', '3');
						rect.setAttribute('stroke-dasharray', '6,3');
						rect.setAttribute('pointer-events', 'none');
						addIndicator(rect);

						// Draw line from source to target
						const srcCenter = nodeCenters.find(c => c.id === sourceNode.id);
						if (srcCenter) {
							const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
							line.setAttribute('x1', String(srcCenter.x));
							line.setAttribute('y1', String(srcCenter.y));
							line.setAttribute('x2', String(hoverNode.x));
							line.setAttribute('y2', String(hoverNode.y));
							line.setAttribute('stroke', '#007acc');
							line.setAttribute('stroke-width', '2');
							line.setAttribute('stroke-dasharray', '6,3');
							line.setAttribute('pointer-events', 'none');
							addIndicator(line);
						}

						// Label
						const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
						label.setAttribute('x', String(svgPt.x + 15));
						label.setAttribute('y', String(svgPt.y - 10));
						label.setAttribute('fill', '#007acc');
						label.setAttribute('font-size', '12');
						label.setAttribute('pointer-events', 'none');
						label.textContent = '+ Connect to ' + (data.nodes.find(n => n.id === hoverNode.id) || {}).label || hoverNode.id;
						addIndicator(label);
					} else {
						targetNodeId = null;
						targetCluster = null;
						if (sourceNode.subgraph) {
							const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
							label.setAttribute('x', String(svgPt.x + 15));
							label.setAttribute('y', String(svgPt.y - 10));
							label.setAttribute('fill', '#cc6600');
							label.setAttribute('font-size', '12');
							label.setAttribute('pointer-events', 'none');
							label.textContent = '× Remove from subgraph';
							addIndicator(label);
						}
					}
					} // close htmlHit else
				};

				const onMouseUp = () => {
					document.removeEventListener('mousemove', onMouseMove);
					document.removeEventListener('mouseup', onMouseUp);
					clearIndicators();
					container.classList.remove('mw-dragging');
					document.body.style.cursor = '';

					// Remove HTML overlay drop zones
					for (const dz of htmlDropZones) {
						if (dz.element.parentNode) { dz.element.parentNode.removeChild(dz.element); }
					}
					htmlDropZones.length = 0;

					if (!dragStarted) { return; }

					_flowDragJustCompleted = true;
					setTimeout(() => { _flowDragJustCompleted = false; }, 200);

					if (targetNodeId) {
						// Create a new edge from source to target
						data.edges.push({ from: sourceNode.id, to: targetNodeId, label: '', type: '-->' });
						onChange();
					} else if (targetCluster) {
						if (sourceNode.subgraph !== targetCluster.sg.id) {
							sourceNode.subgraph = targetCluster.sg.id;
							onChange();
						}
					} else if (sourceNode.subgraph) {
						sourceNode.subgraph = '';
						onChange();
					}
				};

				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			});
		}
	}

	function handlePieClick(e, svg, data, container, onChange) {
		let target = e.target;
		while (target && target !== svg) {
			if (target.tagName === 'path') {
				const paths = Array.from(svg.querySelectorAll('path')).filter(p => {
					const d = p.getAttribute('d') || '';
					return d.includes('A') && d.includes('L');
				});
				const sliceIdx = paths.indexOf(target);
				if (sliceIdx >= 0 && sliceIdx < data.slices.length) {
					showSlicePopover(container, target, data.slices[sliceIdx], sliceIdx, data, onChange);
					return;
				}
			}
			if ((target.tagName === 'text' || target.tagName === 'tspan') && target.closest && target.closest('.legend, .pieCircle, [class*="pie"]')) {
				const text = (target.textContent || '').trim();
				const slice = data.slices.find(s => text.includes(s.label));
				if (slice) {
					const idx = data.slices.indexOf(slice);
					showSlicePopover(container, target, slice, idx, data, onChange);
					return;
				}
			}
			target = target.parentElement;
		}
		dismissPopover();
	}

	function showSlicePopover(container, anchorEl, slice, idx, data, onChange) {
		const fields = [
			{ label: 'Label', value: slice.label, placeholder: 'Slice label', onChange: (v) => { slice.label = v; } },
			{ label: 'Value', type: 'number', value: slice.value, placeholder: 'Value', onChange: (v) => { slice.value = parseFloat(v) || 0; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => { data.slices.splice(idx, 1); dismissPopover(); onChange(); }
		);
		showPopoverAt(container, anchorEl, form);
	}

	// ===== SVG Click Handler: State Diagram =====

	// ===== SVG Click Handler: Bar Chart =====

	function handleBarChartClick(e, svg, data, container, onChange) {
		let target = e.target;
		while (target && target !== svg) {
			// Click on a bar rect
			if (target.tagName === 'rect') {
				const allRects = Array.from(svg.querySelectorAll('rect')).filter(r => {
					const w = parseFloat(r.getAttribute('width') || '0');
					const h = parseFloat(r.getAttribute('height') || '0');
					const cls = (r.getAttribute('class') || '').toLowerCase();
					// Exclude background, axis, and tiny rects; include chart bars
					return w > 2 && h > 2 && !cls.includes('apexcharts') && !cls.includes('background');
				});
				// Try matching by checking data bars
				if (data.bars.length > 0 && data.bars[0].values.length > 0) {
					// Filter to only the bar rects (heuristic: bars are typically the tallest rects in the chart)
					const barCount = data.bars[0].values.length;
					// Get rects that look like bar chart bars
					const barRects = allRects.filter(r => {
						const fill = r.getAttribute('fill') || r.style.fill || '';
						const cls = (r.getAttribute('class') || '').toLowerCase();
						// Bars typically have color fill, are not axis/grid elements
						return fill && fill !== 'none' && fill !== 'transparent' &&
							!cls.includes('grid') && !cls.includes('domain') && !cls.includes('tick');
					});
					// Take the last N rects matching bar count
					const candidateBars = barRects.length >= barCount ? barRects.slice(-barCount) : barRects;
					const barIdx = candidateBars.indexOf(target);
					if (barIdx >= 0 && barIdx < barCount) {
						showBarValuePopover(container, target, data, 0, barIdx, onChange);
						return;
					}
				}
			}
			// Click on axis label text
			if (target.tagName === 'text' || target.tagName === 'tspan') {
				const text = (target.textContent || '').trim();
				if (text === data.title) {
					showBarTitlePopover(container, target, data, onChange);
					return;
				}
				if (data.yAxisLabel && text === data.yAxisLabel) {
					showBarAxisLabelPopover(container, target, data, 'y', onChange);
					return;
				}
				if (data.xAxisLabel && text === data.xAxisLabel) {
					showBarAxisLabelPopover(container, target, data, 'x', onChange);
					return;
				}
				const catIdx = data.xCategories.indexOf(text);
				if (catIdx >= 0) {
					showBarCategoryPopover(container, target, data, catIdx, onChange);
					return;
				}
			}
			target = target.parentElement;
		}
		dismissPopover();
	}

	function showBarValuePopover(container, anchorEl, data, barSetIdx, valueIdx, onChange) {
		const barSet = data.bars[barSetIdx];
		if (!barSet) { return; }
		const catLabel = data.xCategories[valueIdx] || ('Bar ' + (valueIdx + 1));
		const fields = [
			{ label: 'Category', value: catLabel, placeholder: 'Category label', onChange: (v) => {
				if (data.xCategories[valueIdx] !== undefined) { data.xCategories[valueIdx] = v; }
			}},
			{ label: 'Value', type: 'number', value: barSet.values[valueIdx], placeholder: 'Bar value', onChange: (v) => {
				barSet.values[valueIdx] = parseFloat(v) || 0;
			}}
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => {
				// Delete this bar entry from all bar sets and categories
				for (const b of data.bars) { b.values.splice(valueIdx, 1); }
				for (const l of data.lines) { l.values.splice(valueIdx, 1); }
				data.xCategories.splice(valueIdx, 1);
				dismissPopover(); onChange();
			}
		);
		showPopoverAt(container, anchorEl, form);
	}

	function showBarTitlePopover(container, anchorEl, data, onChange) {
		const fields = [
			{ label: 'Title', value: data.title, placeholder: 'Chart title', onChange: (v) => { data.title = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			null
		);
		showPopoverAt(container, anchorEl, form);
	}

	function showBarAxisLabelPopover(container, anchorEl, data, axis, onChange) {
		const isY = axis === 'y';
		const fields = [
			{ label: isY ? 'Y-Axis Label' : 'X-Axis Label', value: isY ? data.yAxisLabel : data.xAxisLabel, placeholder: 'Axis label', onChange: (v) => {
				if (isY) { data.yAxisLabel = v; } else { data.xAxisLabel = v; }
			}}
		];
		if (isY && (data.yMin !== null || data.yMax !== null)) {
			fields.push({ label: 'Min', type: 'number', value: data.yMin || 0, placeholder: 'Min value', onChange: (v) => { data.yMin = parseFloat(v) || 0; } });
			fields.push({ label: 'Max', type: 'number', value: data.yMax || 100, placeholder: 'Max value', onChange: (v) => { data.yMax = parseFloat(v) || 100; } });
		}
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			null
		);
		showPopoverAt(container, anchorEl, form);
	}

	function showBarCategoryPopover(container, anchorEl, data, catIdx, onChange) {
		const fields = [
			{ label: 'Category', value: data.xCategories[catIdx], placeholder: 'Category label', onChange: (v) => {
				data.xCategories[catIdx] = v;
			}}
		];
		// Show values for each bar set at this category index
		for (let bi = 0; bi < data.bars.length; bi++) {
			const barSet = data.bars[bi];
			if (barSet.values[catIdx] !== undefined) {
				fields.push({
					label: 'Value' + (data.bars.length > 1 ? ' ' + (bi + 1) : ''),
					type: 'number',
					value: barSet.values[catIdx],
					placeholder: 'Bar value',
					onChange: (v) => { barSet.values[catIdx] = parseFloat(v) || 0; }
				});
			}
		}
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => {
				for (const b of data.bars) { b.values.splice(catIdx, 1); }
				for (const l of data.lines) { l.values.splice(catIdx, 1); }
				data.xCategories.splice(catIdx, 1);
				dismissPopover(); onChange();
			}
		);
		showPopoverAt(container, anchorEl, form);
	}

	function handleStateClick(e, svg, data, container, onChange) {
		let target = e.target;
		while (target && target !== svg) {
			const cls = (target.getAttribute && target.getAttribute('class')) || '';

			// Click on a state node
			const stateGroup = (cls.includes('node') || cls.includes('state'))
				? target
				: (target.closest && target.closest('.node, .statediagram-state, .stateGroup, [id*=\"state-\"]'));
			if (stateGroup) {
				const gId = stateGroup.getAttribute('id') || '';
				const matchId = gId.match(/state-([^-]+)-/) || gId.match(/state-(\w+)/) || gId.match(/(\w+)/);
				let state = matchId ? data.states.find(s => s.id === matchId[1]) : null;
				if (!state) {
					const textEls = stateGroup.querySelectorAll('text, tspan');
					for (const te of textEls) {
						const t = (te.textContent || '').trim();
						state = data.states.find(s => s.id === t || s.label === t);
						if (state) { break; }
					}
				}
				if (state) {
					showStatePopover(container, stateGroup, state, data, onChange);
					return;
				}
			}

			// Click on a transition label
			const edgeLabelGroup = cls.includes('edgeLabel') ? target : (target.closest && target.closest('.edgeLabel, .transition-label'));
			if (edgeLabelGroup) {
				const allLabels = Array.from(svg.querySelectorAll('.edgeLabel, .transition-label'));
				const edgeIdx = allLabels.indexOf(edgeLabelGroup);
				if (edgeIdx >= 0 && edgeIdx < data.transitions.length) {
					showTransitionPopover(container, edgeLabelGroup, data.transitions[edgeIdx], edgeIdx, data, onChange);
					return;
				}
			}

			// Click on a transition path or hit-area
			const hitArea = cls.includes('mw-state-hit-area') ? target : null;
			if (hitArea) {
				const idxAttr = hitArea.getAttribute('data-trans-idx');
				if (idxAttr !== null) {
					const tIdx = parseInt(idxAttr, 10);
					if (tIdx >= 0 && tIdx < data.transitions.length) {
						showTransitionPopover(container, hitArea, data.transitions[tIdx], tIdx, data, onChange);
						return;
					}
				}
			}

			if (cls.includes('edgePath') || cls.includes('transition') || (target.closest && target.closest('.edgePath, .transition'))) {
				const edgePath = cls.includes('edgePath') || cls.includes('transition') ? target : target.closest('.edgePath, .transition');
				const allPaths = Array.from(svg.querySelectorAll('.edgePath, .transition'));
				const pathIdx = allPaths.indexOf(edgePath);
				if (pathIdx >= 0 && pathIdx < data.transitions.length) {
					showTransitionPopover(container, edgePath, data.transitions[pathIdx], pathIdx, data, onChange);
					return;
				}
			}

			// Click on transition text directly
			const transText = cls.includes('transitionLabel') ? target : null;
			if (transText) {
				const allTransTexts = Array.from(svg.querySelectorAll('.transitionLabel'));
				const tIdx = allTransTexts.indexOf(transText);
				if (tIdx >= 0 && tIdx < data.transitions.length) {
					showTransitionPopover(container, transText, data.transitions[tIdx], tIdx, data, onChange);
					return;
				}
			}

			target = target.parentElement;
		}
		dismissPopover();
	}

	function showStatePopover(container, anchorEl, state, data, onChange) {
		const fields = [
			{ label: 'ID', value: state.id, placeholder: 'State identifier', onChange: (v) => {
				const oldId = state.id;
				state.id = v;
				data.transitions.forEach(t => {
					if (t.from === oldId) { t.from = v; }
					if (t.to === oldId) { t.to = v; }
				});
			}},
			{ label: 'Label', value: state.label, placeholder: 'Display label (optional)', onChange: (v) => { state.label = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => {
				const idx = data.states.indexOf(state);
				if (idx >= 0) {
					data.states.splice(idx, 1);
					data.transitions = data.transitions.filter(t => t.from !== state.id && t.to !== state.id);
				}
				dismissPopover(); onChange();
			}
		);
		showPopoverAt(container, anchorEl, form);
	}

	// ===== State Diagram Transition Drag =====

	let _stateDragJustCompleted = false;

	function setupStateDrag(svg, data, container, onChange) {
		let dragIndicators = [];

		function screenToSVG(clientX, clientY) {
			const pt = svg.createSVGPoint();
			pt.x = clientX;
			pt.y = clientY;
			const ctm = svg.getScreenCTM();
			return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
		}

		function getStateCenters() {
			const centers = [];
			const svgCTM = svg.getCTM();
			// Try multiple selectors for state nodes
			const nodeGroups = svg.querySelectorAll('.node, .statediagram-state, .stateGroup, [id*=\"state-\"]');
			nodeGroups.forEach(group => {
				const gId = group.getAttribute('id') || '';
				const matchId = gId.match(/state-([^-]+)-/) || gId.match(/state-(\w+)/) || gId.match(/(\w+)/);
				let state = matchId ? data.states.find(s => s.id === matchId[1]) : null;
				if (!state) {
					// Match by text content
					const textEls = group.querySelectorAll('text, tspan');
					for (const te of textEls) {
						const t = (te.textContent || '').trim();
						state = data.states.find(s => s.id === t || s.label === t);
						if (state) { break; }
					}
				}
				if (state && !centers.find(c => c.id === state.id)) {
					try {
						const bbox = group.getBBox();
						// Convert bbox center from element's local space to SVG root space
						const localCx = bbox.x + bbox.width / 2;
						const localCy = bbox.y + bbox.height / 2;
						const ctm = group.getCTM();
						let cx = localCx, cy = localCy;
						let rootBbox = bbox;
						if (ctm && svgCTM) {
							const pt = svg.createSVGPoint();
							pt.x = localCx;
							pt.y = localCy;
							const rootPt = pt.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							cx = rootPt.x;
							cy = rootPt.y;
							// Also transform bbox corners to get root-space bbox
							const pt1 = svg.createSVGPoint();
							pt1.x = bbox.x; pt1.y = bbox.y;
							const rp1 = pt1.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							const pt2 = svg.createSVGPoint();
							pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
							const rp2 = pt2.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							rootBbox = { x: Math.min(rp1.x, rp2.x), y: Math.min(rp1.y, rp2.y),
								width: Math.abs(rp2.x - rp1.x), height: Math.abs(rp2.y - rp1.y) };
						}
						centers.push({ id: state.id, x: cx, y: cy, bbox: rootBbox });
					} catch (_) {}
				}
			});
			// Also look for [*] (start/end) markers — small circles with class containing "start" or "end"
			const startEndCircles = svg.querySelectorAll('circle[class*=\"start\"], circle[class*=\"end\"], [id*=\"start\"], [id*=\"end\"]');
			startEndCircles.forEach(c => {
				try {
					const bbox = c.getBBox();
					if (bbox.width < 40 && bbox.height < 40) {
						const localCx = bbox.x + bbox.width / 2;
						const localCy = bbox.y + bbox.height / 2;
						const ctm = c.getCTM();
						let cx = localCx, cy = localCy;
						let rootBbox = bbox;
						if (ctm && svgCTM) {
							const pt = svg.createSVGPoint();
							pt.x = localCx;
							pt.y = localCy;
							const rootPt = pt.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							cx = rootPt.x;
							cy = rootPt.y;
							const pt1 = svg.createSVGPoint();
							pt1.x = bbox.x; pt1.y = bbox.y;
							const rp1 = pt1.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							const pt2 = svg.createSVGPoint();
							pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
							const rp2 = pt2.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
							rootBbox = { x: Math.min(rp1.x, rp2.x), y: Math.min(rp1.y, rp2.y),
								width: Math.abs(rp2.x - rp1.x), height: Math.abs(rp2.y - rp1.y) };
						}
						centers.push({ id: '[*]', x: cx, y: cy, bbox: rootBbox });
					}
				} catch (_) {}
			});
			return centers;
		}

		function findNearestState(svgX, svgY, centers, maxDist) {
			let nearest = null;
			let minDist = Infinity;
			let nearestNamed = null;
			let minDistNamed = Infinity;
			for (const c of centers) {
				// Check if point is inside the bbox (with margin) or within distance
				const margin = 30;
				const inBBox = c.bbox && svgX >= c.bbox.x - margin && svgX <= c.bbox.x + c.bbox.width + margin &&
					svgY >= c.bbox.y - margin && svgY <= c.bbox.y + c.bbox.height + margin;
				const d = Math.hypot(svgX - c.x, svgY - c.y);
				if (d < minDist && (inBBox || !maxDist || d <= maxDist)) { minDist = d; nearest = c; }
				if (c.id !== '[*]' && d < minDistNamed && (inBBox || !maxDist || d <= maxDist)) { minDistNamed = d; nearestNamed = c; }
			}
			// When called with maxDist (drag mode), prefer named states over [*]
			// unless the named state is significantly further away
			if (maxDist && nearest && nearest.id === '[*]' && nearestNamed && minDistNamed < minDist * 2.5) {
				return nearestNamed;
			}
			return nearest;
		}

		function clearIndicators() {
			dragIndicators.forEach(ind => ind.remove());
			dragIndicators = [];
		}

		function addIndicator(element) {
			svg.appendChild(element);
			dragIndicators.push(element);
		}

		// Prevent click handler from firing after a drag
		svg.addEventListener('click', (e) => {
			if (_stateDragJustCompleted) {
				_stateDragJustCompleted = false;
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		}, true);

		// Gather all edge groups and their transition paths, paired with labels
		// Mermaid renders .edgePath elements in <g class="edgePaths"> and 
		// .edgeLabel elements in <g class="edgeLabels"> — they correspond by child index.
		const edgePathContainer = svg.querySelector('.edgePaths');
		const edgeLabelContainer = svg.querySelector('.edgeLabels');
		// Accept ALL children of the container, not just those with a specific class
		const edgePathGroups = edgePathContainer
			? Array.from(edgePathContainer.children)
			: [];
		const edgeLabelGroups = edgeLabelContainer
			? Array.from(edgeLabelContainer.children)
			: [];

		let transitionPaths = [];
		if (edgePathGroups.length > 0) {
			for (let i = 0; i < edgePathGroups.length; i++) {
				const eg = edgePathGroups[i];
				const p = eg.querySelector('path') || (eg.tagName === 'path' ? eg : null);
				if (!p) { continue; }
				// Get label from parallel edgeLabel element by index
				let label = '';
				if (i < edgeLabelGroups.length) {
					const labelEl = edgeLabelGroups[i];
					const textContent = (labelEl.textContent || '').trim().replace(/\s+/g, ' ');
					if (textContent) { label = textContent; }
				}
				// Also try to extract from/to state names from the edge group ID
				// Mermaid often uses IDs like "edge-Draft-Review-0" or "id-Draft-Review-0"
				let edgeFrom = '', edgeTo = '';
				const edgeId = eg.getAttribute('id') || '';
				if (edgeId) {
					// Try patterns: "edge-StateA-StateB-N" or "id-StateA-StateB-N"
					// or "L-StateA-StateB-N" (Mermaid v10 state diagrams)
					const idMatch = edgeId.match(/^(?:edge|id|L)-(.+?)-(.+?)-(\d+)$/i);
					if (idMatch) {
						edgeFrom = idMatch[1];
						edgeTo = idMatch[2];
					}
				}
				transitionPaths.push({ group: eg, path: p, label, edgeFrom, edgeTo });
			}
		}

		// Fallback: broader selectors
		if (transitionPaths.length < data.transitions.length) {
			const edgeGroups = Array.from(svg.querySelectorAll('.edgePath, .transition, [class*="edge"], [class*="transition"]'));
			if (edgeGroups.length >= data.transitions.length) {
				transitionPaths = [];
				for (let i = 0; i < edgeGroups.length; i++) {
					const eg = edgeGroups[i];
					const p = eg.querySelector('path') || (eg.tagName === 'path' ? eg : null);
					if (!p) { continue; }
					// Try to get label from parallel edgeLabels container
					let label = '';
					if (i < edgeLabelGroups.length) {
						const labelEl = edgeLabelGroups[i];
						const textContent = (labelEl.textContent || '').trim().replace(/\s+/g, ' ');
						if (textContent) { label = textContent; }
					}
					let edgeFrom = '', edgeTo = '';
					const edgeId = eg.getAttribute('id') || '';
					const idMatch = edgeId.match(/^(?:edge|id|L)-(.+?)-(.+?)-(\d+)$/i);
					if (idMatch) { edgeFrom = idMatch[1]; edgeTo = idMatch[2]; }
					transitionPaths.push({ group: eg, path: p, label, edgeFrom, edgeTo });
				}
			}
		}
		if (transitionPaths.length < data.transitions.length) {
			transitionPaths = [];
			const allPaths = Array.from(svg.querySelectorAll('path[marker-end], line[marker-end]'));
			for (const p of allPaths) {
				if (p.closest && p.closest('.node, .statediagram-state')) { continue; }
				transitionPaths.push({ group: p.parentElement || p, path: p, label: '', edgeFrom: '', edgeTo: '' });
			}
		}
		const stateCentersInit = getStateCenters();

		// Helper: convert a point from an element's local coordinate space to SVG root space
		function toSVGRoot(element, x, y) {
			try {
				const pt = svg.createSVGPoint();
				pt.x = x;
				pt.y = y;
				const ctm = element.getCTM();
				if (ctm) {
					const svgCTM = svg.getCTM();
					if (svgCTM) {
						return pt.matrixTransform(ctm).matrixTransform(svgCTM.inverse());
					}
					return pt.matrixTransform(ctm);
				}
			} catch (_) {}
			return { x, y };
		}

		// Match each SVG path to a data.transitions entry using multiple strategies:
		// 1) Label text matching (most reliable — uses parallel edgePath/edgeLabel structure)
		// 2) Combined label + proximity matching (for sibling transitions with same endpoints)
		// 3) Directional proximity matching (endpoints near states)
		// 4) Fallback to sequential index
		const matchedDataIndices = new Set();
		let fallbackIdx = 0;

		for (let i = 0; i < transitionPaths.length; i++) {
			const { group: edgeGroup, path: pathEl, label: svgLabel, edgeFrom, edgeTo } = transitionPaths[i];

			try {
				const pathLen = pathEl.getTotalLength();
				if (pathLen < 10) { continue; }

				let matchedIdx = -1;

				// Normalize label for comparison (trim, collapse whitespace)
				const normLabel = svgLabel.replace(/\s+/g, ' ').trim();

				// Get path endpoints in SVG root space for proximity matching
				const rawStart = pathEl.getPointAtLength(0);
				const rawEnd = pathEl.getPointAtLength(pathLen);
				const startPt = toSVGRoot(pathEl, rawStart.x, rawStart.y);
				const endPt = toSVGRoot(pathEl, rawEnd.x, rawEnd.y);
				const nearStart = findNearestState(startPt.x, startPt.y, stateCentersInit);
				const nearEnd = findNearestState(endPt.x, endPt.y, stateCentersInit);

				// Strategy 1: Match by edge ID from/to (Mermaid encodes state names in edge IDs)
				if (edgeFrom && edgeTo) {
					for (let ti = 0; ti < data.transitions.length; ti++) {
						if (matchedDataIndices.has(ti)) { continue; }
						const t = data.transitions[ti];
						if ((t.from === edgeFrom && t.to === edgeTo) ||
							(t.from === edgeTo && t.to === edgeFrom && normLabel && t.label.replace(/\s+/g, ' ').trim() === normLabel)) {
							matchedIdx = ti;
							break;
						}
					}
				}

				// Strategy 2: Match by label + endpoint states (handles sibling transitions)
				if (matchedIdx < 0 && normLabel && nearStart && nearEnd) {
					for (let ti = 0; ti < data.transitions.length; ti++) {
						if (matchedDataIndices.has(ti)) { continue; }
						const t = data.transitions[ti];
						const tLabel = t.label.replace(/\s+/g, ' ').trim();
						if (tLabel === normLabel &&
							((t.from === nearStart.id && t.to === nearEnd.id) ||
							 (t.from === nearEnd.id && t.to === nearStart.id))) {
							matchedIdx = ti;
							break;
						}
					}
				}

				// Strategy 3: Match by label text alone
				if (matchedIdx < 0 && normLabel) {
					for (let ti = 0; ti < data.transitions.length; ti++) {
						if (matchedDataIndices.has(ti)) { continue; }
						const tLabel = data.transitions[ti].label.replace(/\s+/g, ' ').trim();
						if (tLabel === normLabel) {
							matchedIdx = ti;
							break;
						}
					}
				}

				// Strategy 4: Directional proximity matching
				if (matchedIdx < 0 && nearStart && nearEnd) {
					for (let ti = 0; ti < data.transitions.length; ti++) {
						if (matchedDataIndices.has(ti)) { continue; }
						const t = data.transitions[ti];
						if (t.from === nearStart.id && t.to === nearEnd.id) {
							matchedIdx = ti;
							break;
						}
					}
					if (matchedIdx < 0) {
						for (let ti = 0; ti < data.transitions.length; ti++) {
							if (matchedDataIndices.has(ti)) { continue; }
							const t = data.transitions[ti];
							if (t.from === nearEnd.id && t.to === nearStart.id) {
								matchedIdx = ti;
								break;
							}
						}
					}
				}

				// Strategy 5: Fallback to next unmatched index
				if (matchedIdx < 0) {
					while (fallbackIdx < data.transitions.length && matchedDataIndices.has(fallbackIdx)) { fallbackIdx++; }
					if (fallbackIdx >= data.transitions.length) { continue; }
					matchedIdx = fallbackIdx;
				}
				matchedDataIndices.add(matchedIdx);

				const trans = data.transitions[matchedIdx];

				// Wide invisible overlay on the path
				const hitPath = pathEl.cloneNode(false);
				hitPath.setAttribute('stroke', 'transparent');
				hitPath.setAttribute('stroke-width', '20');
				hitPath.setAttribute('fill', 'none');
				hitPath.setAttribute('class', 'mw-state-hit-area');
				hitPath.setAttribute('data-trans-idx', String(matchedIdx));
				hitPath.style.cursor = 'grab';
				hitPath.style.pointerEvents = 'stroke';
				svg.appendChild(hitPath);

				// Reuse startPt/endPt already computed in SVG root space above

				// Determine from/to roles for each endpoint
				const fromCenter = stateCentersInit.find(c => c.id === trans.from);
				const toCenter = stateCentersInit.find(c => c.id === trans.to);

				const endpoints = [
					{ x: startPt.x, y: startPt.y, role: 'from' },
					{ x: endPt.x, y: endPt.y, role: 'to' }
				];

				// Verify: if from-center is closer to endPt, swap roles
				if (fromCenter && toCenter) {
					const d1 = Math.hypot(startPt.x - fromCenter.x, startPt.y - fromCenter.y);
					const d2 = Math.hypot(endPt.x - fromCenter.x, endPt.y - fromCenter.y);
					if (d2 < d1) {
						endpoints[0].role = 'to';
						endpoints[1].role = 'from';
					}
				}

				for (const ep of endpoints) {
					const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
					handle.setAttribute('cx', String(ep.x));
					handle.setAttribute('cy', String(ep.y));
					handle.setAttribute('r', '10');
					handle.setAttribute('fill', 'rgba(0, 122, 204, 0.15)');
					handle.setAttribute('stroke', 'rgba(0, 122, 204, 0.4)');
					handle.setAttribute('stroke-width', '1.5');
					handle.setAttribute('class', 'mw-state-endpoint-handle');
					handle.setAttribute('data-trans-idx', String(matchedIdx));
					handle.setAttribute('data-endpoint', ep.role);
					handle.setAttribute('data-from', trans.from);
					handle.setAttribute('data-to', trans.to);
					handle.setAttribute('data-label', trans.label || '');
					handle.style.cursor = 'crosshair';
					handle.style.opacity = '0';
					handle.style.pointerEvents = 'none';
					svg.appendChild(handle);
				}
			} catch (_) { /* skip if path methods fail */ }
		}

		// Show/hide endpoint handles on hover
		svg.addEventListener('mouseover', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-state-hit-area') || tcls.includes('mw-state-endpoint-handle')) {
				const idx = t.getAttribute('data-trans-idx');
				if (idx !== null) {
					svg.querySelectorAll('.mw-state-endpoint-handle[data-trans-idx="' + idx + '"]').forEach(h => { h.style.opacity = '1'; h.style.pointerEvents = 'all'; });
				}
			}
		});
		svg.addEventListener('mouseout', (hoverE) => {
			const t = hoverE.target;
			const tcls = (t.getAttribute && t.getAttribute('class')) || '';
			if (tcls.includes('mw-state-hit-area') || tcls.includes('mw-state-endpoint-handle')) {
				const idx = t.getAttribute('data-trans-idx');
				if (idx !== null) {
					setTimeout(() => {
						const stillHovered = svg.querySelector('.mw-state-endpoint-handle[data-trans-idx="' + idx + '"]:hover, .mw-state-hit-area[data-trans-idx="' + idx + '"]:hover');
						if (!stillHovered) {
							svg.querySelectorAll('.mw-state-endpoint-handle[data-trans-idx="' + idx + '"]').forEach(h => { h.style.opacity = '0'; h.style.pointerEvents = 'none'; });
						}
					}, 100);
				}
			}
		});

		// Mousedown on endpoint handles starts a drag
		svg.addEventListener('mousedown', (e) => {
			if (e.button !== 0 || activePopover) { return; }

			const targetCls = (e.target.getAttribute && e.target.getAttribute('class')) || '';
			if (!targetCls.includes('mw-state-endpoint-handle')) { return; }

			const endpoint = e.target.getAttribute('data-endpoint');
			const handleFrom = e.target.getAttribute('data-from');
			const handleTo = e.target.getAttribute('data-to');
			const handleLabel = e.target.getAttribute('data-label') || '';
			if (!endpoint || !handleFrom || !handleTo) { return; }

			// Find the transition by from/to/label (more reliable than index)
			let transIdx = -1;
			for (let ti = 0; ti < data.transitions.length; ti++) {
				const t = data.transitions[ti];
				if (t.from === handleFrom && t.to === handleTo && (t.label || '') === handleLabel) {
					transIdx = ti;
					break;
				}
			}
			// Fallback to index attribute
			if (transIdx < 0) {
				const transIdxStr = e.target.getAttribute('data-trans-idx');
				transIdx = transIdxStr !== null ? parseInt(transIdxStr, 10) : -1;
			}
			if (transIdx < 0 || transIdx >= data.transitions.length) { return; }

			const startScreenX = e.clientX;
			const startScreenY = e.clientY;
			const stateCenters = getStateCenters();
			let dragStarted = false;
			let targetState = null;
			const DRAG_THRESHOLD = 6;

			const onMouseMove = (moveE) => {
				const dx = moveE.clientX - startScreenX;
				const dy = moveE.clientY - startScreenY;

				if (!dragStarted) {
					if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
					dragStarted = true;
					container.classList.add('mw-dragging');
					document.body.style.cursor = 'crosshair';
					const sel = window.getSelection();
					if (sel) { sel.removeAllRanges(); }
				}

				moveE.preventDefault();
				const svgPt = screenToSVG(moveE.clientX, moveE.clientY);
				clearIndicators();

				const nearest = findNearestState(svgPt.x, svgPt.y, stateCenters);
				targetState = nearest ? nearest.id : null;

				if (nearest) {
					// Highlight the target state
					const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
					rect.setAttribute('x', String(nearest.bbox.x - 4));
					rect.setAttribute('y', String(nearest.bbox.y - 4));
					rect.setAttribute('width', String(nearest.bbox.width + 8));
					rect.setAttribute('height', String(nearest.bbox.height + 8));
					rect.setAttribute('rx', '8');
					rect.setAttribute('ry', '8');
					rect.setAttribute('fill', 'none');
					rect.setAttribute('stroke', '#007acc');
					rect.setAttribute('stroke-width', '3');
					rect.setAttribute('stroke-dasharray', '6,3');
					rect.setAttribute('pointer-events', 'none');
					addIndicator(rect);

					// Draw a line from the other endpoint to the cursor
					const otherField = endpoint === 'from' ? 'to' : 'from';
					const otherCenter = stateCenters.find(c => c.id === data.transitions[transIdx][otherField]);
					if (otherCenter) {
						const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
						line.setAttribute('x1', String(otherCenter.x));
						line.setAttribute('y1', String(otherCenter.y));
						line.setAttribute('x2', String(nearest.x));
						line.setAttribute('y2', String(nearest.y));
						line.setAttribute('stroke', '#007acc');
						line.setAttribute('stroke-width', '2');
						line.setAttribute('stroke-dasharray', '6,3');
						line.setAttribute('pointer-events', 'none');
						addIndicator(line);
					}
				}
			};

			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				clearIndicators();
				container.classList.remove('mw-dragging');
				document.body.style.cursor = '';

				if (!dragStarted) { return; }

				_stateDragJustCompleted = true;
				setTimeout(() => { _stateDragJustCompleted = false; }, 200);

				if (targetState) {
					const trans = data.transitions[transIdx];
					if (trans[endpoint] !== targetState) {
						trans[endpoint] = targetState;
						onChange();
					}
				}
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});
	}

	function showTransitionPopover(container, anchorEl, transition, idx, data, onChange) {
		const stateOptions = [
			{ value: '[*]', label: '[*] (Start/End)' },
			...data.states.map(s => ({ value: s.id, label: s.label || s.id }))
		];
		const fields = [
			{ label: 'From', type: 'select', options: stateOptions, value: transition.from, onChange: (v) => { transition.from = v; } },
			{ label: 'To', type: 'select', options: stateOptions, value: transition.to, onChange: (v) => { transition.to = v; } },
			{ label: 'Label', value: transition.label, placeholder: 'Transition label', onChange: (v) => { transition.label = v; } }
		];
		const form = buildPopoverForm(fields,
			() => { dismissPopover(); onChange(); },
			() => { data.transitions.splice(idx, 1); dismissPopover(); onChange(); }
		);
		showPopoverAt(container, anchorEl, form);
	}

	// ===== Preview =====

	function isDarkTheme() {
		const bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim();
		if (!bg) { return true; } // Assume dark if unknown
		const m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
		if (m) {
			const lum = (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000;
			return lum < 128;
		}
		return document.body.classList.contains('vscode-dark') || document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark';
	}

	async function renderPreview(source, container) {
		if (typeof mermaid === 'undefined') {
			container.innerHTML = '<em>Mermaid not available</em>';
			return;
		}
		try {
			const theme = isDarkTheme() ? 'dark' : 'default';
			mermaid.initialize({
				startOnLoad: false,
				theme: theme,
				securityLevel: 'loose',
				suppressErrorRendering: true,
				arrowMarkerAbsolute: false,
				themeVariables: theme === 'dark' ? {
					actorBkg: '#2d2d2d',
					actorBorder: '#6e93b8',
					actorTextColor: '#e0e0e0',
					actorLineColor: '#6e93b8',
					signalColor: '#e0e0e0',
					signalTextColor: '#e0e0e0',
					noteBkgColor: '#3b3b3b',
					noteTextColor: '#e0e0e0',
					noteBorderColor: '#6e93b8',
					activationBkgColor: '#3b3b3b',
					activationBorderColor: '#6e93b8',
					sequenceNumberColor: '#e0e0e0',
					lineColor: '#8ab4d8',
					primaryColor: '#2d5a7b',
					primaryTextColor: '#e0e0e0',
					primaryBorderColor: '#6e93b8',
					secondaryColor: '#3b3b3b',
					tertiaryColor: '#2d2d2d',
				} : {}
			});
			const id = 'mw-preview-' + (++renderCounter);
			const { svg } = await mermaid.render(id, source);
			container.innerHTML = svg;

			// Fix marker and line colors for dark/light theme visibility
			const svgEl = container.querySelector('svg');
			if (svgEl) {
				const fg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim() || '#ccc';

				// The <base href> tag in the webview breaks SVG marker-end="url(#id)"
				// references because the browser resolves the URL against the base.
				// Flowcharts work because they embed arrowheads in path data, not markers.
				// Fix: inline the arrowheads by drawing SVG shapes at line endpoints,
				// then remove the broken marker-end attributes.
				svgEl.querySelectorAll('[marker-end], [marker-start]').forEach(el => {
					const markerEnd = el.getAttribute('marker-end') || '';
					const markerStart = el.getAttribute('marker-start') || '';

					// Determine which marker type is referenced
					const getMarkerType = (ref) => {
						if (ref.includes('arrowhead')) { return 'arrowhead'; }
						if (ref.includes('crosshead')) { return 'crosshead'; }
						if (ref.includes('filled-head')) { return 'filled-head'; }
						return null;
					};

					const endType = getMarkerType(markerEnd);
					const startType = getMarkerType(markerStart);

					// Get line endpoints
					let x1, y1, x2, y2;
					if (el.tagName === 'line') {
						x1 = parseFloat(el.getAttribute('x1') || '0');
						y1 = parseFloat(el.getAttribute('y1') || '0');
						x2 = parseFloat(el.getAttribute('x2') || '0');
						y2 = parseFloat(el.getAttribute('y2') || '0');
					} else if (el.tagName === 'path') {
						try {
							const len = el.getTotalLength();
							const p1 = el.getPointAtLength(0);
							const p2 = el.getPointAtLength(len);
							x1 = p1.x; y1 = p1.y;
							x2 = p2.x; y2 = p2.y;
						} catch (_) { return; }
					} else { return; }

					const drawArrowhead = (px, py, fromX, fromY, type) => {
						const angle = Math.atan2(py - fromY, px - fromX);
						const size = 8;
						const parent = el.parentElement || svgEl;

						if (type === 'arrowhead') {
							// Filled triangle arrowhead
							const a1x = px - size * Math.cos(angle - Math.PI / 6);
							const a1y = py - size * Math.sin(angle - Math.PI / 6);
							const a2x = px - size * Math.cos(angle + Math.PI / 6);
							const a2y = py - size * Math.sin(angle + Math.PI / 6);
							const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
							arrow.setAttribute('points', `${px},${py} ${a1x},${a1y} ${a2x},${a2y}`);
							arrow.setAttribute('fill', fg);
							arrow.setAttribute('stroke', fg);
							arrow.setAttribute('stroke-width', '1');
							arrow.classList.add('mw-inline-marker');
							parent.appendChild(arrow);
						} else if (type === 'crosshead') {
							// X-shaped cross
							const s = 5;
							const cos = Math.cos(angle);
							const sin = Math.sin(angle);
							const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
							l1.setAttribute('x1', String(px - s * cos + s * sin));
							l1.setAttribute('y1', String(py - s * sin - s * cos));
							l1.setAttribute('x2', String(px + s * cos - s * sin));
							l1.setAttribute('y2', String(py + s * sin + s * cos));
							l1.setAttribute('stroke', fg);
							l1.setAttribute('stroke-width', '2');
							l1.classList.add('mw-inline-marker');
							parent.appendChild(l1);
							const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
							l2.setAttribute('x1', String(px - s * cos - s * sin));
							l2.setAttribute('y1', String(py - s * sin + s * cos));
							l2.setAttribute('x2', String(px + s * cos + s * sin));
							l2.setAttribute('y2', String(py + s * sin - s * cos));
							l2.setAttribute('stroke', fg);
							l2.setAttribute('stroke-width', '2');
							l2.classList.add('mw-inline-marker');
							parent.appendChild(l2);
						} else if (type === 'filled-head') {
							// Open arrowhead (async)
							const a1x = px - size * Math.cos(angle - Math.PI / 5);
							const a1y = py - size * Math.sin(angle - Math.PI / 5);
							const a2x = px - size * Math.cos(angle + Math.PI / 5);
							const a2y = py - size * Math.sin(angle + Math.PI / 5);
							const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
							arrow.setAttribute('points', `${a1x},${a1y} ${px},${py} ${a2x},${a2y}`);
							arrow.setAttribute('fill', 'none');
							arrow.setAttribute('stroke', fg);
							arrow.setAttribute('stroke-width', '2');
							arrow.classList.add('mw-inline-marker');
							parent.appendChild(arrow);
						}
					};

					if (endType) {
						drawArrowhead(x2, y2, x1, y1, endType);
						el.removeAttribute('marker-end');
					}
					if (startType) {
						drawArrowhead(x1, y1, x2, y2, startType);
						el.removeAttribute('marker-start');
					}
				});

				// Fix marker element fills (for any remaining marker references)
				svgEl.querySelectorAll('marker').forEach(marker => {
					marker.querySelectorAll('path, polygon, line, circle, rect').forEach(shape => {
						shape.setAttribute('fill', fg);
						shape.setAttribute('stroke', fg);
						shape.style.fill = fg;
						shape.style.stroke = fg;
					});
				});

				// Fix message line strokes for visibility
				svgEl.querySelectorAll('line[class*="messageLine"], path[class*="messageLine"]').forEach(el => {
					const cls = el.getAttribute('class') || '';
					if (!cls.includes('mw-hit-area') && !cls.includes('mw-endpoint-handle')) {
						el.setAttribute('stroke', fg);
						el.style.stroke = fg;
					}
				});

				// Fix flowchart/state edge path strokes
				svgEl.querySelectorAll('.edgePath path').forEach(el => {
					if (el.getAttribute('marker-end')) {
						el.setAttribute('stroke', fg);
					}
				});
			}
		} catch (err) {
			container.innerHTML = '<div class="mw-preview-error"><strong>Error:</strong> ' +
				escapeHtml(String(err.message || err)) + '</div>';
		}
	}

	// ===== Main Show Function =====

	async function show(options) {
		const { source: initialSource, showDelete = false } = options;

		return new Promise((resolve) => {
			let currentSource = initialSource || '';
			let activeTab = 'visual';
			let diagramType = detectType(currentSource);
			let parsedData = null;
			let resolved = false;
			let previewTimeout = null;

			// Parse
			if (diagramType === 'flowchart') { parsedData = parseFlowchart(currentSource); }
			else if (diagramType === 'pie') { parsedData = parsePie(currentSource); }
			else if (diagramType === 'sequence') { parsedData = parseSequence(currentSource); }
			else if (diagramType === 'state') { parsedData = parseState(currentSource); }
			else if (diagramType === 'bar') { parsedData = parseBarChart(currentSource); }

			// If parsing failed, fall back to source mode
			if (['flowchart', 'pie', 'sequence', 'state', 'bar'].includes(diagramType) && !parsedData) {
				diagramType = 'unknown';
			}

			// Build modal DOM
			const overlay = el('div', 'mw-editor');
			const backdrop = el('div', 'mw-backdrop');
			overlay.appendChild(backdrop);

			const dialog = el('div', 'mw-dialog');
			dialog.setAttribute('role', 'dialog');
			dialog.setAttribute('aria-modal', 'true');

			// Header
			const header = el('div', 'mw-header');
			const typeName = diagramType === 'flowchart' ? 'Flowchart' :
				diagramType === 'pie' ? 'Pie Chart' :
				diagramType === 'sequence' ? 'Sequence Diagram' :
				diagramType === 'state' ? 'State Diagram' : 'Diagram';
			const titleEl = el('h2', 'mw-title', 'Edit ' + typeName);
			header.appendChild(titleEl);

			const visualTab = el('button', 'mw-tab active', 'Visual');
			const sourceTab = el('button', 'mw-tab', 'Source');
			header.appendChild(visualTab);
			header.appendChild(sourceTab);

			const closeBtn = el('button', 'mw-close', '\u00d7');
			closeBtn.title = 'Close';
			header.appendChild(closeBtn);

			dialog.appendChild(header);

			// Body
			const body = el('div', 'mw-body');

			// Visual pane (action bar + preview)
			const visualPane = el('div', 'mw-visual-pane');
			let actionBar = null;
			if (parsedData) {
				actionBar = createActionBar(parsedData, diagramType, rebuildSource);
				visualPane.appendChild(actionBar);
			}
			const previewPane = el('div', 'mw-preview-pane mw-preview-interactive');
			visualPane.appendChild(previewPane);
			body.appendChild(visualPane);

			// Source pane (hidden by default)
			const sourcePane = el('div', 'mw-source-pane mw-hidden');
			const sourceArea = document.createElement('textarea');
			sourceArea.className = 'mw-source-area';
			sourceArea.spellcheck = false;
			sourceArea.value = currentSource;
			sourcePane.appendChild(sourceArea);
			body.appendChild(sourcePane);

			dialog.appendChild(body);

			// Footer
			const footer = el('div', 'mw-footer');
			const deleteBtn = el('button', 'mw-delete-btn', 'Delete');
			deleteBtn.style.display = showDelete ? '' : 'none';
			footer.appendChild(deleteBtn);
			footer.appendChild(el('div', 'mw-spacer'));
			const cancelBtn = el('button', 'mw-cancel-btn', 'Cancel');
			const saveBtn = el('button', 'mw-save-btn', 'Save');
			footer.appendChild(cancelBtn);
			footer.appendChild(saveBtn);
			dialog.appendChild(footer);

			overlay.appendChild(dialog);
			document.body.appendChild(overlay);

			// Debounced preview update
			function schedulePreview() {
				if (previewTimeout) { clearTimeout(previewTimeout); }
				previewTimeout = setTimeout(async () => {
					dismissPopover();
					await renderPreview(currentSource, previewPane);
					attachInteraction();
				}, 400);
			}

			// Rebuild source from parsed data
			function rebuildSource() {
				if (diagramType === 'flowchart' && parsedData) {
					currentSource = buildFlowchart(parsedData);
				} else if (diagramType === 'pie' && parsedData) {
					currentSource = buildPie(parsedData);
				} else if (diagramType === 'sequence' && parsedData) {
					currentSource = buildSequence(parsedData);
				} else if (diagramType === 'state' && parsedData) {
					currentSource = buildState(parsedData);
				} else if (diagramType === 'bar' && parsedData) {
					currentSource = buildBarChart(parsedData);
				}
				if (activeTab === 'source') {
					sourceArea.value = currentSource;
				}
				schedulePreview();
			}

			// Attach click-to-edit interaction to SVG
			function attachInteraction() {
				const svgEl = previewPane.querySelector('svg');
				if (!svgEl || !parsedData) { return; }
				svgEl.classList.add('mw-interactive');
				if (diagramType === 'sequence') {
					setupSequenceDrag(svgEl, parsedData, previewPane, rebuildSource);
				}
				if (diagramType === 'flowchart') {
					setupFlowchartDrag(svgEl, parsedData, previewPane, rebuildSource);
				}
				if (diagramType === 'state') {
					setupStateDrag(svgEl, parsedData, previewPane, rebuildSource);
				}
				svgEl.addEventListener('click', svgClickHandler);
			}

			function svgClickHandler(e) {
				const svgEl = previewPane.querySelector('svg');
				if (!svgEl || !parsedData) { return; }
				if (diagramType === 'sequence') { handleSequenceClick(e, svgEl, parsedData, previewPane, rebuildSource); }
				else if (diagramType === 'flowchart') { handleFlowchartClick(e, svgEl, parsedData, previewPane, rebuildSource); }
				else if (diagramType === 'pie') { handlePieClick(e, svgEl, parsedData, previewPane, rebuildSource); }
				else if (diagramType === 'state') { handleStateClick(e, svgEl, parsedData, previewPane, rebuildSource); }
				else if (diagramType === 'bar') { handleBarChartClick(e, svgEl, parsedData, previewPane, rebuildSource); }
			}

			previewPane.addEventListener('click', (e) => {
				if (e.target === previewPane) { dismissPopover(); }
			});

			// Tab switching
			function setTab(tab) {
				activeTab = tab;
				visualTab.className = 'mw-tab' + (tab === 'visual' ? ' active' : '');
				sourceTab.className = 'mw-tab' + (tab === 'source' ? ' active' : '');
				visualPane.classList.toggle('mw-hidden', tab !== 'visual');
				sourcePane.classList.toggle('mw-hidden', tab !== 'source');
				if (tab === 'source') {
					dismissPopover();
					sourceArea.value = currentSource;
					sourceArea.focus();
				}
			}

			visualTab.addEventListener('click', () => {
				// When switching to visual, re-parse from source
				if (activeTab === 'source') {
					currentSource = sourceArea.value;
					diagramType = detectType(currentSource);
					parsedData = null;
					if (diagramType === 'flowchart') { parsedData = parseFlowchart(currentSource); }
					else if (diagramType === 'pie') { parsedData = parsePie(currentSource); }
					else if (diagramType === 'sequence') { parsedData = parseSequence(currentSource); }
					else if (diagramType === 'state') { parsedData = parseState(currentSource); }
					else if (diagramType === 'bar') { parsedData = parseBarChart(currentSource); }
					// Rebuild action bar
					if (actionBar) { actionBar.remove(); }
					if (parsedData) {
						actionBar = createActionBar(parsedData, diagramType, rebuildSource);
						visualPane.insertBefore(actionBar, previewPane);
					}
					schedulePreview();
				}
				setTab('visual');
			});
			sourceTab.addEventListener('click', () => setTab('source'));

			// Source text editing
			sourceArea.addEventListener('input', () => {
				currentSource = sourceArea.value;
				schedulePreview();
			});

			// Cleanup
			function cleanup(value) {
				if (resolved) { return; }
				resolved = true;
				if (previewTimeout) { clearTimeout(previewTimeout); }
				dismissPopover();
				overlay.remove();
				resolve(value);
			}

			// Actions
			saveBtn.addEventListener('click', () => {
				if (activeTab === 'source') { currentSource = sourceArea.value; }
				cleanup(currentSource.trim() || null);
			});
			cancelBtn.addEventListener('click', () => cleanup(null));
			closeBtn.addEventListener('click', () => cleanup(null));
			backdrop.addEventListener('click', () => cleanup(null));
			deleteBtn.addEventListener('click', () => cleanup('__delete__'));

			// Keyboard
			dialog.addEventListener('keydown', (e) => {
				if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
				if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
					e.preventDefault();
					if (activeTab === 'source') { currentSource = sourceArea.value; }
					cleanup(currentSource.trim() || null);
				}
			});

			// Initial render
			// If no visual editing available, default to source tab
			if (!parsedData) { setTab('source'); }

			renderPreview(currentSource, previewPane).then(() => attachInteraction());
		});
	}

	return { show, detectType, parseFlowchart, buildFlowchart, parsePie, buildPie, parseSequence, buildSequence, parseState, buildState, parseBarChart, buildBarChart };
})();
