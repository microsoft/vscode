/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kente Workbench contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { IAuditEntry, IAuditSink } from './governanceAuditLog.js';
import { classifyAction } from './governanceClassifier.js';
import {
	GovernanceConfigKeys,
	GovernanceOutcome,
	GovernanceRiskTier,
	IGovernanceApprover,
	IGovernanceDecision,
	IGovernanceGate,
	IGovernedAction,
	isAtLeastAsRisky,
	RISK_TIER_ORDER,
} from './governance.js';

/**
 * Approval is required from this tier upward unless configuration says
 * otherwise. Chosen so that the documented rule holds with no configuration at
 * all: local Docker work is low-friction, remote clusters are not.
 */
const DEFAULT_APPROVAL_THRESHOLD = GovernanceRiskTier.RemoteInfra;

function isRiskTier(value: unknown): value is GovernanceRiskTier {
	return typeof value === 'string' && (RISK_TIER_ORDER as readonly string[]).includes(value);
}

export class GovernanceGate extends Disposable implements IGovernanceGate {

	declare readonly _serviceBrand: undefined;

	private _approver: IGovernanceApprover | undefined;

	constructor(
		private readonly auditSink: IAuditSink,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	registerApprover(approver: IGovernanceApprover): IDisposable {
		this._approver = approver;
		return toDisposable(() => {
			if (this._approver === approver) {
				this._approver = undefined;
			}
		});
	}

	/**
	 * Resolves the approval threshold.
	 *
	 * Read through {@link IConfigurationService} rather than from a file we
	 * parse ourselves, because that is what makes the value policy-aware:
	 * policy values are applied last and override user, workspace and folder
	 * settings, so a repository cannot lower its own bar.
	 *
	 * An unrecognised value falls back to the default rather than being
	 * ignored — a typo in a settings file must not silently disable gating.
	 */
	private resolveThreshold(): GovernanceRiskTier {
		const configured = this.configurationService.getValue(GovernanceConfigKeys.ApprovalThreshold);
		if (isRiskTier(configured)) {
			return configured;
		}
		if (configured !== undefined) {
			this.logService.warn(`[governance] ignoring unrecognised ${GovernanceConfigKeys.ApprovalThreshold}: ${String(configured)}`);
		}
		return DEFAULT_APPROVAL_THRESHOLD;
	}

	async authorize(action: IGovernedAction, token: CancellationToken): Promise<IGovernanceDecision> {
		const auditId = generateUuid();

		let tier: GovernanceRiskTier;
		try {
			tier = classifyAction(action);
		} catch (error) {
			// A classifier that throws tells us nothing about the action, so we
			// cannot conclude it is safe.
			return this.record(action, auditId, GovernanceRiskTier.Production, GovernanceOutcome.Denied, false,
				`classification failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		const gatingEnabled = this.configurationService.getValue(GovernanceConfigKeys.Enabled) !== false;
		if (!gatingEnabled) {
			return this.record(action, auditId, tier, GovernanceOutcome.Allowed, false, 'gating disabled by configuration');
		}

		if (!isAtLeastAsRisky(tier, this.resolveThreshold())) {
			return this.record(action, auditId, tier, GovernanceOutcome.Allowed, false, `tier ${tier} is below the approval threshold`);
		}

		// From here the action needs a human. Every path that does not end in an
		// explicit yes must deny.
		const approver = this._approver;
		if (!approver) {
			return this.record(action, auditId, tier, GovernanceOutcome.Denied, false, 'approval required but no approver is registered');
		}

		if (token.isCancellationRequested) {
			return this.record(action, auditId, tier, GovernanceOutcome.Denied, false, 'cancelled before approval was requested');
		}

		let approved: boolean;
		try {
			approved = await approver.requestApproval({ action, tier, reason: `${action.name} was classified as ${tier}` }, token);
		} catch (error) {
			return this.record(action, auditId, tier, GovernanceOutcome.Denied, true,
				`approval failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		if (token.isCancellationRequested) {
			return this.record(action, auditId, tier, GovernanceOutcome.Denied, true, 'cancelled while awaiting approval');
		}

		return this.record(action, auditId, tier,
			approved ? GovernanceOutcome.Allowed : GovernanceOutcome.Denied, true,
			approved ? 'approved by a human' : 'rejected by a human');
	}

	/**
	 * Writes the audit entry and returns the decision.
	 *
	 * A decision that could not be recorded is downgraded to a denial. The
	 * product promise is that production-impacting actions are auditable; an
	 * action we cannot account for must not run, even if a human said yes.
	 */
	private async record(
		action: IGovernedAction,
		auditId: string,
		tier: GovernanceRiskTier,
		outcome: GovernanceOutcome,
		approvalRequested: boolean,
		reason: string,
	): Promise<IGovernanceDecision> {
		const entry: IAuditEntry = {
			id: auditId,
			timestamp: new Date().toISOString(),
			sessionId: action.sessionId,
			kind: action.kind,
			name: action.name,
			origin: action.origin,
			tier,
			outcome,
			approvalRequested,
			reason,
			commandLine: action.commandLine,
			detail: action.detail,
		};

		try {
			await this.auditSink.append(entry);
		} catch (error) {
			this.logService.error(`[governance] failed to write audit entry ${auditId}`, error);
			if (outcome === GovernanceOutcome.Allowed) {
				return {
					outcome: GovernanceOutcome.Denied,
					tier,
					approvalRequested,
					reason: 'denied because the decision could not be recorded',
					auditId,
				};
			}
		}

		return { outcome, tier, approvalRequested, reason, auditId };
	}
}
