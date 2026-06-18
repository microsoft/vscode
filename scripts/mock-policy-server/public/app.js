/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

(function () {
	'use strict';

	const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
	const tabs = $('tabs');
	const editor = /** @type {HTMLTextAreaElement} */ ($('editor'));
	const presetSelect = /** @type {HTMLSelectElement} */ ($('preset'));
	const presetDescription = $('preset-description');
	const endpointMeta = $('endpoint-meta');
	const endpointUrlEl = $('endpoint-url');
	const editorStatus = $('editor-status');
	const wiredStatusEl = $('wired-status');
	const overridesPathEl = $('overrides-path');

	/** @type {any[]} */
	let endpoints = [];
	/** Currently selected endpoint id. */
	let activeId = '';
	/** Working copy of each endpoint body as edited in the GUI (string). */
	const drafts = {};
	/** Loaded managed-settings schema (or null if unavailable). */
	let schema = null;

	function activeEndpoint() {
		return endpoints.find(e => e.id === activeId);
	}

	function setStatus(message, kind) {
		editorStatus.textContent = message;
		editorStatus.dataset.kind = kind || '';
	}

	/** Validate the editor content as JSON. Returns parsed value or undefined. */
	function parseEditor() {
		const raw = editor.value.trim();
		if (raw === '') {
			setStatus('Empty body will be served as-is (treated as no JSON).', '');
			return '';
		}
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (e) {
			setStatus(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`, 'error');
			return undefined;
		}
		const warning = validateAgainstSchema(parsed);
		if (warning) {
			setStatus(`Valid JSON. ${warning}`, 'warn');
		} else {
			setStatus('Valid JSON.', 'ok');
		}
		return parsed;
	}

	/**
	 * Best-effort check of a managed-settings body against the loaded JSON schema:
	 * warn about top-level keys not declared in `schema.properties`. Mirrors the
	 * way `projectManagedSettings` drops undeclared keys. Returns a warning string
	 * or '' when nothing to report.
	 */
	function validateAgainstSchema(parsed) {
		if (activeId !== 'managedSettings' || !schema || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return '';
		}
		const properties = schema.properties;
		if (!properties || typeof properties !== 'object') {
			return '';
		}
		const unknown = Object.keys(parsed).filter(key => !(key in properties));
		return unknown.length ? `Keys not in schema (will be dropped): ${unknown.join(', ')}.` : '';
	}

	async function api(path, options) {
		const res = await fetch(path, options);
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(data && data.error ? data.error : `${res.status} ${res.statusText}`);
		}
		return data;
	}

	function renderTabs() {
		tabs.textContent = '';
		for (const endpoint of endpoints) {
			const tab = document.createElement('button');
			tab.type = 'button';
			tab.className = 'tab' + (endpoint.id === activeId ? ' active' : '');
			tab.textContent = endpoint.label;
			tab.setAttribute('role', 'tab');
			tab.addEventListener('click', () => selectEndpoint(endpoint.id));
			tabs.appendChild(tab);
		}
	}

	function renderPresets() {
		const endpoint = activeEndpoint();
		presetSelect.textContent = '';
		(endpoint?.presets ?? []).forEach((preset, index) => {
			const option = document.createElement('option');
			option.value = String(index);
			option.textContent = preset.label;
			presetSelect.appendChild(option);
		});
		updatePresetDescription();
	}

	function updatePresetDescription() {
		const endpoint = activeEndpoint();
		const preset = endpoint?.presets[Number(presetSelect.value)];
		presetDescription.textContent = preset ? preset.description : '';
	}

	function applyPreset() {
		const endpoint = activeEndpoint();
		const preset = endpoint?.presets[Number(presetSelect.value)];
		if (preset) {
			editor.value = JSON.stringify(preset.body, null, '\t');
			drafts[activeId] = editor.value;
			parseEditor();
		}
	}

	function selectEndpoint(id) {
		// Stash the current draft before switching.
		if (activeId) {
			drafts[activeId] = editor.value;
		}
		activeId = id;
		const endpoint = activeEndpoint();
		endpointMeta.innerHTML = `<code>GET ${endpoint.path}</code> &middot; product.json <code>defaultChatAgent.${endpoint.productKey}</code><br>${endpoint.description}`;
		endpointUrlEl.textContent = endpoint.url;
		editor.value = drafts[id] ?? JSON.stringify(endpoint.body ?? {}, null, '\t');
		renderTabs();
		renderPresets();
		parseEditor();
	}

	function renderWired(state) {
		wiredStatusEl.textContent = state.wired ? 'Wired ✓' : 'Not wired';
		wiredStatusEl.dataset.kind = state.wired ? 'ok' : '';
		overridesPathEl.textContent = state.overridesPath;
	}

	async function save() {
		const parsed = parseEditor();
		if (parsed === undefined) {
			return;
		}
		try {
			const state = await api('/api/state', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: activeId, body: parsed })
			});
			endpoints = state.endpoints;
			renderWired(state);
			setStatus(`Saved. ${activeEndpoint().path} now returns this body.`, 'ok');
		} catch (e) {
			setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
		}
	}

	async function wire(wireIt) {
		try {
			const state = await api(wireIt ? '/api/wire' : '/api/unwire', { method: 'POST' });
			endpoints = state.endpoints;
			renderWired(state);
			setStatus(wireIt ? 'Wired product.overrides.json. Reload Code OSS.' : 'Unwired product.overrides.json. Reload Code OSS.', 'ok');
		} catch (e) {
			setStatus(`${wireIt ? 'Wire' : 'Unwire'} failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
		}
	}

	function formatJson() {
		const parsed = parseEditor();
		if (parsed !== undefined && parsed !== '') {
			editor.value = JSON.stringify(parsed, null, '\t');
		}
	}

	async function loadSchema() {
		const sourceEl = $('schema-source');
		const statusEl = $('schema-status');
		const viewEl = $('schema-view');
		try {
			const result = await api('/api/schema');
			sourceEl.textContent = result.resolved || result.source || '(unknown)';
			if (result.ok) {
				schema = result.schema;
				statusEl.textContent = 'Loaded ✓';
				statusEl.dataset.kind = 'ok';
				viewEl.textContent = JSON.stringify(result.schema, null, '\t');
			} else {
				schema = null;
				statusEl.textContent = `Not loaded — ${result.error || 'unavailable'}`;
				statusEl.dataset.kind = 'error';
				viewEl.textContent = '';
			}
		} catch (e) {
			schema = null;
			statusEl.textContent = `Not loaded — ${e instanceof Error ? e.message : String(e)}`;
			statusEl.dataset.kind = 'error';
		}
		// Re-validate the current editor now that schema availability changed.
		parseEditor();
	}

	function toggleSchemaView() {
		const viewEl = $('schema-view');
		viewEl.hidden = !viewEl.hidden;
		$('toggle-schema').textContent = viewEl.hidden ? 'View schema' : 'Hide schema';
	}

	async function init() {
		editor.addEventListener('input', () => { drafts[activeId] = editor.value; parseEditor(); });
		presetSelect.addEventListener('change', updatePresetDescription);
		$('load-preset').addEventListener('click', applyPreset);
		$('save').addEventListener('click', save);
		$('format').addEventListener('click', formatJson);
		$('wire').addEventListener('click', () => wire(true));
		$('unwire').addEventListener('click', () => wire(false));
		$('toggle-schema').addEventListener('click', toggleSchemaView);
		$('refresh-schema').addEventListener('click', loadSchema);

		try {
			const state = await api('/api/state');
			endpoints = state.endpoints;
			renderWired(state);
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
		} catch (e) {
			setStatus(`Failed to load state: ${e instanceof Error ? e.message : String(e)}`, 'error');
		}

		loadSchema();
	}

	init();
})();
