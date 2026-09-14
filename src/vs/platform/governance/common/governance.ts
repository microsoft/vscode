/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kente Workbench contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * How much damage an action could do if it turns out to be wrong.
 *
 * Ordering matters: {@link isAtLeastAsRisky} compares tiers by their position
 * in {@link RISK_TIER_ORDER}, so new tiers must be inserted at the right point
 * rather than appended.
 */
export const enum GovernanceRiskTier {
	/** No side effects. Reading files, listing resources, describing state. */
	Read = 'read',
	/** Writes confined to the developer's own working tree. */
	LocalWrite = 'localWrite',
	/** Container or service lifecycle on the developer's own machine. */
	LocalInfra = 'localInfra',
	/** Anything addressing a remote or shared cluster, however read-only it looks. */
	RemoteInfra = 'remoteInfra',
	/** Deploys, merges to protected branches, and changes to production data. */
	Production = 'production',
}

export const RISK_TIER_ORDER: readonly GovernanceRiskTier[] = [
	GovernanceRiskTier.Read,
	GovernanceRiskTier.LocalWrite,
	GovernanceRiskTier.LocalInfra,
	GovernanceRiskTier.RemoteInfra,
	GovernanceRiskTier.Production,
];

/** True when `tier` is at least as risky as `other`. */
export function isAtLeastAsRisky(tier: GovernanceRiskTier, other: GovernanceRiskTier): boolean {
	return RISK_TIER_ORDER.indexOf(tier) >= RISK_TIER_ORDER.indexOf(other);
}

/** What kind of thing is being authorized. */
export const enum GovernedActionKind {
	/** A tool call — file edits, terminal commands, MCP tools. */
	Tool = 'tool',
	/** A request to a language model. Gated so cost and prompts are auditable. */
	Model = 'model',
}

/**
 * An action presented to the gate for authorization.
 *
 * This is deliberately a flat, serializable shape: audit entries are derived
 * from it directly, and an entry that cannot be written to disk is useless.
 */
export interface IGovernedAction {
	readonly kind: GovernedActionKind;
	/** Tool id, or model id for model requests. */
	readonly name: string;
	/** Who is asking: an extension identifier, or the built-in agent. */
	readonly origin: string;
	/** Correlates every action taken within one agent session. */
	readonly sessionId: string;
	/**
	 * The command line, when the action runs one. The classifier reads this,
	 * so omitting it for a tool that does shell out will under-classify the
	 * action.
	 */
	readonly commandLine?: string;
	/** Free-form detail recorded in the audit entry. Must be serializable. */
	readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

export const enum GovernanceOutcome {
	Allowed = 'allowed',
	Denied = 'denied',
}

export interface IGovernanceDecision {
	readonly outcome: GovernanceOutcome;
	readonly tier: GovernanceRiskTier;
	/** Whether a human was asked. False for actions below the approval threshold. */
	readonly approvalRequested: boolean;
	/** Human-readable justification, recorded verbatim in the audit log. */
	readonly reason: string;
	/** Identifies the audit entry written for this decision. */
	readonly auditId: string;
}

export interface IApprovalRequest {
	readonly action: IGovernedAction;
	readonly tier: GovernanceRiskTier;
	/** Why approval is being asked for, for display to the human deciding. */
	readonly reason: string;
}

/**
 * Supplies the human decision. Implemented by the UI layer; the gate itself
 * has no opinion about how approval is obtained.
 *
 * A gate with no registered approver denies every action that needs one —
 * see {@link IGovernanceGate}.
 */
export interface IGovernanceApprover {
	requestApproval(request: IApprovalRequest, token: CancellationToken): Promise<boolean>;
}

export const IGovernanceGate = createDecorator<IGovernanceGate>('governanceGate');

/**
 * The single chokepoint every agent action passes through.
 *
 * Two properties this must keep, because everything else about the product's
 * governance story rests on them:
 *
 * 1. **Fails closed.** Any uncertainty — no approver registered, a classifier
 *    that throws, a cancelled request — denies. An approval gate that falls
 *    open under error is not a gate.
 * 2. **Not overridable from a workspace.** The approval threshold is read
 *    through the configuration service, where policy values take precedence
 *    over user, workspace and folder settings. A repository cannot lower the
 *    bar for the code it contains.
 */
export interface IGovernanceGate {
	readonly _serviceBrand: undefined;

	/**
	 * Authorize `action`, asking for human approval if policy requires it, and
	 * record the outcome. Callers must not execute unless the returned outcome
	 * is {@link GovernanceOutcome.Allowed}.
	 */
	authorize(action: IGovernedAction, token: CancellationToken): Promise<IGovernanceDecision>;

	/**
	 * Register the component that asks the human. Only one approver is active;
	 * registering a second replaces the first until disposed.
	 */
	registerApprover(approver: IGovernanceApprover): IDisposable;
}

/**
 * Settings keys. These are registered as policy-backed configuration so an
 * administrator can pin them, per D-003.
 */
export const GovernanceConfigKeys = {
	/** Lowest tier that requires human approval. */
	ApprovalThreshold: 'kente.governance.approvalThreshold',
	/** When false, the audit log is still written but nothing is gated. Dev only. */
	Enabled: 'kente.governance.enabled',
} as const;
