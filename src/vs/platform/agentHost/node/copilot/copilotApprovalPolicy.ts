/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JsonValue, ManagedSettingsPermissions, PermissionMode, SessionEventPayload } from '@github/copilot-sdk';
import { isObject } from '../../../../base/common/types.js';
import { AutoApproveLevel, platformSessionSchema } from '../../common/agentHostSchema.js';
import { getManagedRuleFamily, ManagedRuleFamily } from '../../common/agentHostManagedRules.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import { ResolveSessionConfigResult } from '../../common/state/protocol/commands.js';
import { localize } from '../../../../nls.js';

export function fromCopilotPermissionMode(mode: PermissionMode): AutoApproveLevel {
	return mode === 'manual' ? 'default' : mode === 'allow-all' ? 'autoApprove' : 'assisted';
}

type ManagedSettingsResolvedData = SessionEventPayload<'session.managed_settings_resolved'>['data'];

/** The effective managed `permissions` settings of a resolved policy, when it has any. */
function getResolvedManagedPermissions(resolved: ManagedSettingsResolvedData): { readonly [key: string]: JsonValue } | undefined {
	const settings = resolved.settings;
	const value = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.permissions : undefined;
	return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

/** Explicit new mode restrictions replace the legacy blanket policy, but not other tool restrictions. */
export function getCopilotApprovalPolicy(
	resolved: ManagedSettingsResolvedData,
	legacyRestricted: boolean,
	bridged: ManagedSettingsPermissions = {},
): { available: readonly AutoApproveLevel[]; defaultMode: AutoApproveLevel; permissions: ManagedSettingsPermissions } {
	const modes = getResolvedManagedPermissions(resolved);
	const explicit = typeof modes?.disableAssistedPermissionsMode === 'boolean'
		|| modes?.disableBypassPermissionsMode === 'disable' || modes?.disableBypassPermissionsMode === 'enable';
	const permissions: ManagedSettingsPermissions = legacyRestricted && !explicit
		? { ...bridged, disableAssistedPermissionsMode: true, disableBypassPermissionsMode: 'disable' }
		: bridged;
	const available: AutoApproveLevel[] = [
		'default',
		...(!resolved.failClosed && modes?.disableAssistedPermissionsMode !== true && permissions.disableAssistedPermissionsMode !== true ? ['assisted' as const] : []),
		...(!resolved.failClosed && !resolved.bypassPermissionsDisabled && permissions.disableBypassPermissionsMode !== 'disable' ? ['autoApprove' as const] : []),
	];
	const requestedDefault = modes?.defaultMode === 'assisted' ? 'assisted' : modes?.defaultMode === 'allow-all' ? 'autoApprove' : 'default';
	return { available, defaultMode: available.includes(requestedDefault) ? requestedDefault : 'default', permissions };
}

/**
 * How Copilot managed permissions govern a client tool that returns workspace
 * content (for example semantic search). The SDK cannot match such a tool
 * against path-scoped `Read(...)` rules, so the host enforces this itself.
 */
export const enum ManagedWorkspaceRetrievalAccess {
	/** No managed permission rule is in force. */
	Unrestricted = 'unrestricted',
	/** A managed rule is in force: every call needs a one-time human approval. */
	RequireApproval = 'requireApproval',
	/** A managed rule denies reads, or the policy could not be determined. */
	Deny = 'deny',
}

/**
 * Client tools that return workspace content without a path-scoped SDK
 * permission request. Their SDK registration skips permission checks, so the
 * host enforces Copilot managed permissions for them instead: they are
 * withheld from a session launched under a managed read denial and gated on
 * every call.
 */
export const MANAGED_WORKSPACE_RETRIEVAL_CLIENT_TOOLS: ReadonlySet<string> = new Set([SEMANTIC_SEARCH_TOOL_NAME]);

function getManagedRules(permissions: unknown, key: 'deny' | 'ask' | 'allow'): string[] {
	const rules = isObject(permissions) ? (permissions as Record<string, unknown>)[key] : undefined;
	return Array.isArray(rules) ? rules.filter((rule): rule is string => typeof rule === 'string') : [];
}

/**
 * Resolves {@link ManagedWorkspaceRetrievalAccess} from every known managed
 * policy snapshot and the rules bridged from VS Code settings. Retrieval can
 * return excerpts from any workspace file, so any read denial (or an
 * undetermined policy) denies it outright, and any other managed rule requires
 * approval, matching how the runtime treats unmatched reads once managed rules
 * are active.
 */
export function getManagedWorkspaceRetrievalAccess(policies: readonly (ManagedSettingsResolvedData | undefined)[], bridged: ManagedSettingsPermissions): ManagedWorkspaceRetrievalAccess {
	const ruleSets: unknown[] = [bridged];
	let restricted = false;
	for (const policy of policies) {
		if (!policy) {
			continue;
		}
		if (policy.failClosed || policy.permissionsContext?.failClosed) {
			return ManagedWorkspaceRetrievalAccess.Deny;
		}
		if (policy.permissionsAllowIntersected) {
			restricted = true;
		}
		ruleSets.push(getResolvedManagedPermissions(policy), policy.permissionsContext?.permissions);
	}
	for (const permissions of ruleSets) {
		const deny = getManagedRules(permissions, 'deny');
		if (deny.some(rule => getManagedRuleFamily(rule) === ManagedRuleFamily.Read)) {
			return ManagedWorkspaceRetrievalAccess.Deny;
		}
		if (deny.length > 0 || getManagedRules(permissions, 'ask').length > 0 || getManagedRules(permissions, 'allow').length > 0) {
			restricted = true;
		}
	}
	return restricted ? ManagedWorkspaceRetrievalAccess.RequireApproval : ManagedWorkspaceRetrievalAccess.Unrestricted;
}

interface ICopilotApprovalInputs {
	readonly requested: AutoApproveLevel | undefined;
	readonly legacyRestricted: boolean;
	readonly globalAutoApprove: boolean;
}

/** Session-owned policy snapshots and decisions; SDK calls and their sequencing remain with the session. */
export class CopilotSessionApprovalPolicy {
	private _policy: ReturnType<typeof getCopilotApprovalPolicy> | undefined;
	private _nativePolicy: SessionEventPayload<'session.managed_settings_resolved'>['data'] | undefined;
	private _runtimePolicy: SessionEventPayload<'session.managed_settings_resolved'>['data'] | undefined;
	private _bridgedPermissions: ManagedSettingsPermissions = {};
	private _runtimeModes: readonly AutoApproveLevel[] | undefined;

	setLaunchPolicy(resolved: SessionEventPayload<'session.managed_settings_resolved'>['data'], bridged: ManagedSettingsPermissions): void {
		this._nativePolicy = resolved;
		this._bridgedPermissions = bridged;
	}

	observeRuntimePolicy(resolved: SessionEventPayload<'session.managed_settings_resolved'>['data']): void {
		this._runtimePolicy = resolved;
		this._policy = getCopilotApprovalPolicy(resolved, false);
		this._runtimeModes = this._policy.available;
	}

	/** Fails closed to approval until a managed policy has been resolved. */
	getManagedWorkspaceRetrievalAccess(): ManagedWorkspaceRetrievalAccess {
		if (!this._nativePolicy && !this._runtimePolicy) {
			return ManagedWorkspaceRetrievalAccess.RequireApproval;
		}
		return getManagedWorkspaceRetrievalAccess([this._nativePolicy, this._runtimePolicy], this._bridgedPermissions);
	}

	getAvailableModes(inputs: ICopilotApprovalInputs): readonly AutoApproveLevel[] | undefined {
		this.resolveSelection(inputs);
		return this._policy?.available;
	}

	resolveSelection(inputs: ICopilotApprovalInputs): { mode: PermissionMode; configuredLevel: AutoApproveLevel } {
		if (this._nativePolicy) {
			const policy = getCopilotApprovalPolicy(this._nativePolicy, inputs.legacyRestricted, this._bridgedPermissions);
			const runtimeModes = this._runtimeModes;
			this._policy = runtimeModes ? { ...policy, available: policy.available.filter(mode => runtimeModes.includes(mode)) } : policy;
		}
		const configuredLevel = this._getConfiguredLevel(inputs);
		const mode = this._nativePolicy && inputs.globalAutoApprove
			? this._policy?.available.includes('autoApprove') ? 'allow-all' : 'manual'
			: this.isBypassApprovals(inputs) ? 'allow-all' : configuredLevel === 'assisted' ? 'assisted' : 'manual';
		return { mode, configuredLevel };
	}

	isBypassApprovals(inputs: ICopilotApprovalInputs): boolean {
		if (this._policy ? !this._policy.available.includes('autoApprove') : inputs.legacyRestricted) {
			return false;
		}
		return inputs.globalAutoApprove || inputs.requested === 'autoApprove';
	}

	canAcceptRuntimeResult(requested: PermissionMode, result: { success: boolean; mode: PermissionMode }): boolean {
		return result.success || !!this._policy
			&& !this._policy.available.includes(fromCopilotPermissionMode(requested))
			&& this._policy.available.includes(fromCopilotPermissionMode(result.mode));
	}

	getAppliedConfig(mode: PermissionMode): { effectiveApprovalMode: AutoApproveLevel; availableApprovalModes?: readonly AutoApproveLevel[] } {
		return {
			effectiveApprovalMode: fromCopilotPermissionMode(mode),
			...(this._policy ? { availableApprovalModes: this._policy.available } : {}),
		};
	}

	private _getConfiguredLevel(inputs: ICopilotApprovalInputs): AutoApproveLevel {
		if (!this._policy && inputs.legacyRestricted) {
			return 'default';
		}
		const requested = inputs.requested ?? this._policy?.defaultMode ?? 'default';
		return this._policy && !this._policy.available.includes(requested) ? 'default' : requested;
	}
}

export function getCopilotApprovalConfig(
	values: Record<string, unknown>,
	policy: ReturnType<typeof getCopilotApprovalPolicy>,
	globalAutoApprove: boolean,
): ResolveSessionConfigResult {
	const schema = platformSessionSchema.toProtocol();
	const approval = schema.properties.autoApprove;
	schema.properties.autoApprove = {
		...approval,
		default: policy.defaultMode,
	};
	schema.properties.availableApprovalModes = {
		type: 'array', title: localize('copilot.availableApprovals', "Available Permissions"), readOnly: true,
		items: { type: 'string', title: localize('copilot.approvalMode', "Permission Mode") },
	};
	// Host-written per chat (readOnly to clients): each chat's resolved approval mode, since a chat may set its own approvals.
	schema.properties.effectiveApprovalMode = { type: 'string', title: localize('copilot.effectiveApprovals', "Effective Permissions"), readOnly: true, chatMutable: true };
	const selected = values.autoApprove ?? policy.defaultMode;
	const configured = policy.available.some(value => value === selected) ? selected : 'default';
	const effective = globalAutoApprove ? policy.available.includes('autoApprove') ? 'autoApprove' : 'default' : configured;
	return {
		schema,
		values: { ...values, availableApprovalModes: policy.available, autoApprove: configured, effectiveApprovalMode: effective },
	};
}
