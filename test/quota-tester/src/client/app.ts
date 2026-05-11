/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppState, IQuotaSnapshotData, QuotaId } from '../types.js';

interface Preset {
	id: string;
	label: string;
	description: string;
	category: string;
}

const ALL_QUOTAS: QuotaId[] = ['chat', 'completions', 'premium_interactions'];

let state: AppState;
let presets: Preset[] = [];
/** id of the last applied preset, or null once the user modifies state. */
let activePresetId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let decrementAmount = 10;

async function loadAll() {
	const [stateRes, presetsRes, configRes] = await Promise.all([
		fetch('/api/state').then(r => r.json()),
		fetch('/api/presets').then(r => r.json()),
		fetch('/api/decrement-config').then(r => r.json()),
	]);
	state = stateRes;
	presets = presetsRes;
	decrementAmount = configRes.amount;
	render();
}

/** Debounced save to server, then refreshes preview. */
function scheduleSave() {
	if (activePresetId !== null) {
		activePresetId = null;
		renderPresets();
	}
	setStatus('saving', 'Saving…');
	clearTimeout(saveTimer);
	saveTimer = setTimeout(doSave, 200);
}

async function doSave() {
	try {
		await fetch('/api/state', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(state),
		});
		await updatePreview();
		setStatus('saved', 'Saved');
	} catch (err) {
		setStatus('error', 'Error');
		console.error(err);
	}
}

function setStatus(cls: string, text: string) {
	const el = document.getElementById('status');
	if (!el) { return; }
	el.className = 'status ' + cls;
	el.textContent = text;
	if (cls === 'saved') {
		setTimeout(() => {
			if (el.textContent === text) { el.textContent = ''; el.className = 'status'; }
		}, 1200);
	}
}

async function reset() {
	const res = await fetch('/api/reset', { method: 'POST' });
	state = await res.json();
	activePresetId = null;
	render();
	updatePreview();
	setStatus('saved', 'Reset');
}

async function applyPreset(id: string) {
	setStatus('saving', 'Applying…');
	const res = await fetch(`/api/presets/${encodeURIComponent(id)}`, { method: 'POST' });
	if (!res.ok) {
		setStatus('error', 'Failed');
		return;
	}
	state = await res.json();
	activePresetId = id;
	render();
	await updatePreview();
	setStatus('saved', 'Applied');
}

async function updatePreview() {
	const res = await fetch('/api/preview/entitlements');
	const json = await res.json();
	const el = document.getElementById('preview');
	if (el) { el.textContent = JSON.stringify(json, null, 2); }
}

async function doDecrement() {
	setStatus('saving', 'Decrementing…');
	const res = await fetch('/api/decrement', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ amount: decrementAmount }),
	});

	const json = await res.json();
	const resultEl = document.getElementById('decrement-result');

	if (res.status === 403) {
		// Quota exhausted
		if (resultEl) {
			resultEl.className = 'decrement-result exhausted';
			resultEl.textContent = `⛔ QUOTA EXCEEDED — ${json.error.code}: ${json.error.message}`;
		}
		// Still update state from the entitlements in the error response
		if (json.entitlements) {
			const el = document.getElementById('preview');
			if (el) { el.textContent = JSON.stringify(json.entitlements, null, 2); }
		}
	} else {
		if (resultEl) {
			resultEl.className = 'decrement-result ok';
			resultEl.textContent = `✓ Decremented by ${decrementAmount}`;
			setTimeout(() => { resultEl.textContent = ''; resultEl.className = 'decrement-result'; }, 2000);
		}
		const el = document.getElementById('preview');
		if (el) { el.textContent = JSON.stringify(json, null, 2); }
	}

	// Reload full state to sync the UI
	const stateRes = await fetch('/api/state');
	state = await stateRes.json();
	renderSnapshots();
	setStatus('saved', 'Done');
}

async function updateDecrementConfig() {
	const input = document.getElementById('decrement-amount') as HTMLInputElement;
	const amount = Number(input?.value ?? 10);
	if (!isFinite(amount) || amount < 0) { return; }
	decrementAmount = amount;
	await fetch('/api/decrement-config', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ amount }),
	});
}

function renderPresets() {
	const root = document.getElementById('presets');
	if (!root) { return; }
	root.innerHTML = '';
	const categories = new Map<string, Preset[]>();
	for (const p of presets) {
		if (!categories.has(p.category)) { categories.set(p.category, []); }
		categories.get(p.category)!.push(p);
	}
	for (const [cat, items] of categories) {
		const group = document.createElement('div');
		group.className = 'preset-group';
		const heading = document.createElement('h3');
		heading.textContent = cat;
		group.appendChild(heading);
		const btns = document.createElement('div');
		btns.className = 'preset-buttons';
		for (const p of items) {
			const btn = document.createElement('button');
			btn.textContent = p.label;
			btn.title = p.description;
			if (p.id === activePresetId) { btn.classList.add('active'); }
			btn.addEventListener('click', () => applyPreset(p.id));
			btns.appendChild(btn);
		}
		group.appendChild(btns);
		root.appendChild(group);
	}
}

function snapshotCard(id: QuotaId, snap: IQuotaSnapshotData | undefined, included: boolean) {
	const card = document.createElement('div');
	card.className = 'snapshot' + (included ? '' : ' disabled');

	const header = document.createElement('div');
	header.className = 'snapshot-header';
	const title = document.createElement('h3');
	title.textContent = id;
	header.appendChild(title);

	const toggleLabel = document.createElement('label');
	toggleLabel.className = 'checkbox';
	const toggle = document.createElement('input');
	toggle.type = 'checkbox';
	toggle.checked = included;
	toggle.onchange = () => {
		const plan = state.plans[state.activePlan];
		if (toggle.checked) {
			if (!plan.includeSnapshots.includes(id)) { plan.includeSnapshots.push(id); }
			if (!plan.snapshots[id]) {
				plan.snapshots[id] = { overage_count: 0, overage_permitted: false, percent_remaining: 100, unlimited: false, token_based_billing: true };
			}
		} else {
			plan.includeSnapshots = plan.includeSnapshots.filter(q => q !== id);
		}
		renderSnapshots();
		scheduleSave();
	};
	const toggleText = document.createElement('span');
	toggleText.textContent = 'included';
	toggleLabel.appendChild(toggle);
	toggleLabel.appendChild(toggleText);
	header.appendChild(toggleLabel);

	card.appendChild(header);

	if (!snap) { return card; }

	const fields = document.createElement('div');
	fields.className = 'fields';

	const addNumber = (key: keyof IQuotaSnapshotData, label: string, min: number, max: number, step: number) => {
		const l = document.createElement('label');
		l.textContent = label;
		const input = document.createElement('input');
		input.type = 'number';
		input.min = String(min);
		input.max = String(max);
		input.step = String(step);
		input.value = String(snap[key] ?? 0);
		input.oninput = () => {
			(snap[key] as number) = Number(input.value);
			if (key === 'percent_remaining') {
				snap.has_quota = Number(input.value) !== 0;
				const hasQuotaInput = fields.querySelector<HTMLInputElement>('input[type="checkbox"][data-key="has_quota"]');
				if (hasQuotaInput) { hasQuotaInput.checked = snap.has_quota; }
			}
			scheduleSave();
		};
		l.appendChild(input);
		fields.appendChild(l);
	};

	const addCheckbox = (key: keyof IQuotaSnapshotData, label: string) => {
		const l = document.createElement('label');
		l.className = 'checkbox';
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.checked = !!snap[key];
		input.dataset.key = key;
		input.onchange = () => {
			(snap[key] as boolean) = input.checked;
			scheduleSave();
		};
		const s = document.createElement('span');
		s.textContent = label;
		l.appendChild(input);
		l.appendChild(s);
		fields.appendChild(l);
	};

	addNumber('percent_remaining', 'percent_remaining (0-100)', 0, 100, 1);
	addNumber('overage_count', 'overage_count', 0, 1_000_000, 1);
	addCheckbox('overage_permitted', 'overage_permitted');
	addCheckbox('unlimited', 'unlimited');
	addCheckbox('token_based_billing', 'token_based_billing');
	addCheckbox('has_quota', 'has_quota');
	addNumber('remaining', 'remaining', 0, 1_000_000, 1);
	addNumber('entitlement', 'entitlement', 0, 1_000_000, 1);
	addNumber('quota_remaining', 'quota_remaining', 0, 1_000_000, 0.1);
	addNumber('quota_reset_at', 'quota_reset_at (unix sec)', 0, 9_999_999_999, 1);

	card.appendChild(fields);
	return card;
}

function renderSnapshots() {
	const root = document.getElementById('snapshots');
	if (!root) { return; }
	root.innerHTML = '';
	const plan = state.plans[state.activePlan];
	for (const id of ALL_QUOTAS) {
		const included = plan.includeSnapshots.includes(id);
		root.appendChild(snapshotCard(id, plan.snapshots[id], included));
	}
}

function renderDecrementConfig() {
	const input = document.getElementById('decrement-amount') as HTMLInputElement;
	if (input) {
		input.value = String(decrementAmount);
	}
}

function render() {
	renderPresets();
	renderSnapshots();
	renderDecrementConfig();
}

function copyToClipboard(preId: string, btnId: string) {
	const pre = document.getElementById(preId);
	const btn = document.getElementById(btnId);
	if (!pre || !btn) { return; }
	navigator.clipboard.writeText(pre.textContent ?? '').then(() => {
		btn.textContent = 'Copied!';
		btn.classList.add('copied');
		setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
	});
}

document.getElementById('copy-preview')?.addEventListener('click', () => copyToClipboard('preview', 'copy-preview'));
document.getElementById('reset')?.addEventListener('click', reset);
document.getElementById('decrement-btn')?.addEventListener('click', doDecrement);
document.getElementById('decrement-amount')?.addEventListener('change', updateDecrementConfig);

// Listen for server-sent events so the UI auto-refreshes when
// the copilot extension (or another client) calls /api/decrement.
const events = new EventSource('/api/events');
events.onmessage = async () => {
	const stateRes = await fetch('/api/state');
	state = await stateRes.json();
	renderSnapshots();
	await updatePreview();
};

loadAll();
