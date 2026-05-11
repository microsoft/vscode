/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import express, { type Response } from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defaultState, monthEndIso } from './defaults.js';
import { applyPreset, presetSummaries } from './presets.js';
import type { AppState, IEntitlementsResponse, IQuotaSnapshotData, QuotaId } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

let state: AppState = defaultState();

/** How many credits to deduct per simulated chat request, configurable via the UI. */
let decrementAmount = 10;

/** Connected SSE clients — notified when state changes. */
const sseClients = new Set<Response>();

function notifyClients(): void {
	for (const client of sseClients) {
		client.write(`data: ${JSON.stringify({ type: 'state-changed' })}\n\n`);
	}
}

function buildEntitlements(s: AppState): IEntitlementsResponse {
	const plan = s.plans[s.activePlan];
	const isEnterprise = ['business', 'enterprise'].includes(plan.copilot_plan);
	const endpointBase = isEnterprise ? 'enterprise' : 'individual';

	const base: IEntitlementsResponse = {
		login: 'quota-tester-user',
		access_type_sku: plan.access_type_sku,
		analytics_tracking_id: 'quota-tester-tracking-id',
		assigned_date: new Date().toISOString(),
		can_signup_for_limited: false,
		chat_enabled: plan.chat_enabled,
		copilotignore_enabled: isEnterprise,
		copilot_plan: plan.copilot_plan,
		is_mcp_enabled: true,
		organization_login_list: isEnterprise ? ['test-org'] : [],
		organization_list: isEnterprise ? [{ login: 'test-org', name: 'Test Organization' }] : [],
		restricted_telemetry: true,
		endpoints: {
			api: `https://api.${endpointBase}.githubcopilot.com`,
			'origin-tracker': `https://origin-tracker.${endpointBase}.githubcopilot.com`,
			proxy: `https://proxy.${endpointBase}.githubcopilot.com`,
			telemetry: `https://telemetry.${endpointBase}.githubcopilot.com`,
		},
	};

	if (plan.codex_agent_enabled) {
		base.codex_agent_enabled = true;
	}

	// Build quota_snapshots from the plan's included ids only.
	const snapshots: IEntitlementsResponse['quota_snapshots'] = {};
	for (const id of plan.includeSnapshots) {
		const snap = plan.snapshots[id];
		if (snap) {
			snapshots[id] = { ...snap, quota_id: id, timestamp_utc: new Date().toISOString() };
		}
	}
	if (Object.keys(snapshots).length > 0) {
		base.quota_snapshots = snapshots;
	}

	// Top-level token_based_billing flag when any snapshot uses TBB
	const hasTbb = Object.values(snapshots).some(s => s?.token_based_billing);
	if (hasTbb) {
		base.token_based_billing = true;
	}

	// Free PRU: limited_user_quotas instead of quota_snapshots
	if (plan.limited_user_quotas && plan.includeSnapshots.length === 0) {
		base.limited_user_quotas = plan.limited_user_quotas;
		base.monthly_quotas = plan.monthly_quotas;
		base.limited_user_subscribed_day = new Date().getUTCDate();
		const resetDate = new Date();
		resetDate.setUTCMonth(resetDate.getUTCMonth() + 1);
		base.limited_user_reset_date = resetDate.toISOString().slice(0, 10);
	}

	// Paid plans with snapshots: quota_reset_date
	if (plan.includeSnapshots.length > 0 && plan.planId !== 'free') {
		base.quota_reset_date = monthEndIso().slice(0, 10);
		base.quota_reset_date_utc = monthEndIso();
	}

	return base;
}

/**
 * Determines which quota snapshot to decrement for the active plan.
 * Free users: decrement 'chat'. Paid users: decrement 'premium_interactions'.
 */
function getPrimaryQuotaId(s: AppState): QuotaId {
	const plan = s.plans[s.activePlan];
	if (plan.access_type_sku === 'free_limited_copilot') {
		return 'chat';
	}
	return 'premium_interactions';
}

/**
 * Decrement the primary quota snapshot by `amount` credits.
 * Returns { exhausted, snapshot } where exhausted is true if the quota just ran out.
 */
function decrementQuota(s: AppState, amount: number): { exhausted: boolean; quotaId: QuotaId; snapshot: IQuotaSnapshotData | undefined } {
	const plan = s.plans[s.activePlan];
	const quotaId = getPrimaryQuotaId(s);
	const snap = plan.snapshots[quotaId];

	if (!snap) {
		return { exhausted: false, quotaId, snapshot: undefined };
	}

	// For unlimited plans, nothing to decrement
	if (snap.unlimited) {
		return { exhausted: false, quotaId, snapshot: snap };
	}

	const entitlement = snap.entitlement ?? 0;

	// If already at 0 and no overage permitted, already exhausted
	if (snap.percent_remaining <= 0 && !snap.overage_permitted) {
		return { exhausted: true, quotaId, snapshot: snap };
	}

	// Decrement remaining
	const oldRemaining = snap.remaining ?? 0;
	const newRemaining = Math.max(0, oldRemaining - amount);
	snap.remaining = newRemaining;
	snap.quota_remaining = newRemaining;

	// Recalculate percent_remaining
	if (entitlement > 0) {
		snap.percent_remaining = Math.min(100, Math.max(0, (newRemaining / entitlement) * 100));
	} else {
		snap.percent_remaining = newRemaining > 0 ? 100 : 0;
	}

	snap.has_quota = snap.percent_remaining > 0;

	// Track overage
	if (newRemaining <= 0 && snap.overage_permitted) {
		snap.overage_count = (snap.overage_count ?? 0) + Math.max(0, amount - oldRemaining);
	}

	const exhausted = snap.percent_remaining <= 0 && !snap.overage_permitted;
	return { exhausted, quotaId, snapshot: snap };
}

/**
 * Decrement PRU (legacy free) quotas.
 */
function decrementPruQuota(s: AppState): { exhausted: boolean } {
	const plan = s.plans[s.activePlan];
	if (!plan.limited_user_quotas || !plan.monthly_quotas) {
		return { exhausted: false };
	}

	plan.limited_user_quotas.chat = Math.max(0, plan.limited_user_quotas.chat - 1);

	const exhausted = plan.limited_user_quotas.chat <= 0;
	return { exhausted };
}

const app = express();
app.use((_req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
	res.header('Access-Control-Allow-Headers', '*');
	if (_req.method === 'OPTIONS') {
		res.sendStatus(204);
		return;
	}
	next();
});
app.use(express.json({ limit: '1mb' }));

// ---- Public UI ----
app.use('/', express.static(path.join(__dirname, '..', '..', 'public')));

// ---- Tester control API ----
app.get('/api/state', (_req, res) => {
	res.json(state);
});

app.put('/api/state', (req, res) => {
	// Trust the client shape. This is a local developer tool.
	state = req.body as AppState;
	notifyClients();
	res.json({ ok: true });
});

app.post('/api/reset', (_req, res) => {
	state = defaultState();
	notifyClients();
	res.json(state);
});

app.get('/api/preview/entitlements', (_req, res) => {
	res.json(buildEntitlements(state));
});

app.get('/api/presets', (_req, res) => {
	res.json(presetSummaries());
});

app.post('/api/presets/:id', (req, res) => {
	const next = applyPreset(req.params.id);
	if (!next) {
		res.status(404).json({ error: `Unknown preset '${req.params.id}'` });
		return;
	}
	state = next;
	notifyClients();
	res.json(state);
});

// ---- Decrement configuration ----
app.get('/api/decrement-config', (_req, res) => {
	res.json({ amount: decrementAmount });
});

app.put('/api/decrement-config', (req, res) => {
	const amount = Number(req.body?.amount);
	if (!isFinite(amount) || amount < 0) {
		res.status(400).json({ error: 'amount must be a non-negative number' });
		return;
	}
	decrementAmount = amount;
	res.json({ amount: decrementAmount });
});

// ---- Decrement endpoint ----
// POST /api/decrement
//   Simulates a chat request consuming quota. Decrements the primary quota
//   by `decrementAmount` credits and returns the updated entitlements.
//   If quota is exhausted and overage is not permitted, returns a 403 with
//   a quota_exceeded error matching what CAPI returns.
app.post('/api/decrement', (req, res) => {
	const plan = state.plans[state.activePlan];
	const amount = Number(req.body?.amount ?? decrementAmount);
	const isPru = plan.includeSnapshots.length === 0 && plan.limited_user_quotas !== undefined;

	let exhausted: boolean;
	if (isPru) {
		({ exhausted } = decrementPruQuota(state));
	} else {
		({ exhausted } = decrementQuota(state, amount));
	}

	if (exhausted) {
		// Return a quota_exceeded error matching the CAPI error shape.
		// The copilot extension checks for these codes in _handleWebSocketError
		// and _handleCAPIError. The specific code determines the error type.
		const isFree = plan.access_type_sku === 'free_limited_copilot';
		const code = isFree ? 'free_quota_exceeded' : 'quota_exceeded';
		const message = isFree
			? 'You have exceeded your free tier quota. Please upgrade to Copilot Pro.'
			: 'You have exceeded your included quota for this billing cycle.';

		res.status(403).json({
			error: {
				code,
				message,
			},
			// Also return the updated entitlements so the UI can still refresh
			entitlements: buildEntitlements(state),
		});
		return;
	}

	// Return updated entitlements (same shape as /copilot_internal/user)
	notifyClients();
	res.json(buildEntitlements(state));
});

// ---- SSE endpoint for live UI updates ----
app.get('/api/events', (_req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	});
	res.write('\n');
	sseClients.add(res);
	_req.on('close', () => sseClients.delete(res));
});

// ---- Mock GitHub endpoints consumed by VS Code ----
app.get('/copilot_internal/user', (_req, res) => {
	res.json(buildEntitlements(state));
});

app.listen(PORT, () => {
	console.log(`\n  Quota Tester running: http://localhost:${PORT}`);
	console.log('  Configure VS Code product.overrides.json -> defaultChatAgent:');
	console.log(`    "entitlementUrl": "http://localhost:${PORT}/copilot_internal/user"\n`);
	console.log(`  Decrement endpoint: POST http://localhost:${PORT}/api/decrement`);
	console.log(`  Decrement config:   GET/PUT http://localhost:${PORT}/api/decrement-config\n`);
});
