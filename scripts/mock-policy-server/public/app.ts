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

	interface Preset {
		id: string;
		label: string;
		description: string;
		status?: number;
		body: unknown;
	}

	interface Endpoint {
		id: string;
		label: string;
		path: string;
		productKey: string;
		description: string;
		schema?: boolean;
		url?: string;
		status?: number;
		body?: unknown;
		active?: boolean;
		presets: Preset[];
	}

	interface ServerState {
		endpoints: Endpoint[];
		wired: boolean;
		overridesSnippet?: string;
		overridesPath?: string;
		baseUrl?: string;
		upstream?: string;
		cacheDirs?: string[];
	}

	interface LogEntry {
		at: number;
		method: string;
		path: string;
		outcome: 'mocked' | 'passthrough' | 'upstream-error';
		status: number;
	}

	interface CacheResult {
		cleared: { dir: string; files: number }[];
		missing: string[];
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
	const responseStatusInput = $('response-status') as HTMLInputElement;
	const responseStatusValidation = $('response-status-validation');
	const presetSelect = $('preset') as HTMLSelectElement;
	const activeCheckbox = $('active') as HTMLInputElement;
	const endpointMeta = $('endpoint-meta');
	const endpointUrlEl = $('endpoint-url');
	const editorStatus = $('editor-status');
	const saveStateEl = $('save-state');
	const wiredStatusEl = $('wired-status');

	let endpoints: Endpoint[] = [];
	/** Currently selected endpoint id. */
	let activeId = '';
	/** Working copy of each endpoint body as edited in the GUI (string). */
	const drafts: Record<string, string> = {};
	/** Loaded managed-settings schema (or null if unavailable). */
	let schema: JsonSchema | null = null;
	/** Latest overrides snippet + path for copy-to-clipboard. */
	let overridesSnippet = '';
	let overridesPath = '';

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

	function activeEndpoint(): Endpoint | undefined {
		return endpoints.find(e => e.id === activeId);
	}

	function setStatus(message: string, kind?: string): void {
		editorStatus.textContent = message;
		editorStatus.dataset.kind = kind || '';
	}

	/**
	 * Everything in this GUI auto-saves, so the one thing a user needs to know
	 * is whether what they are looking at is what the server is serving. This
	 * pill is that answer.
	 */
	function setSaveState(kind: 'live' | 'pending' | 'error', message: string): void {
		saveStateEl.textContent = message;
		saveStateEl.dataset.kind = kind;
	}

	function parseResponseStatus(): number | undefined {
		const raw = responseStatusInput.value.trim();
		const status = Number(raw);
		const valid = raw !== '' && Number.isInteger(status) && status >= 200 && status <= 599;
		const message = valid ? '' : 'Enter an integer from 200 to 599.';
		responseStatusInput.setCustomValidity(message);
		responseStatusInput.setAttribute('aria-invalid', String(!valid));
		responseStatusValidation.textContent = message;
		responseStatusValidation.dataset.kind = valid ? '' : 'error';
		return valid ? status : undefined;
	}

	/** Validate the editor content as JSON. Returns parsed value or undefined. */
	function parseEditor(): unknown | undefined {
		const responseStatus = parseResponseStatus() ?? activeEndpoint()?.status ?? 200;
		const raw = editor.value.trim();
		if (raw === '') {
			setStatus('Empty body — will be served as {}.', '');
			$('validation-results').hidden = true;
			return {};
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (e) {
			setStatus(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`, 'error');
			$('validation-results').hidden = true;
			return undefined;
		}
		const warning = validateAgainstSchema(parsed, responseStatus);
		if (warning) {
			setStatus(`Valid JSON. ${warning}`, 'warn');
		} else {
			setStatus('Valid JSON.', 'ok');
		}
		if (schemaApplies(responseStatus) && schema && isPlainObject(parsed)) {
			renderValidationResults(parsed);
		} else {
			$('validation-results').hidden = true;
		}
		return parsed;
	}

	function isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	/**
	 * Whether schema warnings are meaningful right now. A non-2xx body is an
	 * error payload rather than a policy document, so unknown-key warnings
	 * there would be pure noise.
	 */
	function schemaApplies(responseStatus: number): boolean {
		return activeEndpoint()?.schema === true && responseStatus >= 200 && responseStatus < 300;
	}

	/**
	 * Best-effort check of a managed-settings body against the loaded JSON schema:
	 * warn about top-level keys not declared in `schema.properties`. Mirrors the
	 * way `projectManagedSettings` drops undeclared keys. Returns a warning string
	 * or '' when nothing to report.
	 */
	function validateAgainstSchema(parsed: unknown, responseStatus: number): string {
		if (!schemaApplies(responseStatus) || !schema || !isPlainObject(parsed)) {
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
			if (endpoint.id === activeId) {
				tab.setAttribute('aria-current', 'true');
			}

			const dot = document.createElement('span');
			dot.className = 'dot' + (endpoint.active ? ' on' : '');
			dot.title = endpoint.active ? 'Mocked by this server' : 'Proxied to the real API';
			tab.append(dot, document.createTextNode(endpoint.label));

			const state = document.createElement('span');
			state.className = 'sr-only';
			state.textContent = endpoint.active ? ' (mocked)' : ' (proxied)';
			tab.append(state);

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
		responseStatusInput.value = String(endpoint.status ?? 200);
		activeCheckbox.checked = endpoint.active === true;
		renderActiveHelp();
		parseResponseStatus();
		editor.value = drafts[id] ?? JSON.stringify(endpoint.body ?? {}, null, '\t');
		renderTabs();
		renderPresets();
		// Show the schema section only for schema-backed endpoints.
		$('schema-section').hidden = endpoint.schema !== true;
		$('validation-results').hidden = true;
		parseEditor();
		setSaveState('live', 'Serving');
	}

	function renderActiveHelp(): void {
		$('active-help').textContent = activeCheckbox.checked
			? 'This server answers this path. Edits below take effect on the next request.'
			: 'Requests to this path are proxied to the real API. Nothing below is served until you turn mocking on.';
	}

	function renderPresets(): void {
		const endpoint = activeEndpoint();
		presetSelect.textContent = '';
		(endpoint?.presets ?? []).forEach(preset => {
			const option = document.createElement('option');
			option.value = preset.id;
			option.textContent = preset.label;
			presetSelect.appendChild(option);
		});
		renderPresetDescription();
	}

	function renderPresetDescription(): void {
		const preset = activeEndpoint()?.presets.find(p => p.id === presetSelect.value);
		$('preset-description').textContent = preset?.description ?? '';
	}

	function applyPreset(): void {
		const endpoint = activeEndpoint();
		const preset = endpoint?.presets.find(p => p.id === presetSelect.value);
		if (!endpoint || !preset) {
			return;
		}
		endpoint.status = preset.status ?? 200;
		responseStatusInput.value = String(endpoint.status);
		// Applying a preset is an unambiguous "serve this", so switch mocking on
		// rather than saving a body that is still being proxied past.
		activeCheckbox.checked = true;
		renderActiveHelp();
		parseResponseStatus();
		editor.value = JSON.stringify(preset.body, null, '\t');
		drafts[activeId] = editor.value;
		saveDrafts();
		parseEditor();
		void save();
	}

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

	function renderProxy(state: ServerState): void {
		if (state.upstream) {
			$('upstream').textContent = state.upstream;
			$('map-from').textContent = `${state.upstream}/copilot_internal/*`;
		}
		if (state.baseUrl) {
			$('map-to').textContent = `${state.baseUrl}/copilot_internal/*`;
		}
	}

	function applyState(state: ServerState): void {
		endpoints = state.endpoints;
		renderWired(state);
		renderProxy(state);
		renderTabs();
	}

	async function save(): Promise<void> {
		const responseStatus = parseResponseStatus();
		if (responseStatus === undefined) {
			setSaveState('error', 'Not saved');
			return;
		}
		const parsed = parseEditor();
		if (parsed === undefined) {
			setSaveState('error', 'Not saved');
			return;
		}
		const endpoint = activeEndpoint();
		if (endpoint) {
			endpoint.status = responseStatus;
		}
		try {
			const state = await api<ServerState>('/api/state', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: activeId, status: responseStatus, body: parsed, active: activeCheckbox.checked })
			});
			applyState(state);
			drafts[activeId] = editor.value;
			saveDrafts();
			setSaveState('live', 'Serving');
		} catch (e) {
			setSaveState('error', 'Not saved');
			toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, true);
		}
	}

	let saveTimer: ReturnType<typeof setTimeout> | 0 = 0;
	function debouncedSave(): void {
		setSaveState('pending', 'Saving\u2026');
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 400);
	}

	async function wire(wireIt: boolean): Promise<void> {
		try {
			const state = await api<ServerState>(wireIt ? '/api/wire' : '/api/unwire', { method: 'POST' });
			applyState(state);
			toast(wireIt ? 'Overrides applied — reload Code OSS' : 'Original file restored — reload Code OSS');
		} catch (e) {
			toast(`${wireIt ? 'Apply' : 'Restore'} failed: ${e instanceof Error ? e.message : String(e)}`, true);
		}
	}

	function formatJson(): void {
		const parsed = parseEditor();
		if (parsed !== undefined) {
			editor.value = JSON.stringify(parsed, null, '\t');
			drafts[activeId] = editor.value;
			saveDrafts();
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
		parseEditor();
	}

	function renderValidationResults(parsed: Record<string, unknown>): void {
		const container = $('validation-results');
		const properties = schema?.properties ?? {};
		const schemaKeys = Object.keys(properties);
		const bodyKeys = Object.keys(parsed);
		const allKeys = [...new Set([...schemaKeys, ...bodyKeys])].sort();

		if (allKeys.length === 0) {
			container.hidden = true;
			setStatus('Schema has no properties to validate against.', 'warn');
			return;
		}

		const table = document.createElement('table');
		table.className = 'validation-table';
		const head = document.createElement('thead');
		const headRow = document.createElement('tr');
		for (const heading of ['Key', 'Status', 'Description']) {
			const th = document.createElement('th');
			th.textContent = heading;
			headRow.appendChild(th);
		}
		head.appendChild(headRow);
		const tbody = document.createElement('tbody');

		for (const key of allKeys) {
			const inSchema = Object.hasOwn(properties, key);
			const inBody = Object.hasOwn(parsed, key);
			let statusText: string;
			let cls = '';
			if (inSchema && inBody) {
				statusText = '\u2713 Present';
				cls = 'validation-ok';
			} else if (inSchema) {
				statusText = '\u2014 Not set';
			} else {
				statusText = '\u26A0 Unknown (will be dropped)';
				cls = 'validation-warn';
			}

			const row = document.createElement('tr');
			const keyCell = document.createElement('td');
			const keyCode = document.createElement('code');
			keyCode.textContent = key;
			keyCell.appendChild(keyCode);
			const statusCell = document.createElement('td');
			statusCell.className = cls;
			statusCell.textContent = statusText;
			const descCell = document.createElement('td');
			descCell.textContent = (properties[key]?.description || '').split('.')[0];
			row.append(keyCell, statusCell, descCell);
			tbody.appendChild(row);
		}

		table.append(head, tbody);

		const unknownCount = bodyKeys.filter(k => !Object.hasOwn(properties, k)).length;
		const presentCount = bodyKeys.length - unknownCount;
		const summary = document.createElement('p');
		summary.className = 'validation-summary';
		summary.textContent = `${presentCount} of ${schemaKeys.length} schema keys set`
			+ (unknownCount ? `, ${unknownCount} unknown` : '');
		if (unknownCount) {
			summary.classList.add('validation-warn');
		}

		container.replaceChildren(table, summary);
		container.hidden = false;
		setStatus(unknownCount ? `${unknownCount} key${unknownCount > 1 ? 's' : ''} not in schema.` : 'All keys match the schema.', unknownCount ? 'warn' : 'ok');
	}

	function toggleSchemaView(): void {
		const viewEl = $('schema-view');
		viewEl.hidden = !viewEl.hidden;
		$('toggle-schema').textContent = viewEl.hidden ? 'View' : 'Hide';
	}

	function toggleSchemaSection(): void {
		const detailsEl = $('schema-details');
		// `hidden` can also be the string 'until-found', so normalize to boolean.
		const willOpen = Boolean(detailsEl.hidden);
		detailsEl.hidden = !willOpen;
		$('schema-chevron').classList.toggle('open', willOpen);
		$('schema-toggle').setAttribute('aria-expanded', String(willOpen));
	}

	async function refreshLog(): Promise<void> {
		let entries: LogEntry[];
		try {
			({ entries } = await api<{ entries: LogEntry[] }>('/api/log'));
		} catch {
			return; // the server is down; the next poll will recover
		}
		const list = $('log');
		$('log-empty').hidden = entries.length > 0;
		list.replaceChildren();
		for (const entry of entries.slice(0, 40)) {
			const item = document.createElement('li');
			item.className = `log-item ${entry.outcome}`;
			item.title = entry.outcome === 'mocked'
				? 'Served from this server'
				: entry.outcome === 'passthrough' ? 'Proxied to the real API' : 'Upstream request failed';

			const time = document.createElement('span');
			time.className = 'log-time';
			time.textContent = new Date(entry.at).toLocaleTimeString();
			const status = document.createElement('span');
			status.className = 'log-status';
			status.textContent = String(entry.status);
			const route = document.createElement('span');
			route.className = 'log-path';
			route.textContent = `${entry.method} ${entry.path}`;

			item.append(time, status, route);
			list.appendChild(item);
		}
	}

	async function copy(text: string, button: HTMLElement): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			const original = button.textContent;
			button.textContent = 'Copied \u2713';
			setTimeout(() => { button.textContent = original; }, 1500);
		} catch {
			toast('Copy failed — check clipboard permissions', true);
		}
	}

	let toastTimer: ReturnType<typeof setTimeout> | 0 = 0;
	function toast(message: string, isError = false): void {
		const node = $('toast');
		node.textContent = message;
		node.dataset.kind = isError ? 'error' : '';
		node.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { node.hidden = true; }, 3000);
	}

	async function init(): Promise<void> {
		const savedSource = localStorage.getItem('mock-policy-schema-source');
		if (savedSource) {
			($('schema-source') as HTMLInputElement).value = savedSource;
		}
		loadDrafts();

		editor.addEventListener('input', () => {
			drafts[activeId] = editor.value;
			saveDrafts();
			parseEditor();
			debouncedSave();
		});
		responseStatusInput.addEventListener('input', () => {
			// Re-run validation on status change too: schema warnings only apply
			// to 2xx bodies, so the status decides whether they are shown.
			parseEditor();
			debouncedSave();
		});
		activeCheckbox.addEventListener('change', async () => {
			renderActiveHelp();
			await save();
			toast(activeCheckbox.checked ? 'Mocking this endpoint' : 'Proxying this endpoint upstream');
		});
		presetSelect.addEventListener('change', renderPresetDescription);
		$('apply-preset').addEventListener('click', applyPreset);
		$('format').addEventListener('click', formatJson);
		$('wire').addEventListener('click', () => wire(true));
		$('unwire').addEventListener('click', () => wire(false));
		$('copy-overrides').addEventListener('click', e => copy(overridesSnippet, e.currentTarget as HTMLElement));
		$('copy-overrides-path').addEventListener('click', e => copy(overridesPath, e.currentTarget as HTMLElement));
		$('copy-map').addEventListener('click', e => {
			copy(`${$('map-from').textContent}\n${$('map-to').textContent}`, e.currentTarget as HTMLElement);
		});
		$('schema-toggle').addEventListener('click', toggleSchemaSection);
		$('toggle-schema').addEventListener('click', toggleSchemaView);
		$('refresh-schema').addEventListener('click', loadSchema);
		$('hydrate-schema').addEventListener('click', () => {
			if (!schema) {
				setStatus('Load a schema first.', 'error');
				return;
			}
			responseStatusInput.value = '200';
			activeCheckbox.checked = true;
			renderActiveHelp();
			parseResponseStatus();
			editor.value = JSON.stringify(hydrateFromSchema(schema), null, '\t');
			drafts[activeId] = editor.value;
			saveDrafts();
			parseEditor();
			void save();
			setStatus('Generated an example from the schema.', 'ok');
		});
		$('clear-cache').addEventListener('click', async () => {
			try {
				const result = await api<CacheResult>('/api/cache', { method: 'DELETE' });
				const count = result.cleared.reduce((total, item) => total + item.files, 0);
				toast(result.cleared.length === 0
					? 'No managed-settings cache found — nothing to clear'
					: `Cleared ${count} cached ${count === 1 ? 'entry' : 'entries'}`);
			} catch (e) {
				toast(`Could not clear cache: ${e instanceof Error ? e.message : String(e)}`, true);
			}
		});
		$('clear-log').addEventListener('click', async () => {
			try {
				await api('/api/log', { method: 'DELETE' });
				await refreshLog();
			} catch { /* the poll will catch up */ }
		});

		document.addEventListener('keydown', event => {
			if ((event.metaKey || event.ctrlKey) && event.key === 's') {
				event.preventDefault();
				clearTimeout(saveTimer);
				void save();
			}
		});

		try {
			const state = await api<ServerState>('/api/state');
			applyState(state);
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
		} catch (e) {
			// Fall back to the shared endpoint definitions so the GUI still shows
			// what exists (read-only) rather than rendering a blank page.
			endpoints = MOCK_POLICY_ENDPOINTS.map(def => ({ ...def, status: def.presets[0]?.status ?? 200, body: def.presets[0]?.body ?? {} }));
			renderTabs();
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
			setStatus(`Failed to load state: ${e instanceof Error ? e.message : String(e)}`, 'error');
			toast('Cannot reach the server. Is it still running?', true);
		}

		await loadSchema();
		await refreshLog();
		setInterval(refreshLog, 2000);
	}

	void init();
})();
