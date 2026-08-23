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
type EndpointDef = import('../endpoints').EndpointDef;

declare const MOCK_POLICY_ENDPOINTS: EndpointDef[];

(function () {
	'use strict';

	interface Endpoint extends EndpointDef {
		url?: string;
		status?: number;
		body?: unknown;
		active?: boolean;
	}

	interface ServerState {
		endpoints: Endpoint[];
		wired: boolean;
		baseUrl?: string;
		upstream?: string;
		overridesPath?: string;
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
	}

	interface SchemaResult {
		ok: boolean;
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
		allOf?: JsonSchema[];
		anyOf?: JsonSchema[];
		oneOf?: JsonSchema[];
	}

	interface ValidationRow {
		key: string;
		path: string;
		depth: number;
		schema?: JsonSchema;
		inSchema: boolean;
		inBody: boolean;
		dynamic: boolean;
	}

	interface SaveSnapshot {
		endpoint: string;
		status: number;
		body: unknown;
		active: boolean;
		editorText: string;
	}

	type SetupMethod = 'proxy' | 'overrides';

	const $ = (id: string): HTMLElement => document.getElementById(id)!;
	const tabs = $('tabs');
	const editor = $('editor') as HTMLTextAreaElement;
	const responseStatusInput = $('response-status') as HTMLInputElement;
	const responseStatusValidation = $('response-status-validation');
	const presetSelect = $('preset') as HTMLSelectElement;
	const endpointMeta = $('endpoint-meta');
	const editorStatus = $('editor-status');
	const saveStateEl = $('save-state');
	const setupDialog = $('setup-dialog') as HTMLDialogElement;
	const vscodeProxySettings = '{\n\t"http.proxy": "http://localhost:9090"\n}';

	let endpoints: Endpoint[] = [];
	let activeId = '';
	const drafts: Record<string, string> = {};
	let schema: JsonSchema | null = null;
	let overridesWired = false;
	let proxyVerified = false;
	let proxyBaseUrl = '';
	let proxyUpstream = '';
	let proxyCheckInFlight = false;
	let stateUpdateQueue: Promise<void> = Promise.resolve();
	const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

	function activeEndpoint(): Endpoint | undefined {
		return endpoints.find(e => e.id === activeId);
	}

	function setStatus(message: string, kind?: string): void {
		editorStatus.textContent = message;
		editorStatus.dataset.kind = kind || '';
	}

	function setSaveState(kind: 'live' | 'pending' | 'error', message: string): void {
		saveStateEl.textContent = message;
		saveStateEl.dataset.kind = kind;
	}

	function setLiveSaveState(): void {
		setSaveState('live', activeEndpoint()?.active ? 'Serving' : 'Saved');
	}

	function renderSaveState(): void {
		if (pendingSaves.has(activeId)) {
			setSaveState('pending', 'Saving\u2026');
		} else {
			setLiveSaveState();
		}
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
			setStatus('');
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

	function validateAgainstSchema(parsed: unknown, responseStatus: number): string {
		if (!schemaApplies(responseStatus) || !schema || !isPlainObject(parsed)) {
			return '';
		}
		const unknown = validationRows(schema, parsed).filter(row => row.inBody && !row.inSchema).map(row => row.path);
		return unknown.length ? `Keys not in schema: ${unknown.join(', ')}.` : '';
	}

	function validationRows(schemaNode: JsonSchema, body: unknown, path: readonly string[] = [], depth = 0): ValidationRow[] {
		schemaNode = resolvedSchema(schemaNode, body);
		const properties = schemaNode.properties ?? {};
		const bodyObject = isPlainObject(body) ? body : {};
		const explicitKeys = Object.keys(properties);
		const bodyKeys = Object.keys(bodyObject);
		const keys = [...explicitKeys, ...bodyKeys.filter(key => !Object.hasOwn(properties, key)).sort()];
		const rows: ValidationRow[] = [];

		if (keys.length === 0 && typeof schemaNode.additionalProperties === 'object') {
			const dynamicPath = [...path, '*'];
			rows.push({
				key: '*',
				path: dynamicPath.join('.'),
				depth,
				schema: schemaNode.additionalProperties,
				inSchema: true,
				inBody: false,
				dynamic: true
			});
			rows.push(...validationRows(schemaNode.additionalProperties, undefined, dynamicPath, depth + 1));
			return rows;
		}

		for (const key of keys) {
			const explicitSchema = properties[key];
			const additionalSchema = !explicitSchema && typeof schemaNode.additionalProperties === 'object'
				? schemaNode.additionalProperties
				: undefined;
			const childSchema = explicitSchema ?? additionalSchema;
			const childPath = [...path, key];
			const inBody = Object.hasOwn(bodyObject, key);
			rows.push({
				key,
				path: childPath.join('.'),
				depth,
				schema: childSchema,
				inSchema: childSchema !== undefined || schemaNode.additionalProperties === true,
				inBody,
				dynamic: additionalSchema !== undefined
			});
			if (childSchema && hasNestedSchema(childSchema)) {
				rows.push(...validationRows(childSchema, inBody ? bodyObject[key] : undefined, childPath, depth + 1));
			}
		}

		return rows;
	}

	function resolvedSchema(schemaNode: JsonSchema, body: unknown): JsonSchema {
		const bodyObject = isPlainObject(body) ? body : undefined;
		const alternatives = [...(schemaNode.oneOf ?? []), ...(schemaNode.anyOf ?? [])];
		const matchingAlternatives = bodyObject
			? alternatives.filter(alternative => schemaMatchesValue(alternative, bodyObject))
			: [];
		const selectedAlternatives = matchingAlternatives.length ? matchingAlternatives : alternatives;
		return mergeSchemas(schemaNode, ...(schemaNode.allOf ?? []), ...selectedAlternatives);
	}

	function schemaMatchesValue(schemaNode: JsonSchema, value: Record<string, unknown>): boolean {
		const constants = Object.entries(schemaNode.properties ?? {}).filter(([, property]) => property.const !== undefined);
		return constants.length > 0 && constants.every(([key, property]) => value[key] === property.const);
	}

	function mergeSchemas(...schemas: JsonSchema[]): JsonSchema {
		const merged: JsonSchema = {};
		for (const schemaNode of schemas) {
			const previousProperties = merged.properties;
			Object.assign(merged, schemaNode);
			if (schemaNode.properties) {
				merged.properties = { ...previousProperties };
				for (const [key, property] of Object.entries(schemaNode.properties)) {
					merged.properties[key] = merged.properties[key]
						? mergeSchemas(merged.properties[key], property)
						: property;
				}
			}
		}
		delete merged.allOf;
		delete merged.anyOf;
		delete merged.oneOf;
		return merged;
	}

	function hasNestedSchema(schemaNode: JsonSchema): boolean {
		return schemaNode.properties !== undefined
			|| typeof schemaNode.additionalProperties === 'object'
			|| schemaNode.allOf !== undefined
			|| schemaNode.anyOf !== undefined
			|| schemaNode.oneOf !== undefined;
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
			const item = document.createElement('div');
			item.className = 'tab-item' + (endpoint.id === activeId ? ' active' : '');

			const tab = document.createElement('button');
			tab.type = 'button';
			tab.className = 'tab';
			if (endpoint.id === activeId) {
				tab.setAttribute('aria-current', 'true');
			}
			tab.textContent = endpoint.label;
			tab.addEventListener('click', () => selectEndpoint(endpoint.id));

			const toggle = document.createElement('label');
			toggle.className = 'tab-toggle';
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = endpoint.active === true;
			checkbox.setAttribute('aria-label', `Mock ${endpoint.label}`);
			checkbox.addEventListener('change', () => {
				void setEndpointActive(endpoint, checkbox.checked);
			});
			const track = document.createElement('span');
			track.className = 'tab-toggle-track';
			track.setAttribute('aria-hidden', 'true');
			toggle.append(checkbox, track);

			item.append(tab, toggle);
			tabs.appendChild(item);
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
		const routeLink = document.createElement('a');
		routeLink.href = endpoint.url ?? endpoint.path;
		routeLink.target = '_blank';
		routeLink.rel = 'noopener';
		routeLink.setAttribute('aria-label', `Open ${endpoint.label} endpoint`);
		const codePath = document.createElement('code');
		codePath.textContent = `GET ${endpoint.path}`;
		routeLink.appendChild(codePath);
		const codeKey = document.createElement('code');
		codeKey.textContent = endpoint.productKey;
		routeSpan.append(routeLink, ' · ', codeKey);

		endpointMeta.replaceChildren(routeSpan);
		responseStatusInput.value = String(endpoint.status ?? 200);
		parseResponseStatus();
		editor.value = drafts[id] ?? JSON.stringify(endpoint.body ?? {}, null, '\t');
		renderTabs();
		renderPresets();
		renderProxy();
		// Show the schema section only for schema-backed endpoints.
		$('schema-section').hidden = endpoint.schema !== true;
		$('validation-results').hidden = true;
		parseEditor();
		renderSaveState();
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
		endpoint.active = true;
		parseResponseStatus();
		editor.value = JSON.stringify(preset.body, null, '\t');
		drafts[activeId] = editor.value;
		parseEditor();
		clearPendingSave(activeId);
		void save();
	}

	function renderWired(state: ServerState): void {
		overridesWired = state.wired;
		const status = $('override-status');
		status.textContent = state.wired ? 'Applied \u2713' : 'Not applied';
		status.dataset.state = state.wired ? 'ready' : 'pending';
		const action = $('overrides-action');
		action.textContent = state.wired ? 'Restore Original' : 'Apply Overrides';
		action.className = state.wired ? 'btn-secondary' : 'btn-primary';
		updateReadiness();
	}

	function renderProxy(): void {
		const endpoint = endpoints.find(candidate => candidate.id === 'managedSettings') ?? endpoints[0];
		$('map-from').textContent = endpoint && proxyUpstream ? `${proxyUpstream}${endpoint.path}` : '';
		$('map-to').textContent = endpoint && proxyBaseUrl ? `${proxyBaseUrl}${endpoint.path}` : '';
	}

	function selectSetupMethod(method: SetupMethod): void {
		for (const candidate of ['proxy', 'overrides'] as const) {
			const selected = candidate === method;
			$(`${candidate}-method`).dataset.selected = String(selected);
			$(`${candidate}-method-steps`).toggleAttribute('inert', !selected);
			($(`setup-method-${candidate}`) as HTMLInputElement).checked = selected;
		}
	}

	function updateReadiness(): void {
		const connectionReady = proxyVerified || overridesWired;
		const globalStatus = $('global-connection-status');
		globalStatus.dataset.state = connectionReady ? 'ready' : proxyCheckInFlight ? 'checking' : 'error';
		$('global-connection-label').textContent = proxyVerified
			? 'System proxy connected'
			: overridesWired ? 'Code OSS overrides active' : proxyCheckInFlight ? 'Checking connection\u2026' : 'No connection detected';
	}

	function renderProxyStatus(state: 'checking' | 'ready' | 'pending', message: string, detail: string): void {
		const status = $('proxy-status');
		status.dataset.state = state;
		status.textContent = message;
		$('proxy-check-detail').textContent = detail;
	}

	async function checkProxy(): Promise<void> {
		if (proxyCheckInFlight) {
			return;
		}
		const endpoint = endpoints.find(candidate => candidate.id === 'managedSettings') ?? endpoints[0];
		if (!endpoint || !proxyUpstream) {
			proxyVerified = false;
			renderProxyStatus('pending', 'Not detected', 'Could not determine the managed settings URL. Reload the page and try again.');
			updateReadiness();
			return;
		}

		const wasVerified = proxyVerified;
		const checkStartedAt = Date.now();
		proxyCheckInFlight = true;
		updateReadiness();
		if (!wasVerified) {
			renderProxyStatus('checking', 'Checking\u2026', 'Testing the managed settings URL without sending credentials.');
		}
		let nextState: 'ready' | 'pending';
		let nextMessage: string;
		let nextDetail: string;
		try {
			const probe = new URL(endpoint.path, proxyUpstream);
			probe.searchParams.set('mockPolicySetupProbe', crypto.randomUUID());
			const response = await fetch(probe, { cache: 'no-store', credentials: 'omit' });
			proxyVerified = response.headers.get('X-Mock-Policy-Server') === 'true';
			nextState = proxyVerified ? 'ready' : 'pending';
			nextMessage = proxyVerified ? 'Connected' : 'Not detected';
			nextDetail = proxyVerified
				? 'Requests to the managed settings URL are reaching this server.'
				: 'The test request did not reach this server. Check that your system proxy and redirect rule are enabled.';
		} catch {
			proxyVerified = false;
			nextState = 'pending';
			nextMessage = 'Not detected';
			nextDetail = 'The test request did not reach this server. Check your system proxy, redirect rule, and HTTPS certificate trust.';
		}

		if (!wasVerified) {
			const remainingCheckingTime = 600 - (Date.now() - checkStartedAt);
			if (remainingCheckingTime > 0) {
				await new Promise<void>(resolve => setTimeout(resolve, remainingCheckingTime));
			}
		}
		renderProxyStatus(nextState, nextMessage, nextDetail);
		proxyCheckInFlight = false;
		updateReadiness();
	}

	function openSetupDialog(): void {
		if (!setupDialog.open) {
			setupDialog.showModal();
		}
		$('setup-nav').setAttribute('aria-expanded', 'true');
	}

	function syncSetupDialog(): void {
		if (location.hash === '#setup') {
			openSetupDialog();
		} else if (setupDialog.open) {
			setupDialog.close();
		}
	}

	function applyState(state: ServerState): void {
		endpoints = state.endpoints;
		proxyBaseUrl = state.baseUrl ?? '';
		proxyUpstream = state.upstream ?? '';
		renderWired(state);
		renderProxy();
		renderTabs();
	}

	function updateState(payload: Record<string, unknown>): Promise<ServerState> {
		const request = stateUpdateQueue.then(() => api<ServerState>('/api/state', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}));
		stateUpdateQueue = request.then(() => undefined, () => undefined);
		return request;
	}

	async function setEndpointActive(endpoint: Endpoint, active: boolean): Promise<void> {
		const previousActive = endpoint.active;
		endpoint.active = active;
		if (endpoint.id === activeId) {
			const snapshot = captureSaveSnapshot();
			if (!snapshot) {
				endpoint.active = previousActive;
				renderTabs();
				return;
			}
			clearPendingSave(endpoint.id);
			if (await saveSnapshot(snapshot)) {
				toast(active ? `Mocking ${endpoint.label}` : `Proxying ${endpoint.label}`);
			} else {
				endpoint.active = previousActive;
				renderTabs();
			}
			return;
		}
		try {
			const state = await updateState({ endpoint: endpoint.id, active });
			applyState(state);
			toast(active ? `Mocking ${endpoint.label}` : `Proxying ${endpoint.label}`);
		} catch (e) {
			endpoint.active = previousActive;
			renderTabs();
			toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, true);
		}
	}

	function captureSaveSnapshot(): SaveSnapshot | undefined {
		const responseStatus = parseResponseStatus();
		if (responseStatus === undefined) {
			setSaveState('error', 'Not saved');
			return undefined;
		}
		const parsed = parseEditor();
		if (parsed === undefined) {
			setSaveState('error', 'Not saved');
			return undefined;
		}
		const endpoint = activeEndpoint();
		if (!endpoint) {
			return undefined;
		}
		endpoint.status = responseStatus;
		return {
			endpoint: endpoint.id,
			status: responseStatus,
			body: parsed,
			active: endpoint.active === true,
			editorText: editor.value
		};
	}

	async function saveSnapshot(snapshot: SaveSnapshot): Promise<boolean> {
		try {
			const state = await updateState({
				endpoint: snapshot.endpoint,
				status: snapshot.status,
				body: snapshot.body,
				active: snapshot.active
			});
			applyState(state);
			drafts[snapshot.endpoint] = snapshot.editorText;
			if (snapshot.endpoint === activeId && editor.value === snapshot.editorText && !pendingSaves.has(snapshot.endpoint)) {
				setLiveSaveState();
			}
			return true;
		} catch (e) {
			if (snapshot.endpoint === activeId) {
				setSaveState('error', 'Not saved');
			}
			toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, true);
			return false;
		}
	}

	async function save(): Promise<void> {
		const snapshot = captureSaveSnapshot();
		if (!snapshot) {
			return;
		}
		clearPendingSave(snapshot.endpoint);
		await saveSnapshot(snapshot);
	}

	function clearPendingSave(endpoint: string): void {
		const timer = pendingSaves.get(endpoint);
		if (timer !== undefined) {
			clearTimeout(timer);
			pendingSaves.delete(endpoint);
		}
	}

	function debouncedSave(): void {
		const snapshot = captureSaveSnapshot();
		if (!snapshot) {
			return;
		}
		setSaveState('pending', 'Saving\u2026');
		clearPendingSave(snapshot.endpoint);
		pendingSaves.set(snapshot.endpoint, setTimeout(() => {
			pendingSaves.delete(snapshot.endpoint);
			void saveSnapshot(snapshot);
		}, 400));
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

	async function loadSchema(): Promise<void> {
		const badgeEl = $('schema-badge');

		try {
			const result = await api<SchemaResult>('/api/schema');
			if (result.ok) {
				schema = result.schema ?? null;
				badgeEl.textContent = 'Loaded \u2713';
				badgeEl.dataset.kind = 'ok';
				badgeEl.dataset.tooltip = result.resolved || 'Schema loaded';
				$('schema-source').textContent = result.resolved || '';
			} else {
				schema = null;
				badgeEl.textContent = 'Not loaded';
				badgeEl.dataset.kind = 'error';
				badgeEl.dataset.tooltip = result.error || 'Schema unavailable';
				$('schema-source').textContent = result.resolved || '';
			}
		} catch (e) {
			schema = null;
			badgeEl.textContent = 'Not loaded';
			badgeEl.dataset.kind = 'error';
			badgeEl.dataset.tooltip = e instanceof Error ? e.message : String(e);
			$('schema-source').textContent = '';
		}
		parseEditor();
	}

	function renderValidationResults(parsed: Record<string, unknown>): void {
		const container = $('validation-results');
		const rows = schema ? validationRows(schema, parsed) : [];

		if (rows.length === 0) {
			container.hidden = true;
			setStatus('Schema has no properties to validate against.', 'warn');
			return;
		}

		const table = document.createElement('table');
		table.className = 'validation-table';
		const columns = document.createElement('colgroup');
		for (const columnName of ['key', 'status', 'description']) {
			const column = document.createElement('col');
			column.className = `validation-column-${columnName}`;
			columns.appendChild(column);
		}
		const head = document.createElement('thead');
		const headRow = document.createElement('tr');
		for (const heading of ['Key', 'Status', 'Description']) {
			const th = document.createElement('th');
			th.textContent = heading;
			th.scope = 'col';
			headRow.appendChild(th);
		}
		head.appendChild(headRow);
		const tbody = document.createElement('tbody');

		for (const validation of rows) {
			let statusText: string;
			let cls = '';
			if (validation.dynamic && !validation.inBody) {
				statusText = 'Any name';
			} else if (validation.inSchema && validation.inBody) {
				statusText = '\u2713 Present';
				cls = 'validation-ok';
			} else if (validation.inSchema) {
				statusText = '\u2014 Not set';
			} else {
				statusText = '\u26A0 Not in schema';
				cls = 'validation-warn';
			}

			const row = document.createElement('tr');
			const keyCell = document.createElement('td');
			keyCell.className = 'validation-key';
			const keyCode = document.createElement('code');
			keyCode.textContent = validation.key;
			keyCode.title = validation.path;
			keyCode.setAttribute('aria-label', validation.path);
			keyCode.style.setProperty('--validation-depth', String(validation.depth));
			if (validation.depth > 0) {
				keyCode.classList.add('nested');
			}
			keyCell.appendChild(keyCode);
			const statusCell = document.createElement('td');
			statusCell.classList.add('validation-status');
			if (cls) {
				statusCell.classList.add(cls);
			}
			statusCell.textContent = statusText;
			const descCell = document.createElement('td');
			descCell.className = 'validation-description';
			descCell.textContent = (validation.schema?.description || '').split('.')[0];
			row.append(keyCell, statusCell, descCell);
			tbody.appendChild(row);
		}

		table.append(columns, head, tbody);
		const tableContainer = document.createElement('div');
		tableContainer.className = 'validation-table-container';
		tableContainer.appendChild(table);

		const schemaRows = rows.filter(row => row.inSchema && !row.dynamic);
		const presentCount = schemaRows.filter(row => row.inBody).length;
		const unknownCount = rows.filter(row => row.inBody && !row.inSchema).length;
		const summary = document.createElement('p');
		summary.className = 'validation-summary';
		summary.textContent = `${presentCount} of ${schemaRows.length} schema keys set`
			+ (unknownCount ? `, ${unknownCount} unknown` : '');
		if (unknownCount) {
			summary.classList.add('validation-warn');
		}

		container.replaceChildren(tableContainer, summary);
		container.hidden = false;
		setStatus(unknownCount ? `${unknownCount} key${unknownCount > 1 ? 's' : ''} not in schema.` : '', unknownCount ? 'warn' : '');
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

	async function clearPolicyCache(): Promise<void> {
		try {
			const result = await api<CacheResult>('/api/cache', { method: 'DELETE' });
			const count = result.cleared.reduce((total, item) => total + item.files, 0);
			toast(result.cleared.length === 0
				? 'No managed-settings cache found \u2014 nothing to clear'
				: `Cleared ${count} cached ${count === 1 ? 'entry' : 'entries'} \u2014 restart Local Agent Host to refetch`);
		} catch (e) {
			toast(`Could not clear cache: ${e instanceof Error ? e.message : String(e)}`, true);
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
		$('proxy-settings').textContent = vscodeProxySettings;

		editor.addEventListener('input', () => {
			drafts[activeId] = editor.value;
			parseEditor();
			debouncedSave();
		});
		responseStatusInput.addEventListener('input', () => {
			// Re-run validation on status change too: schema warnings only apply
			// to 2xx bodies, so the status decides whether they are shown.
			parseEditor();
			debouncedSave();
		});
		presetSelect.addEventListener('change', applyPreset);
		$('overrides-action').addEventListener('click', () => wire(!overridesWired));
		$('copy-map').addEventListener('click', e => {
			copy(`${$('map-from').textContent}\n${$('map-to').textContent}`, e.currentTarget as HTMLElement);
		});
		$('copy-proxy-settings').addEventListener('click', e => {
			copy(vscodeProxySettings, e.currentTarget as HTMLElement);
		});
		for (const method of ['proxy', 'overrides'] as const) {
			$(`setup-method-${method}`).addEventListener('change', () => selectSetupMethod(method));
		}
		$('setup-nav').addEventListener('click', openSetupDialog);
		$('close-setup').addEventListener('click', () => setupDialog.close());
		$('policies-nav').addEventListener('click', () => {
			if (setupDialog.open) {
				setupDialog.close();
			}
		});
		setupDialog.addEventListener('close', () => {
			$('setup-nav').setAttribute('aria-expanded', 'false');
			if (location.hash === '#setup') {
				history.replaceState(null, '', '#policies');
			}
		});
		window.addEventListener('hashchange', syncSetupDialog);
		$('schema-toggle').addEventListener('click', toggleSchemaSection);
		$('hydrate-schema').addEventListener('click', () => {
			if (!schema) {
				setStatus('Schema unavailable.', 'error');
				return;
			}
			responseStatusInput.value = '200';
			const endpoint = activeEndpoint();
			if (endpoint) {
				endpoint.active = true;
			}
			parseResponseStatus();
			editor.value = JSON.stringify(hydrateFromSchema(schema), null, '\t');
			drafts[activeId] = editor.value;
			parseEditor();
			void save();
			setStatus('Generated an example from the schema.', 'ok');
		});
		$('clear-cache').addEventListener('click', () => { void clearPolicyCache(); });
		$('clear-log').addEventListener('click', async () => {
			try {
				await api('/api/log', { method: 'DELETE' });
				await refreshLog();
			} catch { /* the poll will catch up */ }
		});

		document.addEventListener('keydown', event => {
			if ((event.metaKey || event.ctrlKey) && event.key === 's') {
				event.preventDefault();
				void save();
			}
		});

		try {
			const state = await api<ServerState>('/api/state');
			selectSetupMethod(state.wired ? 'overrides' : 'proxy');
			applyState(state);
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
			syncSetupDialog();
		} catch (e) {
			selectSetupMethod('proxy');
			// Fall back to the shared endpoint definitions so the GUI still shows
			// what exists (read-only) rather than rendering a blank page.
			endpoints = MOCK_POLICY_ENDPOINTS.map(def => ({ ...def, status: def.presets[0]?.status ?? 200, body: def.presets[0]?.body ?? {} }));
			renderTabs();
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
			setStatus(`Failed to load state: ${e instanceof Error ? e.message : String(e)}`, 'error');
			toast('Cannot reach the server. Is it still running?', true);
			syncSetupDialog();
		}

		await loadSchema();
		await refreshLog();
		await checkProxy();
		setInterval(refreshLog, 2000);
		setInterval(() => { void checkProxy(); }, 5000);
	}

	void init();
})();
