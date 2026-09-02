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
type EndpointResponseMode = import('../endpoints').EndpointResponseMode;

declare const MOCK_POLICY_ENDPOINTS: EndpointDef[];

(function () {
	'use strict';

	interface Endpoint extends EndpointDef {
		url?: string;
		status?: number;
		body?: unknown;
		mode?: EndpointResponseMode;
		active?: boolean;
	}

	interface ServerState {
		endpoints: Endpoint[];
		baseUrl?: string;
		upstream?: string;
		stateFile?: string;
		hasPersistedState?: boolean;
	}

	interface SynchronizedDraft {
		stateFile: string;
		value: string;
	}

	function isSynchronizedDraft(value: unknown): value is SynchronizedDraft {
		return typeof value === 'object'
			&& value !== null
			&& 'stateFile' in value
			&& typeof value.stateFile === 'string'
			&& 'value' in value
			&& typeof value.value === 'string';
	}

	interface LogEntry {
		at: number;
		method: string;
		path: string;
		outcome: 'mocked' | 'passthrough' | 'upstream-error';
		status: number;
	}

	interface SchemaResult {
		ok: boolean;
		source: string;
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
		mode: EndpointResponseMode;
		active: boolean;
		editorText: string;
	}

	type SetupMethod = 'proxy' | 'file';

	const $ = (id: string): HTMLElement => document.getElementById(id)!;
	const tabs = $('tabs');
	const editor = $('editor') as HTMLTextAreaElement;
	const responseStatusInput = $('response-status') as HTMLInputElement;
	const responseModeSelect = $('response-mode') as HTMLSelectElement;
	const responseConfiguration = $('response-configuration');
	const responseStatusValidation = $('response-status-validation');
	const presetSelect = $('preset') as HTMLSelectElement;
	const schemaSourceInput = $('schema-source') as HTMLInputElement;
	const loadSchemaButton = $('load-schema') as HTMLButtonElement;
	const endpointMeta = $('endpoint-meta');
	const editorStatus = $('editor-status');
	const saveStateEl = $('save-state');
	const setupDialog = $('setup-dialog') as HTMLDialogElement;
	const vscodeProxySetting = '"http.proxy": "http://localhost:9090"';
	const macOsCacheClearCommand = 'rm -rf -- "${COPILOT_CACHE_HOME:-$HOME/Library/Caches/copilot}/managed-settings"';
	const windowsCacheClearCommand = '$root = if ($env:COPILOT_CACHE_HOME) { $env:COPILOT_CACHE_HOME } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA \'copilot\' } else { Join-Path $HOME \'.cache\\copilot\' }; $path = Join-Path $root \'managed-settings\'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }';
	const draftStoragePrefix = 'mock-policy-server.response-body.';
	const synchronizedDraftStoragePrefix = 'mock-policy-server.synchronized-response-body.';
	const disclosureStoragePrefix = 'mock-policy-server.expanded.';
	const themeStorageKey = 'mock-policy-server.theme';

	let endpoints: Endpoint[] = [];
	let activeId = '';
	const drafts: Record<string, string> = {};
	const dirtyDrafts = new Set<string>();
	let draftStorageErrorShown = false;
	let schema: JsonSchema | null = null;
	let proxyVerified = false;
	let proxyBaseUrl = '';
	let proxyUpstream = '';
	let serverStateFile = '';
	let serverHasPersistedState = true;
	let proxyCheckInFlight = false;
	let renderedLogSignature = '';
	let stateUpdateQueue: Promise<void> = Promise.resolve();
	// Signature of the server state we have already reflected in the UI, plus a
	// counter of our own writes in flight. Together they let the background poll
	// tell an external change (control API, another tab) from our own edits.
	let lastServerSignature = '';
	let stateWritesInFlight = 0;
	let followsSystemTheme = true;
	const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
	let allowNextTabToMoveFocus = false;

	function activeEndpoint(): Endpoint | undefined {
		return endpoints.find(e => e.id === activeId);
	}

	function draftStorageKey(endpointId: string): string {
		return `${draftStoragePrefix}${endpointId}`;
	}

	type Theme = 'light' | 'dark';

	function systemTheme(): Theme {
		return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}

	function applyTheme(theme: Theme): void {
		document.documentElement.dataset.theme = theme;
		const nextTheme = theme === 'dark' ? 'light' : 'dark';
		const toggle = $('theme-toggle');
		toggle.dataset.theme = theme;
		toggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
		toggle.title = `Switch to ${nextTheme} mode`;
	}

	function restoreTheme(): void {
		let persistedTheme: string | null = null;
		try {
			persistedTheme = localStorage.getItem(themeStorageKey);
		} catch (error) {
			reportBrowserStorageError(error);
		}
		const theme = persistedTheme === 'light' || persistedTheme === 'dark' ? persistedTheme : undefined;
		followsSystemTheme = theme === undefined;
		applyTheme(theme ?? systemTheme());
	}

	function toggleTheme(): void {
		const currentTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
		const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
		followsSystemTheme = false;
		applyTheme(nextTheme);
		try {
			localStorage.setItem(themeStorageKey, nextTheme);
		} catch (error) {
			reportBrowserStorageError(error);
		}
	}

	function synchronizedDraftStorageKey(endpointId: string): string {
		return `${synchronizedDraftStoragePrefix}${endpointId}`;
	}

	function reportBrowserStorageError(error: unknown): void {
		console.error('Failed to access browser storage for mock policy server state.', error);
		if (!draftStorageErrorShown) {
			draftStorageErrorShown = true;
			toast('Drafts and expanded sections cannot be stored in this browser session.', true);
		}
	}

	function readPersistedDraft(endpointId: string): string | undefined {
		try {
			return localStorage.getItem(draftStorageKey(endpointId)) ?? undefined;
		} catch (error) {
			reportBrowserStorageError(error);
			return undefined;
		}
	}

	function persistDraft(endpointId: string, value: string): void {
		if (!endpointId) {
			return;
		}
		try {
			localStorage.setItem(draftStorageKey(endpointId), value);
		} catch (error) {
			reportBrowserStorageError(error);
		}
	}

	function readSynchronizedDraft(endpointId: string): SynchronizedDraft | undefined {
		try {
			const stored = localStorage.getItem(synchronizedDraftStorageKey(endpointId));
			if (stored === null) {
				return undefined;
			}
			const parsed: unknown = JSON.parse(stored);
			return isSynchronizedDraft(parsed) ? parsed : undefined;
		} catch (error) {
			reportBrowserStorageError(error);
			return undefined;
		}
	}

	function persistSynchronizedDraft(endpointId: string, value: string, stateFile = serverStateFile): void {
		try {
			localStorage.setItem(synchronizedDraftStorageKey(endpointId), JSON.stringify({ stateFile, value }));
		} catch (error) {
			reportBrowserStorageError(error);
		}
	}

	function readExpandedState(key: string): boolean {
		try {
			return localStorage.getItem(`${disclosureStoragePrefix}${key}`) === 'true';
		} catch (error) {
			reportBrowserStorageError(error);
			return false;
		}
	}

	function persistExpandedState(key: string, expanded: boolean): void {
		try {
			localStorage.setItem(`${disclosureStoragePrefix}${key}`, String(expanded));
		} catch (error) {
			reportBrowserStorageError(error);
		}
	}

	function setSchemaSectionState(expanded: boolean): void {
		$('schema-details').hidden = !expanded;
		$('schema-chevron').classList.toggle('open', expanded);
		$('schema-toggle').setAttribute('aria-expanded', String(expanded));
	}

	function restoreDisclosureState(): void {
		setSchemaSectionState(false);
		for (const details of document.querySelectorAll<HTMLDetailsElement>('details[data-persist-expanded]')) {
			const key = details.dataset.persistExpanded;
			if (!key) {
				continue;
			}
			details.open = readExpandedState(key);
			details.addEventListener('toggle', () => persistExpandedState(key, details.open));
		}
	}

	// File-based managed settings: instead of proxying, a client can read
	// managed-settings.json straight off disk. These build a per-platform
	// one-liner that writes the current Managed Settings body to that file so a
	// dev can bypass the proxy entirely or test precedence against a
	// server-managed response. Paths are the documented deployment locations.
	const macOsManagedSettingsPath = '/Library/Application Support/GitHubCopilot/managed-settings.json';
	const linuxManagedSettingsPath = '/etc/github-copilot/managed-settings.json';

	function macOsFileDeployCommand(body: string): string {
		return `sudo mkdir -p "/Library/Application Support/GitHubCopilot" && sudo tee "${macOsManagedSettingsPath}" >/dev/null <<'JSON'\n${body}\nJSON`;
	}

	function linuxFileDeployCommand(body: string): string {
		return `sudo mkdir -p /etc/github-copilot && sudo tee ${linuxManagedSettingsPath} >/dev/null <<'JSON'\n${body}\nJSON`;
	}

	function macOsFileRemoveCommand(): string {
		return `sudo rm -f -- "${macOsManagedSettingsPath}"`;
	}

	function linuxFileRemoveCommand(): string {
		return `sudo rm -f -- ${linuxManagedSettingsPath}`;
	}

	function windowsFileDeployCommand(body: string): string {
		// A PowerShell here-string keeps the JSON literal; WriteAllText writes
		// UTF-8 without a BOM on both Windows PowerShell 5.1 and PowerShell 7.
		return [
			'$dir = Join-Path $env:ProgramFiles \'GitHubCopilot\'',
			'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
			'$json = @\'',
			body,
			'\'@',
			'[System.IO.File]::WriteAllText((Join-Path $dir \'managed-settings.json\'), $json)'
		].join('\n');
	}

	function windowsFileRemoveCommand(): string {
		return '$path = Join-Path $env:ProgramFiles \'GitHubCopilot\\managed-settings.json\'; Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue';
	}

	function currentManagedSettingsBody(): string | null {
		const raw = editor.value.trim();
		if (raw === '') {
			return '{}';
		}
		try {
			return JSON.stringify(JSON.parse(raw), null, '\t');
		} catch {
			return null;
		}
	}

	function renderFileDeploy(): void {
		// File-based deployment only maps to the managed-settings.json document.
		const applies = activeEndpoint()?.id === 'managedSettings';
		$('file-deploy-section').hidden = !applies;
		$('troubleshooting-section').hidden = !applies;
		if (!applies) {
			return;
		}
		const body = currentManagedSettingsBody();
		const valid = body !== null;
		$('file-deploy-commands').hidden = !valid;
		$('file-deploy-hint').hidden = valid;
		if (!valid) {
			return;
		}
		$('macos-file-command').textContent = macOsFileDeployCommand(body);
		$('windows-file-command').textContent = windowsFileDeployCommand(body);
		$('linux-file-command').textContent = linuxFileDeployCommand(body);
		$('macos-file-remove-command').textContent = macOsFileRemoveCommand();
		$('windows-file-remove-command').textContent = windowsFileRemoveCommand();
		$('linux-file-remove-command').textContent = linuxFileRemoveCommand();
	}

	function setStatus(message: string, kind?: string): void {
		editorStatus.textContent = message;
		editorStatus.dataset.kind = kind || '';
	}

	function notifyEditorChanged(): void {
		editor.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function formatEditor(): void {
		const raw = editor.value.trim();
		try {
			editor.value = JSON.stringify(raw === '' ? {} : JSON.parse(raw), null, '\t');
			notifyEditorChanged();
			setStatus('Formatted JSON.', 'ok');
		} catch (error) {
			setStatus(`Cannot format invalid JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
		}
	}

	function indentEditorSelection(outdent: boolean): void {
		const value = editor.value;
		const selectionStart = editor.selectionStart;
		const selectionEnd = editor.selectionEnd;
		if (!outdent && selectionStart === selectionEnd) {
			editor.setRangeText('\t', selectionStart, selectionEnd, 'end');
			notifyEditorChanged();
			return;
		}

		const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
		const selectionLastCharacter = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
			? selectionEnd - 1
			: selectionEnd;
		const nextLineBreak = value.indexOf('\n', selectionLastCharacter);
		const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
		const block = value.slice(blockStart, blockEnd);
		const updated = block.split('\n').map(line => {
			if (!outdent) {
				return `\t${line}`;
			}
			return line.startsWith('\t') ? line.slice(1) : line.replace(/^ {1,4}/, '');
		}).join('\n');
		editor.setRangeText(updated, blockStart, blockEnd, 'select');
		notifyEditorChanged();
	}

	function insertEditorNewLine(): void {
		const value = editor.value;
		const selectionStart = editor.selectionStart;
		const selectionEnd = editor.selectionEnd;
		const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
		const indentation = /^\s*/.exec(value.slice(lineStart, selectionStart))?.[0] ?? '';
		const before = value.slice(lineStart, selectionStart).trimEnd();
		const after = value.slice(selectionEnd).split('\n', 1)[0].trimStart();
		const opensObject = before.endsWith('{') && after.startsWith('}');
		const opensArray = before.endsWith('[') && after.startsWith(']');
		const opensBlock = before.endsWith('{') || before.endsWith('[');
		const innerIndentation = opensBlock ? `${indentation}\t` : indentation;

		if (opensObject || opensArray) {
			const replacement = `\n${innerIndentation}\n${indentation}`;
			editor.setRangeText(replacement, selectionStart, selectionEnd, 'end');
			editor.selectionStart = editor.selectionEnd = selectionStart + innerIndentation.length + 1;
		} else {
			editor.setRangeText(`\n${innerIndentation}`, selectionStart, selectionEnd, 'end');
		}
		notifyEditorChanged();
	}

	function handleEditorKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			allowNextTabToMoveFocus = true;
			setStatus('Press Tab to move focus out of the editor.');
			return;
		}
		if (event.key === 'Tab') {
			if (allowNextTabToMoveFocus) {
				allowNextTabToMoveFocus = false;
				return;
			}
			event.preventDefault();
			indentEditorSelection(event.shiftKey);
			return;
		}
		allowNextTabToMoveFocus = false;
		if (event.key === 'Enter') {
			event.preventDefault();
			insertEditorNewLine();
			return;
		}
		if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
			event.preventDefault();
			formatEditor();
		}
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
			const tooltipId = `${endpoint.id}-toggle-tooltip`;
			checkbox.setAttribute('aria-describedby', tooltipId);
			checkbox.addEventListener('change', () => {
				void setEndpointActive(endpoint, checkbox.checked);
			});
			const track = document.createElement('span');
			track.className = 'tab-toggle-track';
			track.setAttribute('aria-hidden', 'true');
			const tooltip = document.createElement('span');
			tooltip.id = tooltipId;
			tooltip.className = 'tab-toggle-tooltip';
			tooltip.role = 'tooltip';
			tooltip.textContent = `On: this server returns the ${endpoint.label} response JSON configured below, or the selected failure behavior. Off: requests pass through to ${proxyUpstream || 'the configured upstream'}.`;
			toggle.append(checkbox, track, tooltip);

			item.append(tab, toggle);
			tabs.appendChild(item);
		}
	}

	function selectEndpoint(id: string): void {
		// Stash the current draft before switching.
		if (activeId) {
			drafts[activeId] = editor.value;
			persistDraft(activeId, editor.value);
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
		responseModeSelect.value = endpoint.mode ?? 'json';
		updateResponseConfigurationVisibility();
		parseResponseStatus();
		const serverText = JSON.stringify(endpoint.body ?? {}, null, '\t');
		const hasMemoryDraft = Object.prototype.hasOwnProperty.call(drafts, id);
		const persistedDraft = hasMemoryDraft ? undefined : readPersistedDraft(id);
		const synchronizedDraft = hasMemoryDraft ? undefined : readSynchronizedDraft(id);
		const synchronizedWithThisServer = synchronizedDraft?.stateFile === serverStateFile;
		const shouldRecoverPersistedDraft = persistedDraft !== undefined && (
			(synchronizedWithThisServer && (!serverHasPersistedState || persistedDraft !== synchronizedDraft.value))
			|| (synchronizedDraft === undefined && !serverHasPersistedState)
		);
		const shouldRecoverDraft = hasMemoryDraft ? dirtyDrafts.has(id) : shouldRecoverPersistedDraft;
		const recoverableDraft = hasMemoryDraft ? drafts[id] : persistedDraft;
		editor.value = shouldRecoverDraft && recoverableDraft !== undefined ? recoverableDraft : serverText;
		drafts[id] = editor.value;
		persistDraft(id, editor.value);
		if (shouldRecoverDraft) {
			dirtyDrafts.add(id);
		} else {
			dirtyDrafts.delete(id);
			persistSynchronizedDraft(id, serverText);
		}
		renderTabs();
		renderPresets();
		renderProxy();
		// Show the schema section only for schema-backed endpoints.
		$('schema-section').hidden = endpoint.schema !== true;
		$('validation-results').hidden = true;
		parseEditor();
		renderFileDeploy();
		renderSaveState();
		if (shouldRecoverDraft) {
			debouncedSave();
		}
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
		dirtyDrafts.add(activeId);
		persistDraft(activeId, editor.value);
		parseEditor();
		renderFileDeploy();
		clearPendingSave(activeId);
		void save();
	}

	function updateResponseConfigurationVisibility(): void {
		responseConfiguration.hidden = responseModeSelect.value !== 'json';
	}

	async function setResponseMode(endpoint: Endpoint, mode: EndpointResponseMode): Promise<void> {
		const previousMode = endpoint.mode ?? 'json';
		endpoint.mode = mode;
		updateResponseConfigurationVisibility();
		const snapshot = captureSaveSnapshot();
		clearPendingSave(endpoint.id);
		if (snapshot) {
			if (!await saveSnapshot(snapshot)) {
				endpoint.mode = previousMode;
				responseModeSelect.value = previousMode;
				updateResponseConfigurationVisibility();
			}
			return;
		}
		try {
			applyState(await updateState({ endpoint: endpoint.id, mode }));
		} catch (error) {
			endpoint.mode = previousMode;
			responseModeSelect.value = previousMode;
			updateResponseConfigurationVisibility();
			toast(`Save failed: ${error instanceof Error ? error.message : String(error)}`, true);
		}
	}

	function renderProxy(): void {
		const endpoint = endpoints.find(candidate => candidate.id === 'managedSettings') ?? endpoints[0];
		$('map-from').textContent = endpoint && proxyUpstream ? `${proxyUpstream}${endpoint.path}` : '';
		$('map-to').textContent = endpoint && proxyBaseUrl ? `${proxyBaseUrl}${endpoint.path}` : '';
		$('setup-probe-shape').textContent = endpoint && proxyUpstream
			? `GET ${proxyUpstream}${endpoint.path}?mockPolicySetupProbe=<random UUID>`
			: '';
	}

	function selectSetupMethod(method: SetupMethod): void {
		for (const candidate of ['proxy', 'file'] as const) {
			const selected = candidate === method;
			const panel = $(`${candidate}-method`);
			panel.dataset.selected = String(selected);
			panel.hidden = !selected;
			panel.toggleAttribute('inert', !selected);
			const content = $(`${candidate}-method-content`);
			content.hidden = !selected;
			content.toggleAttribute('inert', !selected);
			const input = $(`setup-method-${candidate}`) as HTMLInputElement;
			input.checked = selected;
			input.setAttribute('aria-expanded', String(selected));
			$(`setup-method-${candidate}-option`).dataset.selected = String(selected);
		}
	}

	function updateReadiness(): void {
		const globalStatus = $('global-connection-status');
		globalStatus.dataset.state = proxyVerified ? 'ready' : proxyCheckInFlight ? 'checking' : 'error';
		$('global-connection-label').textContent = proxyVerified
			? 'System proxy connected'
			: proxyCheckInFlight ? 'Checking connection\u2026' : 'No connection detected';
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
		serverStateFile = state.stateFile ?? '';
		serverHasPersistedState = state.hasPersistedState !== false;
		renderProxy();
		renderTabs();
		lastServerSignature = stateSignature(state);
	}

	async function restoreBrowserDrafts(state: ServerState, allowLegacyDrafts = false): Promise<ServerState> {
		if (state.hasPersistedState !== false) {
			return state;
		}
		const updates: Array<{ endpoint: string; body: unknown }> = [];
		const synchronizedUpdates = new Set<string>();
		for (const endpoint of state.endpoints) {
			const persistedDraft = readPersistedDraft(endpoint.id);
			if (persistedDraft === undefined) {
				continue;
			}
			const synchronizedDraft = readSynchronizedDraft(endpoint.id);
			const synchronizedWithThisServer = synchronizedDraft?.stateFile === (state.stateFile ?? '');
			if (synchronizedDraft !== undefined && !synchronizedWithThisServer) {
				delete drafts[endpoint.id];
				dirtyDrafts.delete(endpoint.id);
				continue;
			}
			if (synchronizedDraft === undefined && !allowLegacyDrafts) {
				delete drafts[endpoint.id];
				dirtyDrafts.delete(endpoint.id);
				continue;
			}
			drafts[endpoint.id] = persistedDraft;
			try {
				updates.push({ endpoint: endpoint.id, body: JSON.parse(persistedDraft) });
				synchronizedUpdates.add(endpoint.id);
			} catch {
				dirtyDrafts.add(endpoint.id);
				if (synchronizedWithThisServer) {
					try {
						updates.push({ endpoint: endpoint.id, body: JSON.parse(synchronizedDraft.value) });
					} catch (error) {
						console.warn(`Ignoring invalid synchronized browser state for ${endpoint.id}.`, error);
					}
				} else {
					persistSynchronizedDraft(endpoint.id, JSON.stringify(endpoint.body ?? {}, null, '\t'), state.stateFile ?? '');
				}
			}
		}
		if (updates.length === 0) {
			return state;
		}
		const restoredState = await updateState({ endpoints: updates });
		for (const update of updates) {
			if (synchronizedUpdates.has(update.endpoint)) {
				persistSynchronizedDraft(update.endpoint, drafts[update.endpoint], state.stateFile ?? '');
				dirtyDrafts.delete(update.endpoint);
			}
		}
		return restoredState;
	}

	/**
	 * Canonical fingerprint of the mutable server state. Compared against
	 * `lastServerSignature` so the background poll only reacts to changes it did
	 * not originate.
	 */
	function stateSignature(state: ServerState): string {
		const endpoints = (state.endpoints ?? []).map(e => ({
			id: e.id, status: e.status, mode: e.mode, active: e.active, body: e.body
		}));
		return JSON.stringify({ stateFile: state.stateFile ?? '', endpoints });
	}

	function isInteractingWithEditor(): boolean {
		const el = document.activeElement;
		return el === editor || el === responseStatusInput || el === responseModeSelect || el === presetSelect;
	}

	function discardDraftsFromOtherStateFile(state: ServerState): void {
		const stateFile = state.stateFile ?? '';
		for (const endpoint of state.endpoints) {
			if (readSynchronizedDraft(endpoint.id)?.stateFile !== stateFile) {
				delete drafts[endpoint.id];
				dirtyDrafts.delete(endpoint.id);
			}
		}
	}

	/**
	 * Poll the server state and reconcile the UI when it changed underneath us —
	 * e.g. the control API or another tab edited a response body. Same-server
	 * changes wait for editing and writes to settle, while a different state-file
	 * namespace is applied immediately so an old draft cannot cross into it.
	 */
	async function refreshState(): Promise<void> {
		if (stateWritesInFlight > 0 || pendingSaves.size > 0) {
			return;
		}
		let state: ServerState;
		try {
			state = await api<ServerState>('/api/state');
		} catch {
			return; // the next poll will retry
		}
		// Re-check after the await: a save may have started meanwhile.
		if (stateWritesInFlight > 0 || pendingSaves.size > 0) {
			return;
		}
		const stateFileChanged = serverStateFile !== '' && (state.stateFile ?? '') !== serverStateFile;
		if (isInteractingWithEditor() && !stateFileChanged) {
			return;
		}
		if (stateFileChanged) {
			discardDraftsFromOtherStateFile(state);
		}
		if (state.hasPersistedState === false) {
			try {
				state = await restoreBrowserDrafts(state);
			} catch (e) {
				toast(`Failed to restore browser drafts: ${e instanceof Error ? e.message : String(e)}`, true);
				return;
			}
		}
		if (stateSignature(state) === lastServerSignature) {
			return;
		}
		applyExternalState(state);
	}

	function applyExternalState(state: ServerState): void {
		// Keep local drafts that have not reached the server yet.
		applyState(state);
		for (const endpoint of endpoints) {
			if (!dirtyDrafts.has(endpoint.id)) {
				drafts[endpoint.id] = JSON.stringify(endpoint.body ?? {}, null, '\t');
				persistDraft(endpoint.id, drafts[endpoint.id]);
				persistSynchronizedDraft(endpoint.id, drafts[endpoint.id]);
			}
		}
		const endpoint = activeEndpoint();
		if (!endpoint) {
			return;
		}
		editor.value = drafts[activeId] ?? '{}';
		responseStatusInput.value = String(endpoint.status ?? 200);
		responseModeSelect.value = endpoint.mode ?? 'json';
		updateResponseConfigurationVisibility();
		parseResponseStatus();
		parseEditor();
		renderFileDeploy();
		renderSaveState();
	}

	function updateState(payload: Record<string, unknown>): Promise<ServerState> {
		stateWritesInFlight++;
		const request = stateUpdateQueue.then(() => api<ServerState>('/api/state', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}));
		stateUpdateQueue = request.then(() => undefined, () => undefined);
		// Clear the in-flight marker once settled; callers handle errors on `request`.
		void request.then(() => { stateWritesInFlight--; }, () => { stateWritesInFlight--; });
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
			mode: endpoint.mode ?? 'json',
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
				mode: snapshot.mode,
				active: snapshot.active
			});
			applyState(state);
			const currentDraft = drafts[snapshot.endpoint];
			if (currentDraft === undefined || currentDraft === snapshot.editorText) {
				drafts[snapshot.endpoint] = snapshot.editorText;
				persistDraft(snapshot.endpoint, snapshot.editorText);
				persistSynchronizedDraft(snapshot.endpoint, snapshot.editorText);
				dirtyDrafts.delete(snapshot.endpoint);
			}
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

	async function loadSchema(source?: string): Promise<void> {
		const badgeEl = $('schema-badge');
		const statusEl = $('schema-source-status');
		badgeEl.textContent = 'Loading\u2026';
		delete badgeEl.dataset.kind;
		loadSchemaButton.disabled = true;
		statusEl.textContent = '';
		statusEl.dataset.kind = '';

		try {
			const result = await api<SchemaResult>('/api/schema', source === undefined ? undefined : {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source })
			});
			schemaSourceInput.value = result.source || result.resolved || source || '';
			if (result.ok) {
				schema = result.schema ?? null;
				badgeEl.textContent = 'Loaded \u2713';
				badgeEl.dataset.kind = 'ok';
				badgeEl.dataset.tooltip = result.resolved || 'Schema loaded';
				statusEl.textContent = source === undefined ? '' : 'Schema loaded.';
				statusEl.dataset.kind = source === undefined ? '' : 'ok';
			} else {
				schema = null;
				badgeEl.textContent = 'Not loaded';
				badgeEl.dataset.kind = 'error';
				badgeEl.dataset.tooltip = result.error || 'Schema unavailable';
				statusEl.textContent = result.error || 'Schema unavailable.';
				statusEl.dataset.kind = 'error';
			}
		} catch (e) {
			schema = null;
			badgeEl.textContent = 'Not loaded';
			badgeEl.dataset.kind = 'error';
			badgeEl.dataset.tooltip = e instanceof Error ? e.message : String(e);
			statusEl.textContent = badgeEl.dataset.tooltip;
			statusEl.dataset.kind = 'error';
		} finally {
			loadSchemaButton.disabled = false;
		}
		parseEditor();
	}

	function renderValidationResults(parsed: Record<string, unknown>): void {
		const container = $('validation-results');
		const rows = schema ? validationRows(schema, parsed) : [];
		const wasOpen = (container.querySelector('.validation-details') as HTMLDetailsElement | null)?.open ?? readExpandedState('schema-keys');

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
		const summary = document.createElement('span');
		summary.textContent = `${presentCount} of ${schemaRows.length} schema keys set`
			+ (unknownCount ? `, ${unknownCount} unknown` : '');
		if (unknownCount) {
			summary.classList.add('validation-warn');
		}

		const details = document.createElement('details');
		details.className = 'validation-details';
		details.open = wasOpen;
		details.addEventListener('toggle', () => persistExpandedState('schema-keys', details.open));
		const detailsSummary = document.createElement('summary');
		const chevron = document.createElement('span');
		chevron.className = 'validation-details-chevron';
		chevron.setAttribute('aria-hidden', 'true');
		chevron.textContent = '\u25B6';
		detailsSummary.append(chevron, 'Schema keys');
		summary.classList.add('validation-details-summary');
		detailsSummary.appendChild(summary);
		details.append(detailsSummary, tableContainer);

		container.replaceChildren(details);
		container.hidden = false;
		setStatus(unknownCount ? `${unknownCount} key${unknownCount > 1 ? 's' : ''} not in schema.` : '', unknownCount ? 'warn' : '');
	}

	function toggleSchemaSection(): void {
		setSchemaSectionState(Boolean($('schema-details').hidden));
	}

	function openFileDeploy(): void {
		// Jump from the Setup dialog to the live per-platform commands, which
		// only exist for the Managed Settings endpoint on the Policies page.
		if (activeId !== 'managedSettings' && endpoints.some(e => e.id === 'managedSettings')) {
			selectEndpoint('managedSettings');
		}
		setupDialog.close();
		$('file-deploy-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
		const displayedEntries = entries.slice(0, 40);
		const signature = JSON.stringify(displayedEntries);
		if (signature === renderedLogSignature) {
			return;
		}
		renderedLogSignature = signature;
		const focusedEntryKey = document.activeElement instanceof HTMLButtonElement && document.activeElement.classList.contains('log-item')
			? document.activeElement.dataset.entryKey
			: undefined;
		let rowToRefocus: HTMLButtonElement | undefined;
		list.replaceChildren();
		for (const entry of displayedEntries) {
			const item = document.createElement('li');
			item.className = 'log-row';
			const endpoint = endpoints.find(candidate => candidate.path === entry.path);
			const entryKey = `${entry.at}:${entry.method}:${entry.path}`;
			const outcomeLabel = entry.outcome === 'mocked'
				? 'Served from this server'
				: entry.outcome === 'passthrough' ? 'Proxied to the real API' : 'Upstream request failed';
			let row: HTMLButtonElement | HTMLDivElement;
			if (endpoint) {
				row = document.createElement('button');
				row.type = 'button';
				row.classList.add('clickable');
				row.setAttribute('aria-label', `Open ${endpoint.label}: ${entry.method} ${entry.path}, status ${entry.status}. ${outcomeLabel}`);
				row.addEventListener('click', () => selectEndpoint(endpoint.id));
				if (focusedEntryKey === entryKey) {
					rowToRefocus = row;
				}
			} else {
				row = document.createElement('div');
			}
			row.classList.add('log-item', entry.outcome);
			row.dataset.entryKey = entryKey;
			row.title = endpoint ? `Open ${endpoint.label}. ${outcomeLabel}` : outcomeLabel;

			const time = document.createElement('span');
			time.className = 'log-time';
			time.textContent = new Date(entry.at).toLocaleTimeString();
			const status = document.createElement('span');
			status.className = 'log-status';
			status.textContent = String(entry.status);
			const route = document.createElement('span');
			route.className = 'log-path';
			route.textContent = `${entry.method} ${entry.path}`;

			row.append(time, status, route);
			if (!endpoint) {
				const outcome = document.createElement('span');
				outcome.className = 'sr-only';
				outcome.textContent = `. ${outcomeLabel}`;
				row.appendChild(outcome);
			}
			item.appendChild(row);
			list.appendChild(item);
		}
		rowToRefocus?.focus();
	}

	async function copy(text: string, button: HTMLElement): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			const original = button.textContent;
			button.textContent = 'Copied \u2713';
			toast('Copied to clipboard');
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
		$('proxy-settings').textContent = vscodeProxySetting;
		$('macos-cache-command').textContent = macOsCacheClearCommand;
		$('windows-cache-command').textContent = windowsCacheClearCommand;
		restoreTheme();
		restoreDisclosureState();
		$('theme-toggle').addEventListener('click', toggleTheme);
		matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
			if (followsSystemTheme) {
				applyTheme(event.matches ? 'light' : 'dark');
			}
		});

		editor.addEventListener('input', () => {
			drafts[activeId] = editor.value;
			dirtyDrafts.add(activeId);
			persistDraft(activeId, editor.value);
			parseEditor();
			renderFileDeploy();
			debouncedSave();
		});
		editor.addEventListener('keydown', handleEditorKeyDown);
		editor.addEventListener('blur', () => allowNextTabToMoveFocus = false);
		$('format-editor').addEventListener('click', formatEditor);
		responseStatusInput.addEventListener('input', () => {
			// Re-run validation on status change too: schema warnings only apply
			// to 2xx bodies, so the status decides whether they are shown.
			parseEditor();
			debouncedSave();
		});
		responseModeSelect.addEventListener('change', () => {
			const endpoint = activeEndpoint();
			if (!endpoint) {
				return;
			}
			void setResponseMode(endpoint, responseModeSelect.value as EndpointResponseMode);
		});
		presetSelect.addEventListener('change', applyPreset);
		$('copy-map').addEventListener('click', e => {
			copy(`${$('map-from').textContent}\n${$('map-to').textContent}`, e.currentTarget as HTMLElement);
		});
		$('copy-proxy-settings').addEventListener('click', e => {
			copy(vscodeProxySetting, e.currentTarget as HTMLElement);
		});
		$('copy-macos-cache-command').addEventListener('click', e => {
			copy(macOsCacheClearCommand, e.currentTarget as HTMLElement);
		});
		$('copy-windows-cache-command').addEventListener('click', e => {
			copy(windowsCacheClearCommand, e.currentTarget as HTMLElement);
		});
		$('copy-macos-file-command').addEventListener('click', e => {
			copy($('macos-file-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('copy-windows-file-command').addEventListener('click', e => {
			copy($('windows-file-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('copy-linux-file-command').addEventListener('click', e => {
			copy($('linux-file-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('copy-macos-file-remove-command').addEventListener('click', e => {
			copy($('macos-file-remove-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('copy-windows-file-remove-command').addEventListener('click', e => {
			copy($('windows-file-remove-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('copy-linux-file-remove-command').addEventListener('click', e => {
			copy($('linux-file-remove-command').textContent ?? '', e.currentTarget as HTMLElement);
		});
		$('file-deploy-goto').addEventListener('click', openFileDeploy);
		for (const method of ['proxy', 'file'] as const) {
			$(`setup-method-${method}`).addEventListener('change', () => selectSetupMethod(method));
		}
		$('setup-nav').addEventListener('click', openSetupDialog);
		$('close-setup').addEventListener('click', () => setupDialog.close());
		setupDialog.addEventListener('close', () => {
			$('setup-nav').setAttribute('aria-expanded', 'false');
			if (location.hash === '#setup') {
				history.replaceState(null, '', '#policies');
			}
		});
		window.addEventListener('hashchange', syncSetupDialog);
		$('schema-toggle').addEventListener('click', toggleSchemaSection);
		$('schema-source-form').addEventListener('submit', event => {
			event.preventDefault();
			void loadSchema(schemaSourceInput.value);
		});
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
			dirtyDrafts.add(activeId);
			persistDraft(activeId, editor.value);
			parseEditor();
			renderFileDeploy();
			void save();
			setStatus('Filled all response fields from the schema.', 'ok');
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
				void save();
			}
		});

		try {
			let state = await api<ServerState>('/api/state');
			state = await restoreBrowserDrafts(state, true);
			selectSetupMethod('proxy');
			applyState(state);
			if (endpoints.length) {
				selectEndpoint(endpoints[0].id);
			}
			syncSetupDialog();
		} catch (e) {
			selectSetupMethod('proxy');
			// Fall back to the shared endpoint definitions so the GUI still shows
			// what exists (read-only) rather than rendering a blank page.
			endpoints = MOCK_POLICY_ENDPOINTS.map(def => ({ ...def, status: def.presets[0]?.status ?? 200, body: def.presets[0]?.body ?? {}, mode: 'json' }));
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
		setInterval(() => { void refreshState(); }, 2000);
		setInterval(() => { void checkProxy(); }, 5000);
	}

	void init();
})();
