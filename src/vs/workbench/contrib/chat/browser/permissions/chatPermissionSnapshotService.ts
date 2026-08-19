/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { parsePermissionRuleText } from '../../common/permissions/chatPermissionRuleSyntax.js';
import {
	ChatPermissionEffect,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
	IChatPermissionCeiling,
	IChatPermissionProviderFailure,
	IChatPermissionRule,
} from '../../common/permissions/chatPermissions.js';
import { IChatPermissionSnapshotService } from '../../common/permissions/chatPermissionSnapshotService.js';

/**
 * Best-effort permission snapshot assembled from the surfaces the runtime exposes today.
 *
 * The runtime is the authority for the full effective permission state, but it currently offers no
 * read API for its resolved rule set — only the managed slice, via the managed-settings
 * diagnostics probe. This implementation therefore reports **only** the managed scope and states
 * plainly, through `resolvedScopes`, that the configured, location and session layers were not
 * consulted. It deliberately does not reconstruct those layers from VS Code settings: that would
 * make VS Code a second, divergent authority over decisions the runtime owns.
 *
 * When the runtime gains an effective-permissions projection, this class is the only thing that
 * changes.
 */
export class ChatPermissionSnapshotService extends Disposable implements IChatPermissionSnapshotService {
	declare readonly _serviceBrand: undefined;

	private readonly _snapshot = observableValue<ChatPermissionSnapshot>(this, { state: 'loading' });
	readonly snapshot: IObservable<ChatPermissionSnapshot> = this._snapshot;

	/** Guards against overlapping probes; a later refresh supersedes an in-flight one. */
	private _refreshGeneration = 0;

	constructor(
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			const enabled = this.agentHostEnablementService.enabled.read(reader);
			if (!enabled) {
				// Bump the generation so an in-flight probe cannot land after this and overwrite
				// the disabled state with a stale result.
				this._refreshGeneration++;
				this._snapshot.set({ state: 'unavailable', reason: ChatPermissionUnavailableReason.AgentHostDisabled }, undefined);
				return;
			}
			void this.refresh();
		}));
	}

	async refresh(): Promise<void> {
		if (!this.agentHostEnablementService.enabled.get()) {
			this._refreshGeneration++;
			this._snapshot.set({ state: 'unavailable', reason: ChatPermissionUnavailableReason.AgentHostDisabled }, undefined);
			return;
		}

		const generation = ++this._refreshGeneration;
		this._snapshot.set({ state: 'loading' }, undefined);

		let next: ChatPermissionSnapshot;
		try {
			const diagnostics = await this.agentHostService.getManagedSettingsDiagnostics();
			next = diagnostics.length === 0
				? { state: 'unavailable', reason: ChatPermissionUnavailableReason.NotSupported }
				: buildManagedSnapshot(diagnostics);
		} catch (error) {
			this.logService.warn(`[ChatPermissions] Failed to resolve managed permissions: ${getErrorMessage(error)}`);
			next = { state: 'error', message: getErrorMessage(error) };
		}

		if (generation === this._refreshGeneration) {
			this._snapshot.set(next, undefined);
		}
	}
}

/** The managed `permissions` slice as the runtime reports it in a diagnostics snapshot. */
interface IManagedPermissionsSlice {
	readonly disableBypassPermissionsMode?: unknown;
	readonly deny?: unknown;
	readonly ask?: unknown;
	readonly allow?: unknown;
}

type ManagedDiagnostics = Awaited<ReturnType<IAgentHostService['getManagedSettingsDiagnostics']>>;

/**
 * Projects the managed-settings diagnostics of every provider into display rules. Providers are
 * merged by rule identity so a rule enforced by more than one provider appears once.
 */
export function buildManagedSnapshot(diagnostics: ManagedDiagnostics): ChatPermissionSnapshot {
	const rules = new Map<string, IChatPermissionRule>();
	const failedProviders: IChatPermissionProviderFailure[] = [];
	let bypassRestriction: IChatPermissionCeiling['bypassRestriction'];
	let failClosed = false;
	let allowIntersected = false;
	let sawSnapshot = false;

	for (const diagnostic of diagnostics) {
		const snapshot = diagnostic.snapshot;
		if (!snapshot) {
			// Provider failures arrive in-band as `{ error }` rather than thrown. Recording them
			// keeps a timeout from masquerading as "this runtime has no managed policy".
			failedProviders.push({
				provider: diagnostic.provider,
				message: diagnostic.error ?? localize('chatPermissions.providerNoSnapshot', "No response."),
			});
			continue;
		}
		sawSnapshot = true;
		failClosed ||= snapshot.failClosed;
		allowIntersected ||= snapshot.permissionsAllowIntersected === true;

		const permissions = readPermissionsSlice(snapshot.settings);
		bypassRestriction = mostRestrictiveBypass(bypassRestriction, readBypassRestriction(permissions, snapshot.bypassPermissionsDisabled, snapshot.failClosed));
		if (!permissions) {
			continue;
		}
		collectRules(permissions.deny, ChatPermissionEffect.Deny, rules);
		collectRules(permissions.ask, ChatPermissionEffect.Ask, rules);
		collectRules(permissions.allow, ChatPermissionEffect.Allow, rules);
	}

	if (!sawSnapshot) {
		// Nothing was readable. If providers actively failed, say so — reporting "not supported"
		// would describe a transient failure as a permanent capability gap.
		return failedProviders.length > 0
			? { state: 'error', message: formatProviderFailures(failedProviders) }
			: { state: 'unavailable', reason: ChatPermissionUnavailableReason.NotSupported };
	}

	return {
		state: 'available',
		rules: [...rules.values()],
		ceiling: {
			// The blanket approval mode is session state; without a session context it cannot be
			// reported, so the least-escalated mode is shown rather than an invented one.
			mode: 'manual',
			bypassRestriction,
			failClosed,
			allowIntersected,
		},
		// Only the managed layer is reachable today. Naming it explicitly keeps the UI from
		// implying that the configured, location and session layers are empty.
		resolvedScopes: [ChatPermissionScope.Managed],
		failedProviders,
	};
}

function formatProviderFailures(failures: readonly IChatPermissionProviderFailure[]): string {
	return failures.map(failure => `${failure.provider}: ${failure.message}`).join('; ');
}

function readPermissionsSlice(settings: unknown): IManagedPermissionsSlice | undefined {
	if (!isObject(settings)) {
		return undefined;
	}
	const permissions = (settings as Record<string, unknown>).permissions;
	return isObject(permissions) ? permissions as IManagedPermissionsSlice : undefined;
}

function readBypassRestriction(permissions: IManagedPermissionsSlice | undefined, bypassPermissionsDisabled: boolean, failClosed: boolean): IChatPermissionCeiling['bypassRestriction'] {
	// `bypassPermissionsDisabled` is the runtime's composed verdict, and `failClosed` forces the
	// strictest behavior regardless of what the settings say. Both are therefore treated as a
	// floor: the raw key may only name a restriction the verdict already permits, never soften it.
	if (failClosed) {
		return 'disable';
	}
	const mode = permissions?.disableBypassPermissionsMode;
	if (mode === 'disable') {
		return 'disable';
	}
	// `allow-auto-only` is part of the runtime's managed-settings schema and is enforced by its
	// permission engine, but the bundled SDK typings still declare only `disable`. It is read from
	// the raw slice so a deployment using it is described accurately rather than over-reported as
	// a full block.
	if (mode === 'allow-auto-only' && bypassPermissionsDisabled) {
		return 'allowAutoOnly';
	}
	return bypassPermissionsDisabled ? 'disable' : undefined;
}

/**
 * Combines the verdicts of independent providers, keeping the strictest. This ranks two separate
 * provider reports; it does not re-derive the layering that the runtime already resolved within
 * each report.
 */
function mostRestrictiveBypass(current: IChatPermissionCeiling['bypassRestriction'], next: IChatPermissionCeiling['bypassRestriction']): IChatPermissionCeiling['bypassRestriction'] {
	if (current === 'disable' || next === 'disable') {
		return 'disable';
	}
	return current ?? next;
}

function collectRules(value: unknown, effect: ChatPermissionEffect, into: Map<string, IChatPermissionRule>): void {
	if (!Array.isArray(value)) {
		return;
	}
	for (const entry of value) {
		if (typeof entry !== 'string') {
			continue;
		}
		const parsed = parsePermissionRuleText(entry);
		if (!parsed?.domain) {
			// A family this client cannot place. Skipping it is safe for display because managed
			// enforcement is unaffected, and the diagnostics report carries the raw policy.
			continue;
		}
		const id = `${ChatPermissionScope.Managed}:${effect}:${entry}`;
		if (!into.has(id)) {
			into.set(id, {
				id,
				domain: parsed.domain,
				kind: parsed.kind,
				argument: parsed.argument,
				effect,
				scope: ChatPermissionScope.Managed,
				editable: false,
			});
		}
	}
}
