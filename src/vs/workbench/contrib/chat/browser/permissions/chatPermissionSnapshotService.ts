/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IFileManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { localize } from '../../../../../nls.js';
import {
	collectManagedPermissionRules,
	declaresAllowList,
	dedupeRulesByContent,
	readDeclaredBypassRestriction,
	readManagedPermissionsSlice,
} from '../../common/permissions/chatPermissionManagedRules.js';
import {
	ChatPermissionManagedChannel,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
	IChatPermissionCeiling,
	IChatPermissionProviderFailure,
	IChatPermissionRule,
} from '../../common/permissions/chatPermissions.js';
import { IChatPermissionSnapshotService } from '../../common/permissions/chatPermissionSnapshotService.js';

/**
 * Resolves the effective permission state for display, in two stages.
 *
 * **The agent is authoritative.** It runs its own managed-settings resolution, composes layers this
 * client cannot see (configured rules, location grants, session grants, an SDK-injected layer), and
 * applies its own fail-closed behaviour. Only its answer describes what is actually enforced.
 *
 * Asking it is slow, though — the probe spawns the SDK and can take seconds — so the section would
 * otherwise open blank. VS Code reads the same admin-authored documents through its own
 * managed-settings channels, so it can render a **provisional** managed layer immediately and then
 * replace it with the agent's answer. The provisional stage is a latency fix and nothing more: it
 * is labelled as unconfirmed, it never merges or ranks channels (the agent composes `deny`/`ask` as
 * a union and `allow` as an intersection, which is not VS Code's per-key precedence), and it is
 * always superseded.
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
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IFileManagedSettingsService private readonly fileManagedSettingsService: IFileManagedSettingsService,
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

		// Show what the local managed-settings channels say straight away, so the section is not
		// blank while the agent is asked. This is a stand-in, never the answer.
		const provisional = this.buildProvisionalSnapshot();
		this._snapshot.set(provisional ?? { state: 'loading' }, undefined);

		let next: ChatPermissionSnapshot;
		try {
			const diagnostics = await this.agentHostService.getManagedSettingsDiagnostics();
			next = diagnostics.length === 0
				? { state: 'unavailable', reason: ChatPermissionUnavailableReason.NotSupported }
				: buildManagedSnapshot(diagnostics);
		} catch (error) {
			const message = getErrorMessage(error);
			this.logService.warn(`[ChatPermissions] Failed to resolve managed permissions: ${message}`);
			// Keep the stand-in rather than dropping to a bare error: the admin-authored policy is
			// still the best available description of what governs the user, as long as the UI is
			// explicit that the agent never confirmed it.
			next = provisional
				? { ...provisional, provisional: { ...provisional.provisional!, confirmationFailed: message } }
				: { state: 'error', message };
		}

		if (generation === this._refreshGeneration) {
			this._snapshot.set(next, undefined);
		}
	}

	/**
	 * Reads the managed-settings documents VS Code itself receives. Channels are read
	 * independently and their rules concatenated — never merged by VS Code's per-key precedence,
	 * which would hide every channel but the winner and under-report the restrictions in force.
	 *
	 * Native MDM is deliberately absent: its watcher only reports keys a configuration policy
	 * declares, and `permissions.*` is runtime-owned with no VS Code setting behind it. Declaring
	 * one purely to read it is what the managed-settings guidance warns against, and the agent's
	 * authoritative answer covers that channel anyway.
	 */
	private buildProvisionalSnapshot(): Extract<ChatPermissionSnapshot, { state: 'available' }> | undefined {
		const channels: ChatPermissionManagedChannel[] = [];
		const slices: { channel: ChatPermissionManagedChannel; slice: ReturnType<typeof readManagedPermissionsSlice> }[] = [];

		for (const [channel, document] of [
			[ChatPermissionManagedChannel.Server, this.defaultAccountService.managedSettingsRawResponse],
			[ChatPermissionManagedChannel.File, this.fileManagedSettingsService.rawManagedSettings],
		] as const) {
			const slice = readManagedPermissionsSlice(document);
			if (slice) {
				channels.push(channel);
				slices.push({ channel, slice });
			}
		}

		if (slices.length === 0) {
			return undefined;
		}

		const rules = dedupeRulesByContent(slices.flatMap(entry => collectManagedPermissionRules(entry.slice, entry.channel)));
		let bypassRestriction: IChatPermissionCeiling['bypassRestriction'];
		for (const { slice } of slices) {
			const declared = readDeclaredBypassRestriction(slice);
			// Most-restrictive wins, matching how the agent composes this key.
			if (declared === 'disable' || bypassRestriction === 'disable') {
				bypassRestriction = 'disable';
			} else {
				bypassRestriction ??= declared;
			}
		}

		return {
			state: 'available',
			rules,
			ceiling: {
				mode: 'manual',
				bypassRestriction,
				failClosed: false,
				// Two or more channels declaring an allow list means the agent intersects them, so
				// the concatenation above is not the effective allow set.
				allowIntersected: slices.filter(entry => declaresAllowList(entry.slice)).length > 1,
			},
			resolvedScopes: [ChatPermissionScope.Managed],
			failedProviders: [],
			provisional: { channels },
		};
	}
}

type ManagedDiagnostics = Awaited<ReturnType<IAgentHostService['getManagedSettingsDiagnostics']>>;

/**
 * Projects the agent's managed-settings diagnostics into display rules. Each provider reports a
 * slice the runtime already resolved, so providers are merged only by rule identity — no
 * precedence is applied here.
 */
export function buildManagedSnapshot(diagnostics: ManagedDiagnostics): ChatPermissionSnapshot {
	const rules: IChatPermissionRule[] = [];
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

		const slice = readManagedPermissionsSlice(snapshot.settings);
		bypassRestriction = mostRestrictiveBypass(
			bypassRestriction,
			resolveBypassRestriction(slice, snapshot.bypassPermissionsDisabled, snapshot.failClosed),
		);
		rules.push(...collectManagedPermissionRules(slice, diagnostic.provider));
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
		rules: dedupeRulesByContent(rules),
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

/**
 * The agent's composed verdict is a floor: `bypassPermissionsDisabled` and `failClosed` may only be
 * refined by the raw key, never softened by it.
 */
function resolveBypassRestriction(
	slice: ReturnType<typeof readManagedPermissionsSlice>,
	bypassPermissionsDisabled: boolean,
	failClosed: boolean,
): IChatPermissionCeiling['bypassRestriction'] {
	if (failClosed) {
		return 'disable';
	}
	const declared = readDeclaredBypassRestriction(slice);
	if (declared === 'disable') {
		return 'disable';
	}
	if (declared === 'allowAutoOnly' && bypassPermissionsDisabled) {
		return 'allowAutoOnly';
	}
	return bypassPermissionsDisabled ? 'disable' : undefined;
}

/**
 * Combines the verdicts of independent providers, keeping the strictest. This ranks two separate
 * provider reports; it does not re-derive the layering the agent already resolved within each.
 */
function mostRestrictiveBypass(current: IChatPermissionCeiling['bypassRestriction'], next: IChatPermissionCeiling['bypassRestriction']): IChatPermissionCeiling['bypassRestriction'] {
	if (current === 'disable' || next === 'disable') {
		return 'disable';
	}
	return current ?? next;
}
