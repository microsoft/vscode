/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the inline HTML for the OTel trace viewer webview.
 * Vanilla JS — no build step, no framework. VS Code CSS vars drive theming.
 */
export function getOTelViewerHtml(cspSource: string, nonce: string, initialTraceId?: string): string {
	const initialJson = JSON.stringify({ initialTraceId: initialTraceId ?? null });
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agent Traces</title>
	<style>
		html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
		}
		.root { display: flex; flex-direction: column; height: 100vh; }
		.toolbar {
			display: flex; gap: 8px; align-items: center;
			padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border);
			flex: 0 0 auto;
		}
		.toolbar input, .toolbar select {
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			padding: 3px 6px; font-size: 12px;
			border-radius: 2px;
		}
		.toolbar input { flex: 1 1 auto; min-width: 120px; }
		.toolbar button {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none; padding: 3px 10px; cursor: pointer; font-size: 12px;
			border-radius: 2px;
		}
		.toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground); }
		.breadcrumbs { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--vscode-descriptionForeground); }
		.breadcrumbs a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
		.breadcrumbs a:hover { text-decoration: underline; }
		.main { flex: 1 1 auto; display: flex; min-height: 0; }

		/* List view */
		.list-container { flex: 1 1 auto; overflow: auto; }
		table.traces { width: 100%; border-collapse: collapse; font-size: 12px; }
		table.traces th, table.traces td {
			text-align: left; padding: 4px 8px;
			border-bottom: 1px solid var(--vscode-panel-border);
			white-space: nowrap;
		}
		table.traces th {
			position: sticky; top: 0;
			background: var(--vscode-editor-background);
			cursor: pointer;
			user-select: none;
			font-weight: 600;
			z-index: 1;
		}
		table.traces th:hover { background: var(--vscode-list-hoverBackground); }
		table.traces th .sort-ind { opacity: 0.6; margin-left: 4px; }
		table.traces tbody tr { cursor: pointer; }
		table.traces tbody tr:hover { background: var(--vscode-list-hoverBackground); }
		table.traces tbody tr.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.status-ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green)); }
		.status-err { color: var(--vscode-testing-iconFailed, var(--vscode-charts-red)); }
		.mono { font-family: var(--vscode-editor-font-family); font-size: 11px; }
		.empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }

		/* Trace view */
		.trace-pane { flex: 1 1 auto; display: flex; min-width: 0; min-height: 0; }
		.waterfall { flex: 1 1 auto; overflow: auto; min-width: 0; }
		.details { flex: 0 0 360px; overflow: auto; border-left: 1px solid var(--vscode-panel-border); padding: 10px; display: none; }
		.details.open { display: block; }
		.details h3 { margin: 0 0 6px 0; font-size: 13px; }
		.details .section { margin-bottom: 14px; }
		.details .section-title { font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
		.details dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 11px; margin: 0; }
		.details dt { color: var(--vscode-descriptionForeground); }
		.details dd { margin: 0; font-family: var(--vscode-editor-font-family); word-break: break-all; }

		/* Waterfall rows */
		.wf-header { display: grid; grid-template-columns: minmax(200px, 40%) 1fr; position: sticky; top: 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 8px; font-weight: 600; font-size: 11px; z-index: 1; }
		.wf-row {
			display: grid; grid-template-columns: minmax(200px, 40%) 1fr;
			padding: 2px 8px;
			align-items: center;
			cursor: pointer;
			border-bottom: 1px solid transparent;
			font-size: 12px;
			min-height: 22px;
		}
		.wf-row:hover { background: var(--vscode-list-hoverBackground); }
		.wf-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.wf-name { display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
		.wf-name .caret { display: inline-block; width: 12px; text-align: center; color: var(--vscode-descriptionForeground); }
		.wf-name .label { overflow: hidden; text-overflow: ellipsis; }
		.wf-bar-track {
			position: relative;
			height: 14px;
			background: var(--vscode-editorWidget-background);
			border-radius: 2px;
			margin-left: 6px;
		}
		.wf-bar {
			position: absolute; top: 0; bottom: 0;
			border-radius: 2px;
			min-width: 2px;
		}
		.wf-bar-label {
			position: absolute; top: 0; bottom: 0;
			padding: 0 4px;
			font-size: 10px;
			line-height: 14px;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
		}
		.cat-chat { background: var(--vscode-charts-purple, #9b59b6); }
		.cat-tool { background: var(--vscode-charts-green, #2ecc71); }
		.cat-agent { background: var(--vscode-charts-blue, #3498db); }
		.cat-hook { background: var(--vscode-charts-yellow, #f1c40f); }
		.cat-perm { background: var(--vscode-charts-orange, #e67e22); }
		.cat-other { background: var(--vscode-charts-foreground, var(--vscode-foreground)); opacity: 0.5; }
		.bar-error { outline: 1px solid var(--vscode-charts-red, #e74c3c); }

		.chip {
			display: inline-block;
			font-size: 10px;
			padding: 0 5px;
			margin-right: 4px;
			border-radius: 8px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
	</style>
</head>
<body>
	<div class="root">
		<div class="toolbar" id="toolbar"></div>
		<div class="main" id="main"></div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const INITIAL = ${initialJson};

		// ── Message protocol (promise-based wrapper over postMessage) ──
		const pending = new Map();
		window.addEventListener('message', (ev) => {
			const data = ev.data || {};
			if (data.type === 'openTrace' && typeof data.traceId === 'string') {
				openTrace(data.traceId);
				return;
			}
			if (data.id && pending.has(data.id)) {
				const resolve = pending.get(data.id);
				pending.delete(data.id);
				resolve(data.result);
			}
		});
		function query(q) {
			return new Promise((resolve) => {
				const id = Math.random().toString(36).slice(2);
				pending.set(id, resolve);
				vscode.postMessage({ id, query: q });
			});
		}

		// ── State ──
		const state = {
			view: 'list',         // 'list' | 'trace'
			traceId: null,
			selectedSpanId: null,
			filters: { search: '', agent: '', status: '' },
			sort: { key: 'started_at', dir: 'desc' },
			traces: [],
			agents: [],
			spans: [],
		};

		function categoryOf(span) {
			const op = (span.operation_name || '').toLowerCase();
			if (op === 'chat' || op === 'invoke_llm') return 'chat';
			if (op === 'execute_tool') return 'tool';
			if (op === 'invoke_agent') return 'agent';
			if (op === 'execute_hook') return 'hook';
			if (op === 'permission') return 'perm';
			const name = (span.name || '').toLowerCase();
			if (name.startsWith('invoke_agent')) return 'agent';
			if (name.startsWith('chat')) return 'chat';
			if (name.startsWith('execute_tool')) return 'tool';
			if (name.startsWith('execute_hook')) return 'hook';
			return 'other';
		}

		function fmtMs(ms) {
			if (ms == null) return '—';
			if (ms < 1000) return ms.toFixed(0) + ' ms';
			return (ms / 1000).toFixed(2) + ' s';
		}
		function fmtTime(ms) {
			if (!ms) return '—';
			const d = new Date(ms);
			return d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
		}
		function fmtNum(n) { return n == null ? '—' : String(n); }
		function shortId(id) { return id ? id.slice(0, 8) : ''; }
		function escapeHtml(s) {
			return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
		}

		// ── Rendering ──
		function renderToolbar() {
			const t = document.getElementById('toolbar');
			if (state.view === 'list') {
				t.innerHTML =
					'<strong>Agent Traces</strong>' +
					'<input type="search" id="search" placeholder="Search trace/root/model/agent…" value="' + escapeHtml(state.filters.search) + '">' +
					'<select id="agent"><option value="">All agents</option>' +
						state.agents.map(a => '<option value="' + escapeHtml(a) + '"' + (state.filters.agent === a ? ' selected' : '') + '>' + escapeHtml(a) + '</option>').join('') +
					'</select>' +
					'<select id="status">' +
						'<option value="">All statuses</option>' +
						'<option value="ok"' + (state.filters.status === 'ok' ? ' selected' : '') + '>OK only</option>' +
						'<option value="error"' + (state.filters.status === 'error' ? ' selected' : '') + '>Errors only</option>' +
					'</select>' +
					'<button id="refresh">Refresh</button>';
				document.getElementById('search').addEventListener('input', (e) => { state.filters.search = e.target.value; refreshList(); });
				document.getElementById('agent').addEventListener('change', (e) => { state.filters.agent = e.target.value; refreshList(); });
				document.getElementById('status').addEventListener('change', (e) => { state.filters.status = e.target.value; refreshList(); });
				document.getElementById('refresh').addEventListener('click', () => refreshList());
			} else {
				t.innerHTML =
					'<div class="breadcrumbs">' +
						'<a id="back">← Traces</a>' +
						'<span>/</span>' +
						'<span class="mono">' + escapeHtml(shortId(state.traceId)) + '</span>' +
					'</div>' +
					'<span style="flex:1"></span>' +
					'<button id="refresh-trace">Refresh</button>';
				document.getElementById('back').addEventListener('click', () => { state.view = 'list'; state.traceId = null; state.selectedSpanId = null; render(); refreshList(); });
				document.getElementById('refresh-trace').addEventListener('click', () => openTrace(state.traceId));
			}
		}

		function sortTraces(rows) {
			const { key, dir } = state.sort;
			const sign = dir === 'asc' ? 1 : -1;
			return rows.slice().sort((a, b) => {
				const av = a[key], bv = b[key];
				if (av == null && bv == null) return 0;
				if (av == null) return 1;
				if (bv == null) return -1;
				if (av < bv) return -1 * sign;
				if (av > bv) return 1 * sign;
				return 0;
			});
		}

		function renderList() {
			const main = document.getElementById('main');
			const rows = sortTraces(state.traces);
			const cols = [
				{ key: 'status', label: 'Status' },
				{ key: 'started_at', label: 'Started' },
				{ key: 'duration_ms', label: 'Duration' },
				{ key: 'agent_name', label: 'Agent' },
				{ key: 'root_name', label: 'Name' },
				{ key: 'model', label: 'Model' },
				{ key: 'span_count', label: 'Spans' },
				{ key: 'error_count', label: 'Errors' },
				{ key: 'total_input_tokens', label: 'In' },
				{ key: 'total_output_tokens', label: 'Out' },
			];
			const sortInd = (k) => state.sort.key === k ? (state.sort.dir === 'asc' ? '▲' : '▼') : '';
			const head =
				'<table class="traces"><thead><tr>' +
				cols.map(c => '<th data-key="' + c.key + '">' + escapeHtml(c.label) + ' <span class="sort-ind">' + sortInd(c.key) + '</span></th>').join('') +
				'</tr></thead><tbody>' +
				(rows.length === 0
					? '<tr><td colspan="' + cols.length + '" class="empty">No traces yet. Start a chat or agent session to see traces appear here.</td></tr>'
					: rows.map(r => (
						'<tr data-trace="' + escapeHtml(r.trace_id) + '">' +
							'<td>' + (r.error_count > 0 ? '<span class="status-err">● err</span>' : '<span class="status-ok">● ok</span>') + '</td>' +
							'<td class="mono">' + escapeHtml(fmtTime(r.started_at)) + '</td>' +
							'<td>' + escapeHtml(fmtMs(r.duration_ms)) + '</td>' +
							'<td>' + escapeHtml(r.agent_name ?? '—') + '</td>' +
							'<td>' + escapeHtml(r.root_name ?? '—') + '</td>' +
							'<td>' + escapeHtml(r.model ?? '—') + '</td>' +
							'<td>' + fmtNum(r.span_count) + '</td>' +
							'<td>' + (r.error_count > 0 ? '<span class="status-err">' + r.error_count + '</span>' : '0') + '</td>' +
							'<td>' + fmtNum(r.total_input_tokens) + '</td>' +
							'<td>' + fmtNum(r.total_output_tokens) + '</td>' +
						'</tr>'
					)).join('')
				) +
				'</tbody></table>';
			main.innerHTML = '<div class="list-container">' + head + '</div>';

			main.querySelectorAll('th[data-key]').forEach((th) => {
				th.addEventListener('click', () => {
					const key = th.getAttribute('data-key');
					if (state.sort.key === key) {
						state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
					} else {
						state.sort.key = key;
						state.sort.dir = 'desc';
					}
					renderList();
				});
			});
			main.querySelectorAll('tr[data-trace]').forEach((tr) => {
				tr.addEventListener('click', () => openTrace(tr.getAttribute('data-trace')));
			});
		}

		function buildTree(spans) {
			const byParent = new Map();
			const byId = new Map();
			for (const s of spans) byId.set(s.span_id, s);
			for (const s of spans) {
				const p = s.parent_span_id && byId.has(s.parent_span_id) ? s.parent_span_id : null;
				if (!byParent.has(p)) byParent.set(p, []);
				byParent.get(p).push(s);
			}
			for (const arr of byParent.values()) arr.sort((a, b) => a.start_time_ms - b.start_time_ms);
			return { byParent, byId };
		}

		function flattenTree(tree) {
			const out = [];
			const visit = (parentId, depth) => {
				const kids = tree.byParent.get(parentId) || [];
				for (const s of kids) {
					out.push({ span: s, depth });
					visit(s.span_id, depth + 1);
				}
			};
			visit(null, 0);
			return out;
		}

		function renderTraceView() {
			const main = document.getElementById('main');
			if (state.spans.length === 0) {
				main.innerHTML = '<div class="empty">No spans in this trace.</div>';
				return;
			}
			const minStart = Math.min(...state.spans.map(s => s.start_time_ms));
			const maxEnd = Math.max(...state.spans.map(s => s.end_time_ms));
			const total = Math.max(1, maxEnd - minStart);
			const tree = buildTree(state.spans);
			const rows = flattenTree(tree);

			const header =
				'<div class="wf-header">' +
					'<div>Span (' + rows.length + ')</div>' +
					'<div>Timeline — 0 → ' + escapeHtml(fmtMs(total)) + '</div>' +
				'</div>';

			const body = rows.map(({ span, depth }) => {
				const left = ((span.start_time_ms - minStart) / total) * 100;
				const width = Math.max(0.1, ((span.end_time_ms - span.start_time_ms) / total) * 100);
				const cat = categoryOf(span);
				const isError = span.status_code === 2;
				const label = (span.operation_name || span.name || '').replace(/^(chat|invoke_agent|execute_tool|execute_hook)\\s*/, '');
				const duration = fmtMs(span.end_time_ms - span.start_time_ms);
				return (
					'<div class="wf-row" data-span="' + escapeHtml(span.span_id) + '"' + (state.selectedSpanId === span.span_id ? ' class="wf-row selected"' : '') + '>' +
						'<div class="wf-name" style="padding-left:' + (depth * 14) + 'px">' +
							'<span class="caret">' + (tree.byParent.has(span.span_id) ? '▸' : ' ') + '</span>' +
							'<span class="chip cat-' + cat + '" style="color:var(--vscode-foreground);background:transparent;border:1px solid currentColor;">' + escapeHtml(cat) + '</span>' +
							'<span class="label" title="' + escapeHtml(span.name) + '">' + escapeHtml(span.name) + (label && label !== span.name ? ' — ' + escapeHtml(label) : '') + '</span>' +
						'</div>' +
						'<div class="wf-bar-track">' +
							'<div class="wf-bar cat-' + cat + (isError ? ' bar-error' : '') + '" style="left:' + left + '%;width:' + width + '%" title="' + escapeHtml(duration) + '"></div>' +
							'<div class="wf-bar-label" style="left:calc(' + left + '% + ' + width + '% + 4px)">' + escapeHtml(duration) + '</div>' +
						'</div>' +
					'</div>'
				);
			}).join('');

			main.innerHTML =
				'<div class="trace-pane">' +
					'<div class="waterfall">' + header + body + '</div>' +
					'<div class="details" id="details"></div>' +
				'</div>';

			main.querySelectorAll('.wf-row').forEach((row) => {
				row.addEventListener('click', () => {
					const spanId = row.getAttribute('data-span');
					selectSpan(spanId);
				});
			});

			if (state.selectedSpanId) {
				selectSpan(state.selectedSpanId);
			}
		}

		async function selectSpan(spanId) {
			state.selectedSpanId = spanId;
			document.querySelectorAll('.wf-row').forEach(r => {
				r.classList.toggle('selected', r.getAttribute('data-span') === spanId);
			});
			const details = document.getElementById('details');
			if (!details) return;
			details.classList.add('open');
			details.innerHTML = '<div class="empty">Loading…</div>';
			const res = await query({ type: 'getSpanDetails', spanId });
			if (!res || res.type !== 'getSpanDetails') {
				details.innerHTML = '<div class="empty">Failed to load span details.</div>';
				return;
			}
			const span = state.spans.find(s => s.span_id === spanId);
			const attrs = res.attributes;
			const events = res.events;

			const overview = !span ? '' : (
				'<div class="section">' +
					'<div class="section-title">Overview</div>' +
					'<dl>' +
						'<dt>Name</dt><dd>' + escapeHtml(span.name) + '</dd>' +
						'<dt>Status</dt><dd>' + (span.status_code === 2 ? '<span class="status-err">ERROR</span>' : span.status_code === 1 ? '<span class="status-ok">OK</span>' : 'UNSET') + (span.status_message ? ' — ' + escapeHtml(span.status_message) : '') + '</dd>' +
						'<dt>Duration</dt><dd>' + escapeHtml(fmtMs(span.end_time_ms - span.start_time_ms)) + '</dd>' +
						'<dt>Start</dt><dd class="mono">' + escapeHtml(fmtTime(span.start_time_ms)) + '</dd>' +
						'<dt>Span ID</dt><dd class="mono">' + escapeHtml(span.span_id) + '</dd>' +
						'<dt>Trace ID</dt><dd class="mono">' + escapeHtml(span.trace_id) + '</dd>' +
						(span.parent_span_id ? '<dt>Parent</dt><dd class="mono">' + escapeHtml(span.parent_span_id) + '</dd>' : '') +
						(span.agent_name ? '<dt>Agent</dt><dd>' + escapeHtml(span.agent_name) + '</dd>' : '') +
						(span.response_model ? '<dt>Model</dt><dd>' + escapeHtml(span.response_model) + '</dd>' : '') +
						(span.tool_name ? '<dt>Tool</dt><dd>' + escapeHtml(span.tool_name) + '</dd>' : '') +
						(span.input_tokens != null ? '<dt>Tokens in</dt><dd>' + span.input_tokens + '</dd>' : '') +
						(span.output_tokens != null ? '<dt>Tokens out</dt><dd>' + span.output_tokens + '</dd>' : '') +
					'</dl>' +
				'</div>'
			);

			const attrSection =
				'<div class="section">' +
					'<div class="section-title">Attributes (' + attrs.length + ')</div>' +
					(attrs.length === 0 ? '<div class="empty">No attributes.</div>' :
						'<dl>' + attrs.map(a => '<dt>' + escapeHtml(a.key) + '</dt><dd>' + escapeHtml(a.value ?? '') + '</dd>').join('') + '</dl>') +
				'</div>';

			const eventSection =
				'<div class="section">' +
					'<div class="section-title">Events (' + events.length + ')</div>' +
					(events.length === 0 ? '<div class="empty">No events.</div>' :
						'<dl>' + events.map(e => {
							const offset = span ? (e.timestamp_ms - span.start_time_ms) + ' ms' : fmtTime(e.timestamp_ms);
							return '<dt class="mono">+' + escapeHtml(String(offset)) + '</dt><dd>' + escapeHtml(e.name) + (e.attributes ? '<br><span class="mono" style="color:var(--vscode-descriptionForeground)">' + escapeHtml(e.attributes) + '</span>' : '') + '</dd>';
						}).join('') + '</dl>') +
				'</div>';

			details.innerHTML = overview + attrSection + eventSection;
		}

		// ── Queries ──
		async function refreshList() {
			const res = await query({
				type: 'listTraces',
				limit: 500,
				agent: state.filters.agent || undefined,
				status: state.filters.status || undefined,
				search: state.filters.search || undefined,
			});
			if (res && res.type === 'listTraces') {
				state.traces = res.traces;
				state.agents = res.agents;
				if (state.view === 'list') renderList();
			}
		}

		async function openTrace(traceId) {
			state.view = 'trace';
			state.traceId = traceId;
			state.selectedSpanId = null;
			render();
			const res = await query({ type: 'getTrace', traceId });
			if (res && res.type === 'getTrace' && state.traceId === traceId) {
				state.spans = res.spans;
				renderTraceView();
			}
		}

		function render() {
			renderToolbar();
			if (state.view === 'list') {
				renderList();
			} else {
				renderTraceView();
			}
		}

		// ── Init ──
		render();
		refreshList();
		if (INITIAL.initialTraceId) {
			openTrace(INITIAL.initialTraceId);
		}
	</script>
</body>
</html>`;
}
