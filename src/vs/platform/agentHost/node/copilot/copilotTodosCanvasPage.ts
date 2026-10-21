/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** Strings the page shows; every value is HTML-escaped before it is embedded. */
interface ITodosCanvasPageStrings {
	readonly title: string;
	readonly planHeading: string;
	readonly noPlan: string;
	readonly noTodos: string;
	readonly loading: string;
	readonly live: string;
	readonly reconnecting: string;
	readonly loadError: string;
	readonly blockedBy: string;
	readonly summaryDone: string;
	readonly groups: {
		readonly inProgress: string;
		readonly ready: string;
		readonly blocked: string;
		readonly done: string;
		readonly other: string;
	};
	readonly statuses: {
		readonly pending: string;
		readonly inProgress: string;
		readonly done: string;
		readonly blocked: string;
	};
}

function getStrings(): ITodosCanvasPageStrings {
	return {
		title: localize('todosCanvas.title', "Todos"),
		planHeading: localize('todosCanvas.plan', "Plan"),
		noPlan: localize('todosCanvas.noPlan', "No plan document yet."),
		noTodos: localize('todosCanvas.noTodos', "No todos yet. Items the agent records with its planning tools appear here as it works."),
		loading: localize('todosCanvas.loading', "Loading…"),
		live: localize('todosCanvas.live', "Live"),
		reconnecting: localize('todosCanvas.reconnecting', "Reconnecting…"),
		loadError: localize('todosCanvas.loadError', "Couldn't load todos: {0}", '{0}'),
		blockedBy: localize('todosCanvas.blockedBy', "Blocked by: {0}", '{0}'),
		summaryDone: localize('todosCanvas.summaryDone', "{0} of {1} done", '{0}', '{1}'),
		groups: {
			inProgress: localize('todosCanvas.group.inProgress', "In Progress"),
			ready: localize('todosCanvas.group.ready', "Ready"),
			blocked: localize('todosCanvas.group.blocked', "Blocked"),
			done: localize('todosCanvas.group.done', "Done"),
			other: localize('todosCanvas.group.other', "Other"),
		},
		statuses: {
			pending: localize('todosCanvas.status.pending', "Pending"),
			inProgress: localize('todosCanvas.status.inProgress', "In progress"),
			done: localize('todosCanvas.status.done', "Done"),
			blocked: localize('todosCanvas.status.blocked', "Blocked"),
		},
	};
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => {
		switch (character) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			default: return '&#39;';
		}
	});
}

/** Serializes the strings for the page script, escaping `</script>` so the JSON cannot end the script element. */
function toScriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

const pageStyles = `
:root {
	color-scheme: light dark;
	--fg: light-dark(#3b3b3b, #cccccc);
	--fg-muted: light-dark(#717171, #9d9d9d);
	--bg: light-dark(#ffffff, #1f1f1f);
	--bg-subtle: light-dark(#f8f8f8, #262626);
	--border: light-dark(#e5e5e5, #2b2b2b);
	--accent: light-dark(#005fb8, #4daafc);
	--done: light-dark(#2e7d32, #89d185);
	--blocked: light-dark(#bf8803, #cca700);
	--code-bg: light-dark(#f2f2f2, #2a2a2a);
	--focus: light-dark(#005fb8, #0078d4);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
	font: 13px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif;
	color: var(--fg);
	background: var(--bg);
	-webkit-font-smoothing: antialiased;
}
main { max-width: 720px; margin: 0 auto; padding: 16px 20px 32px; }
header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
h1 { font-size: 16px; font-weight: 600; margin: 0; }
.summary, .connection { color: var(--fg-muted); margin: 0; }
.connection { margin-left: auto; font-size: 12px; }
.connection.error { color: var(--blocked); }
.progress { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin: 8px 0 16px; }
.progress > div { height: 100%; background: var(--done); transition: width 200ms ease-out; }
section { margin-top: 16px; }
h2 { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg-muted); margin: 0 0 6px; }
ul.todos { list-style: none; margin: 0; padding: 0; }
.todo { display: grid; grid-template-columns: 18px 1fr; gap: 0 8px; padding: 6px 0; border-top: 1px solid var(--border); }
.todo:first-child { border-top: none; }
.glyph { font-size: 12px; line-height: 20px; text-align: center; color: var(--fg-muted); }
.status-in_progress .glyph { color: var(--accent); }
.status-done .glyph { color: var(--done); }
.status-blocked .glyph { color: var(--blocked); }
.title { font-weight: 500; line-height: 20px; overflow-wrap: anywhere; }
.status-done .title { color: var(--fg-muted); text-decoration: line-through; text-decoration-color: var(--border); }
.description { grid-column: 2; margin: 0; color: var(--fg-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.deps { grid-column: 2; margin: 2px 0 0; font-size: 12px; color: var(--blocked); }
.raw-status { grid-column: 2; margin: 0; font-size: 11px; color: var(--fg-muted); font-family: ui-monospace, Menlo, Consolas, monospace; }
.empty { color: var(--fg-muted); margin: 0; }
.plan { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 24px; }
.plan .markdown h3, .plan .markdown h4, .plan .markdown h5, .plan .markdown h6 { font-size: 13px; font-weight: 600; margin: 12px 0 4px; letter-spacing: 0; text-transform: none; color: var(--fg); }
.plan .markdown h3 { font-size: 14px; }
.plan .markdown p { margin: 0 0 8px; }
.plan .markdown ul, .plan .markdown ol { margin: 0 0 8px; padding-left: 20px; }
.plan .markdown li.task { list-style: none; margin-left: -20px; }
.plan .markdown li.task .checkbox { display: inline-block; width: 20px; color: var(--fg-muted); }
.plan .markdown li.task.done { color: var(--fg-muted); }
.plan .markdown code, .todo code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: var(--code-bg); padding: 1px 4px; border-radius: 3px; }
.plan .markdown pre { background: var(--code-bg); padding: 8px 10px; border-radius: 4px; overflow: auto; margin: 0 0 8px; }
.plan .markdown pre code { background: none; padding: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
:focus-visible { outline: 1px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .progress > div { transition: none; } }
`;

// Runs inside the canvas page. Content comes from the agent, so it only ever reaches the DOM through
// textContent. Avoids template literals so this source can be embedded in the TypeScript template below.
const pageScript = `
(function () {
	'use strict';
	var strings = JSON.parse(document.getElementById('strings').textContent);
	var app = document.getElementById('app');
	var connection = document.getElementById('connection');
	var reloadTimer;

	function el(tag, className, text) {
		var element = document.createElement(tag);
		if (className) { element.className = className; }
		if (text !== undefined) { element.textContent = text; }
		return element;
	}

	function format(template, values) {
		return template.replace(/\\{(\\d+)\\}/g, function (_match, index) { return values[Number(index)]; });
	}

	function normalizeStatus(status) {
		var value = String(status || 'pending').trim().toLowerCase().replace(/[\\s-]+/g, '_');
		if (value === 'in_progress' || value === 'inprogress' || value === 'active' || value === 'started') { return 'in_progress'; }
		if (value === 'done' || value === 'completed' || value === 'complete' || value === 'finished') { return 'done'; }
		if (value === 'blocked') { return 'blocked'; }
		if (value === 'pending' || value === 'todo' || value === 'open' || value === 'not_started') { return 'pending'; }
		return 'other';
	}

	var glyphs = { pending: '\\u25CB', in_progress: '\\u25D4', done: '\\u25CF', blocked: '\\u2298', other: '\\u25CC' };
	var statusLabels = { pending: strings.statuses.pending, in_progress: strings.statuses.inProgress, done: strings.statuses.done, blocked: strings.statuses.blocked };

	function renderTodo(todo, blockers, titles) {
		var item = el('li', 'todo status-' + todo.status);
		var glyph = el('span', 'glyph', glyphs[todo.status]);
		glyph.setAttribute('aria-hidden', 'true');
		item.appendChild(glyph);
		var title = el('span', 'title', todo.title || todo.id || '');
		if (statusLabels[todo.status]) { title.appendChild(el('span', 'visually-hidden', ' (' + statusLabels[todo.status] + ')')); }
		item.appendChild(title);
		// Unknown statuses are shown verbatim instead of being announced through a hidden label.
		if (todo.status === 'other' && todo.rawStatus) { item.appendChild(el('p', 'raw-status', todo.rawStatus)); }
		if (todo.description) { item.appendChild(el('p', 'description', todo.description)); }
		if (blockers.length) {
			item.appendChild(el('p', 'deps', format(strings.blockedBy, [blockers.map(function (id) { return titles[id] || id; }).join(', ')])));
		}
		return item;
	}

	function renderGroup(container, key, heading, todos, blockedBy, titles) {
		if (!todos.length) { return; }
		var section = el('section');
		var id = 'group-' + key;
		var h2 = el('h2', null, heading);
		h2.id = id;
		section.appendChild(h2);
		var list = el('ul', 'todos');
		list.setAttribute('aria-labelledby', id);
		todos.forEach(function (todo) { list.appendChild(renderTodo(todo, blockedBy[todo.id] || [], titles)); });
		section.appendChild(list);
		container.appendChild(section);
	}

	function renderInline(text, parent) {
		var pattern = /(\\u0060[^\\u0060]+\\u0060)|(\\*\\*[^*]+\\*\\*)|(__[^_]+__)|(\\[[^\\]]+\\]\\([^)\\s]+\\))|(\\*[^*\\s][^*]*\\*)|(_[^_\\s][^_]*_)/g;
		var last = 0;
		var match;
		while ((match = pattern.exec(text))) {
			if (match.index > last) { parent.appendChild(document.createTextNode(text.slice(last, match.index))); }
			if (match[1]) { parent.appendChild(el('code', null, match[1].slice(1, -1))); }
			else if (match[2] || match[3]) { parent.appendChild(el('strong', null, match[0].slice(2, -2))); }
			else if (match[4]) { parent.appendChild(document.createTextNode(match[4].slice(1, match[4].indexOf(']')))); }
			else { parent.appendChild(el('em', null, match[0].slice(1, -1))); }
			last = match.index + match[0].length;
		}
		if (last < text.length) { parent.appendChild(document.createTextNode(text.slice(last))); }
	}

	var fencePattern = /^\\s*(\\u0060{3,}|~{3,})/;
	var headingPattern = /^(#{1,6})\\s+(.*)$/;
	var listPattern = /^\\s*([-*+]|\\d+[.)])\\s+(.*)$/;

	function renderMarkdown(text, container) {
		var lines = text.replace(/\\r\\n?/g, '\\n').split('\\n');
		var i = 0;
		while (i < lines.length) {
			var line = lines[i];
			if (!line.trim()) { i++; continue; }
			var fence = fencePattern.exec(line);
			if (fence) {
				var code = [];
				i++;
				while (i < lines.length && lines[i].trim().indexOf(fence[1]) !== 0) { code.push(lines[i]); i++; }
				i++;
				var pre = el('pre');
				pre.appendChild(el('code', null, code.join('\\n')));
				container.appendChild(pre);
				continue;
			}
			var heading = headingPattern.exec(line);
			if (heading) {
				var h = el('h' + Math.min(heading[1].length + 2, 6));
				renderInline(heading[2], h);
				container.appendChild(h);
				i++;
				continue;
			}
			var listItem = listPattern.exec(line);
			if (listItem) {
				var list = el(/\\d/.test(listItem[1]) ? 'ol' : 'ul');
				while (i < lines.length && (listItem = listPattern.exec(lines[i]))) {
					var li = el('li');
					var task = /^\\[( |x|X)\\]\\s+(.*)$/.exec(listItem[2]);
					if (task) {
						var checked = task[1] !== ' ';
						li.className = checked ? 'task done' : 'task';
						var box = el('span', 'checkbox', checked ? '\\u2611' : '\\u2610');
						box.setAttribute('aria-hidden', 'true');
						li.appendChild(box);
						renderInline(task[2], li);
					} else {
						renderInline(listItem[2], li);
					}
					list.appendChild(li);
					i++;
				}
				container.appendChild(list);
				continue;
			}
			var paragraph = [line];
			i++;
			while (i < lines.length && lines[i].trim() && !headingPattern.test(lines[i]) && !listPattern.test(lines[i]) && !fencePattern.test(lines[i])) {
				paragraph.push(lines[i]);
				i++;
			}
			var p = el('p');
			renderInline(paragraph.join(' '), p);
			container.appendChild(p);
		}
	}

	function render(data) {
		var todos = (data.todos || []).map(function (row) {
			return { id: row.id || '', title: row.title || '', description: row.description || '', rawStatus: row.status || '', status: normalizeStatus(row.status) };
		});
		var byId = {};
		var titles = {};
		todos.forEach(function (todo) { byId[todo.id] = todo; titles[todo.id] = todo.title; });
		var blockedBy = {};
		(data.dependencies || []).forEach(function (edge) {
			var blocker = byId[edge.dependsOn];
			if (!blocker || blocker.status === 'done') { return; }
			(blockedBy[edge.todoId] = blockedBy[edge.todoId] || []).push(edge.dependsOn);
		});
		var groups = { in_progress: [], ready: [], blocked: [], done: [], other: [] };
		todos.forEach(function (todo) {
			if (todo.status === 'pending') { groups[blockedBy[todo.id] ? 'blocked' : 'ready'].push(todo); }
			else { groups[todo.status].push(todo); }
		});

		var fragment = document.createDocumentFragment();
		var header = el('header');
		header.appendChild(el('h1', null, strings.title));
		if (todos.length) {
			header.appendChild(el('p', 'summary', format(strings.summaryDone, [groups.done.length, todos.length])));
		}
		header.appendChild(connection);
		fragment.appendChild(header);
		if (todos.length) {
			var progress = el('div', 'progress');
			progress.setAttribute('role', 'progressbar');
			progress.setAttribute('aria-valuemin', '0');
			progress.setAttribute('aria-valuemax', String(todos.length));
			progress.setAttribute('aria-valuenow', String(groups.done.length));
			var fill = el('div');
			fill.style.width = Math.round(groups.done.length / todos.length * 100) + '%';
			progress.appendChild(fill);
			fragment.appendChild(progress);
			renderGroup(fragment, 'in-progress', strings.groups.inProgress, groups.in_progress, blockedBy, titles);
			renderGroup(fragment, 'ready', strings.groups.ready, groups.ready, blockedBy, titles);
			renderGroup(fragment, 'blocked', strings.groups.blocked, groups.blocked, blockedBy, titles);
			renderGroup(fragment, 'other', strings.groups.other, groups.other, blockedBy, titles);
			renderGroup(fragment, 'done', strings.groups.done, groups.done, blockedBy, titles);
		} else {
			fragment.appendChild(el('p', 'empty', strings.noTodos));
		}

		var plan = el('section', 'plan');
		plan.appendChild(el('h2', null, strings.planHeading));
		if (data.plan && data.plan.exists && data.plan.content) {
			var markdown = el('div', 'markdown');
			renderMarkdown(data.plan.content, markdown);
			plan.appendChild(markdown);
		} else {
			plan.appendChild(el('p', 'empty', strings.noPlan));
		}
		fragment.appendChild(plan);

		app.replaceChildren(fragment);
	}

	function setConnection(state, message) {
		connection.className = 'connection' + (state === 'error' ? ' error' : '');
		connection.textContent = state === 'live' ? strings.live : state === 'reconnecting' ? strings.reconnecting : message;
	}

	function load() {
		fetch('plan.json', { cache: 'no-store' }).then(function (response) {
			return response.json().then(function (body) {
				if (!response.ok) { throw new Error((body && body.error) || response.statusText); }
				return body;
			});
		}).then(function (data) {
			render(data);
			if (connection.className.indexOf('error') !== -1) { setConnection('live'); }
		}, function (error) {
			setConnection('error', format(strings.loadError, [error && error.message ? error.message : String(error)]));
		});
	}

	function scheduleLoad() {
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(load, 150);
	}

	var connected = false;
	var events = new EventSource('events');
	events.addEventListener('change', scheduleLoad);
	events.addEventListener('open', function () {
		setConnection('live');
		// Changes signalled while the stream was down were lost, so re-read after a reconnect.
		if (connected) { scheduleLoad(); }
		connected = true;
	});
	events.addEventListener('error', function () { setConnection('reconnecting'); });
	document.addEventListener('visibilitychange', function () { if (!document.hidden) { scheduleLoad(); } });
	load();
})();
`;

/**
 * Renders the self-contained todos canvas page. The page fetches `plan.json` relative to its own URL and
 * follows `events` for change notifications, so it must be served from a URL ending in `/`.
 */
export function renderCopilotTodosCanvasPage(scriptNonce: string): string {
	const strings = getStrings();
	const nonce = escapeHtml(scriptNonce);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(strings.title)}</title>
<style nonce="${nonce}">${pageStyles}</style>
</head>
<body>
<main id="app">
<header><h1>${escapeHtml(strings.title)}</h1><p id="connection" class="connection" role="status">${escapeHtml(strings.loading)}</p></header>
</main>
<script id="strings" type="application/json">${toScriptJson(strings)}</script>
<script nonce="${nonce}">${pageScript}</script>
</body>
</html>
`;
}
