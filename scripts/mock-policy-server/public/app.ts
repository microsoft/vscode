/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client-side GUI for the mock policy server. Loaded via a `<script>` tag in
 * `index.html`; the server uses `module.stripTypeScriptTypes()` to serve this
 * TypeScript source as plain JavaScript — no build step needed.
 *
 * Relies on `MOCK_POLICY_ENDPOINTS` being defined as a global by
 * `endpoints.ts` (loaded via an earlier `<script>` tag).
 */
declare const MOCK_POLICY_ENDPOINTS: import('../endpoints').EndpointDef[];

(function () {
	'use strict';

	interface EndpointDef {
		id: string;
		label: string;
		path: string;
		productKey: string;
		description: string;
		url?: string;
		body?: unknown;
		presets: { id: string; label: string; description: string; body: unknown }[];
	}

	interface ServerState {
		endpoints: EndpointDef[];
		wired: boolean;
		overridesSnippet?: string;
		overridesPath?: string;
	}

	interface SchemaResult {
		ok: boolean;
		source?: string;
		resolved?: string;
		error?: string;
		schema?: JsonSchema;
	}

	interface JsonSchema {
		type?: string;
		properties?: Record<string, JsonSchema>;
		additionalProperties?: boolean | JsonSchema;
		items?: JsonSchema;
		enum?: unknown[];
		const?: unknown;
		default?: unknown;
		description?: string;
	}

	const $ = (id: string): HTMLElement => document.getElementById(id)!;
	const tabs = $('tabs');
	const editor = $('editor') as HTMLTextAreaElement;
	const presetSelect = $('preset') as HTMLSelectElement;
	const endpointMeta = $('endpoint-meta');
	const endpointUrlEl = $('endpoint-url');
	const editorStatus = $('editor-status');
	const wiredStatusEl = $('wired-status');

	let endpoints: EndpointDef[] = [];
	/** Currently selected endpoint id. */
	let activeId = '';
	/** Working copy of each endpoint body as edited in the GUI (string). */
	const drafts: Record<string, string> = {};

	/** Restore drafts from localStorage. */
	function loadDrafts(): void {
		try {
			const saved = localStorage.getItem('mock-policy-drafts');
			if (saved) {
				Object.assign(drafts, JSON.parse(saved));
			}
		} catch { /* ignore */ }
	}

	/** Persist drafts to localStorage. */
	function saveDrafts(): void {
		try { localStorage.setItem('mock-policy-drafts', JSON.stringify(drafts)); } catch { /* quota */ }
	}
	/** Loaded managed-settings schema (or null if unavailable). */
	let schema: JsonSchema | null = null;

	function activeEndpoint(): EndpointDef | undefined {
		return endpoints.find(e => e.id === activeId);
	}

	function setStatus(message: string, kind?: string): void {
		editorStatus.textContent = message;
		editorStatus.dataset.kind = kind || '';
	}

	/** Validate the editor content as JSON. Returns parsed value or undefined. */
	function parseEditor(): unknown | undefined {
		const raw = editor.value.trim();
		if (raw === '') {
			setStatus('Empty body — will be served as {}.', '');
			return {};
		}
		let parsed: unknown;
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
		// Update the validation table live if schema is loaded and we're on managed settings.
		if (activeId === 'managedSettings' && schema && typeof parsed === 'object' && parsed && !Array.isArray(parsed)) {
			renderValidationResults(parsed as Record<string, unknown>);
		} else {
			$('validation-results').hidden = true;
		}
		return parsed;
	}

	/**
	 * Best-effort check of a managed-settings body against the loaded JSON schema:
	 * warn about top-level keys not declared in `schema.properties`. Mirrors the
	 * way `projectManagedSettings` drops undeclared keys. Returns a warning string
	 * or '' when nothing to report.
	 */
	function validateAgainstSchema(parsed: unknown): string {
		if (activeId !== 'managedSettings' || !schema || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return '';
		}
		const properties = schema.properties;
		if (!properties || typeof properties !== 'object') {
			return '';
		}
		const unknown = Object.keys(parsed).filter(key => !Object.hasOwn(properties, key));
		return unknown.length ? `Keys not in schema (will be dropped): ${unknown.join(', ')}.` : '';
	}

	/**
	 * Walk a JSON schema and produce a representative example object.
	 * Handles object/string/boolean/number/array/enum and nested properties.
	 */
	function hydrateFromSchema(s: JsonSchema | undefined): unknown {
		if (!s || typeof s !== 'object') {
			return null;
		}
		if (s.enum && s.enum.length) {
			return s.enum[0];
		}
		if (s.const !== undefined) {
			return s.const;
		}
		switch (s.type) {
			case 'object': {
				const obj: Record<string, unknown> = {};
				if (s.properties) {
					for (const [key, sub] of Object.entries(s.properties)) {
						obj[key] = hydrateFromSchema(sub);
					}
				}
				if (Object.keys(obj).length === 0 && s.additionalProperties && typeof s.additionalProperties === 'object') {
					obj['example-key'] = hydrateFromSchema(s.additionalProperties);
				}
				return obj;
			}
			case 'array':
				return s.items ? [hydrateFromSchema(s.items)] : [];
			case 'string':
				return s.default ?? 'example';
			case 'boolean':
				return s.default ?? true;
			case 'number':
			case 'integer':
				return s.default ?? 0;
			default:
				return null;
		}
	}

	async function api<T = unknown>(urlPath: string, options?: RequestInit): Promise<T> {
		const res = await fetch(urlPath, options);
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(data && data.error ? data.error : `${res.status} ${res.statusText}`);
		}
		return data as T;
	}

	function renderTabs(): void {
		tabs.textContent = '';
		for (const endpoint of endpoints) {
			const tab = document.createElement('button');
			tab.type = 'button';
			tab.className = 'tab' + (endpoint.id === activeId ? ' active' : '');
			tab.textContent = endpoint.label;
			if (endpoint.id === activeId) {
				tab.setAttribute('aria-current', 'true');
			}
			tab.addEventListener('click', () => selectEndpoint(endpoint.id));
			tabs.appendChild(tab);
		}
	}

	function selectEndpoint(id: string): void {
		// Stash the current draft before switching.
		if (activeId) {
			drafts[activeId] = editor.value;
		}
		activeId = id;
		const endpoint = activeEndpoint();
		if (!endpoint) {
			return;
		}

		// Build two-line description: route + product key on line 1, description on line 2
		const routeSpan = document.createElement('span');
		routeSpan.className = 'meta-route';
		const codePath = document.createElement('code');
		codePath.textContent = `GET ${endpoint.path}`;
		const codeKey = document.createElement('code');
		codeKey.textContent = endpoint.productKey;
		routeSpan.append(codePath, ' · ', codeKey);

		const descSpan = document.createElement('span');
		descSpan.className = 'meta-desc';
		descSpan.textContent = endpoint.description;

		endpointMeta.replaceChildren(routeSpan, descSpan);
		endpointUrlEl.textContent = endpoint.url ?? '';
		editor.value = drafts[id] ?? JSON.stringify(endpoint.body ?? {}, null, '\t');
		renderTabs();
		renderPresets();
		// Show schema section only on the Managed Settings tab.
		$('schema-section').hidden = (id !== 'managedSettings');
		$('validation-results').hidden = true;
		parseEditor();
	}

	function renderPresets(): void {
		const endpoint = activeEndpoint();
		presetSelect.textContent = '';
		(endpoint?.presets ?? []).forEach((preset, index) => {
			const option = document.createElement('option');
			option.value = String(index);
			option.textContent = preset.label;
			presetSelect.appendChild(option);
		});
	}

	function applyPreset(): void {
		const endpoint = activeEndpoint();
		const preset = endpoint?.presets?.[Number(presetSelect.value)];
		if (preset) {
			editor.value = JSON.stringify(preset.body, null, '\t');
			drafts[activeId] = editor.value;
			saveDrafts();
			parseEditor();
			debouncedSave();
		}
	}

	/** Latest overrides snippet for copy-to-clipboard. */
	let overridesSnippet = '';
	let overridesPath = '';

	function renderWired(state: ServerState): void {
		wiredStatusEl.textContent = state.wired ? 'Applied \u2713' : 'Not applied';
		wiredStatusEl.dataset.kind = state.wired ? 'ok' : '';
		if (state.overridesSnippet) {
			overridesSnippet = state.overridesSnippet;
		}
		if (state.overridesPath) {
			overridesPath = state.overridesPath;
		}
	}

	async function save(): Promise<void> {
		const parsed = parseEditor();
		if (parsed === undefined) {
			return;
		}
		try {
			const state = await api<ServerState>('/api/state', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: activeId, body: parsed })
			});
			endpoints = state.endpoints;
			renderWired(state);
			drafts[activeId] = editor.value;
			saveDrafts();
		} catch { /* auto-save failures are silent */ }
	}

	let saveTimer: ReturnType<typeof setTimeout> | 0 = 0;
	function debouncedSave(): void {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 400);
	}

	async function wire(wireIt: boolean): Promise<void> {
		try {
			const state = await api<ServerState>(wireIt ? '/api/wire' : '/api/unwire', { method: 'POST' });
			endpoints = state.endpoints;
			renderWired(state);
		} catch { /* status is shown via the wired-status element */ }
	}

	function formatJson(): void {
		const parsed = parseEditor();
		if (parsed !== undefined) {
			editor.value = JSON.stringify(parsed, null, '\t');
		}
	}

	async function loadSchema(): Promise<void> {
		const sourceEl = $('schema-source') as HTMLInputElement;
		const badgeEl = $('schema-badge');
		const viewEl = $('schema-view');

		const customSource = sourceEl.value.trim();
		const url = customSource ? '/api/schema?source=' + encodeURIComponent(customSource) : '/api/schema';

		try {
			const result = await api<SchemaResult>(url);
			if (!customSource) {
				sourceEl.value = result.resolved || result.source || '';
			}
			if (result.ok) {
				schema = result.schema ?? null;
				badgeEl.textContent = 'Loaded \u2713';
				badgeEl.dataset.kind = 'ok';
				badgeEl.dataset.tooltip = result.resolved || 'Schema loaded';
				viewEl.textContent = JSON.stringify(result.schema, null, '\t');
				if (customSource) {
					try { localStorage.setItem('mock-policy-schema-source', customSource); } catch { /* quota */ }
				}
			} else {
				schema = null;
				badgeEl.textContent = 'Not loaded';
				badgeEl.dataset.kind = 'error';
				badgeEl.dataset.tooltip = result.error || 'Schema unavailable';
				viewEl.textContent = '';
			}
		} catch (e) {
			schema = null;
			badgeEl.textContent = 'Not loaded';
			badgeEl.dataset.kind = 'error';
			badgeEl.dataset.tooltip = e instanceof Error ? e.message : String(e);
		}
		const toggleEl = $('schema-toggle');
		const chevronEl = $('schema-chevron');
		const detailsEl = $('schema-details');
		toggleEl.onclick = () => {
			detailsEl.hidden = !detailsEl.hidden;
			chevronEl.classList.toggle('open', !detailsEl.hidden);
		};
		parseEditor();
	}

	function renderValidationResults(parsed: Record<string, unknown>): void {
		const container = $('validation-results');
		const properties = schema?.properties ?? {};
		const schemaKeys = Object.keys(properties);
		const bodyKeys = typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? Object.keys(parsed) : [];
		const allKeys = [...new Set([...schemaKeys, ...bodyKeys])].sort();

		if (allKeys.length === 0) {
			container.hidden = true;
			setStatus('Schema has no properties to validate against.', 'warn');
			return;
		}

		const rows = allKeys.map(key => {
			const inSchema = Object.hasOwn(properties, key);
			const inBody = bodyKeys.includes(key);
			let statusText: string;
			let cls: string;
			if (inSchema && inBody) { statusText = '\u2713 Present'; cls = 'validation-ok'; }
			else if (inSchema && !inBody) { statusText = '\u2014 Missing'; cls = ''; }
			else { statusText = '\u26A0 Unknown (will be dropped)'; cls = 'validation-warn'; }
			const desc = properties[key]?.description || '';
			return `<tr><td><code>${key}</code></td><td class="${cls}">${statusText}</td><td>${desc ? desc.split('.')[0] : ''}</td></tr>`;
		});

		const unknownCount = bodyKeys.filter(k => !Object.hasOwn(properties, k)).length;
		const presentCount = bodyKeys.filter(k => Object.hasOwn(properties, k)).length;

		container.innerHTML = `<table class="validation-table"><thead><tr><th>Key</th><th>Status</th><th>Description</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
			+ `<p class="validation-summary">${presentCount} of ${schemaKeys.length} schema keys present`
			+ (unknownCount ? `, <span class="validation-warn">${unknownCount} unknown</span>` : '')
			+ `</p>`;
		container.hidden = false;
		setStatus(unknownCount ? `${unknownCount} key${unknownCount > 1 ? 's' : ''} not in schema.` : 'All keys match the schema.', unknownCount ? 'warn' : 'ok');
	}

	function toggleSchemaView(): void {
		const viewEl = $('schema-view');
		viewEl.hidden = !viewEl.hidden;
		$('toggle-schema').textContent = viewEl.hidden ? 'View' : 'Hide';
	}

	async function init(): Promise<void> {
		// Restore saved schema source and drafts from localStorage.
		const savedSource = localStorage.getItem('mock-policy-schema-source');
		if (savedSource) {
			($('schema-source') as HTMLInputElement).value = savedSource;
		}
		loadDrafts();

		editor.addEventListener('input', () => { drafts[activeId] = editor.value; saveDrafts(); parseEditor(); debouncedSave(); });
		$('apply-preset').addEventListener('click', applyPreset);
		$('format').addEventListener('click', formatJson);
		$('wire').addEventListener('click', () => wire(true));
		$('unwire').addEventListener('click', () => wire(false));
		$('copy-overrides').addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(overridesSnippet);
				const btn = $('copy-overrides');
				const orig = btn.textContent;
				btn.textContent = 'Copied \u2713';
				setTimeout(() => { btn.textContent = orig; }, 1500);
			} catch {
				setStatus('Copy failed \u2014 check clipboard permissions', 'error');
			}
		});
		$('copy-overrides-path').addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(overridesPath);
				const btn = $('copy-overrides-path');
				const orig = btn.textContent;
				btn.textContent = 'Copied \u2713';
				setTimeout(() => { btn.textContent = orig; }, 1500);
			} catch { /* clipboard error */ }
		});
		$('toggle-schema').addEventListener('click', toggleSchemaView);
		$('refresh-schema').addEventListener('click', loadSchema);
		$('hydrate-schema').addEventListener('click', () => {
			if (!schema) {
				setStatus('Load a schema first.', 'error');
				return;
			}
			editor.value = JSON.stringify(hydrateFromSchema(schema), null, '\t');
			drafts[activeId] = editor.value;
			saveDrafts();
			parseEditor();
			debouncedSave();
			setStatus('Generated example from schema.', 'ok');
		});
		try {
			const state = await api<ServerState>('/api/state');
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
