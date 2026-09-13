/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kente Workbench contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import {
	GovernanceConfigKeys,
	GovernanceOutcome,
	GovernanceRiskTier,
	GovernedActionKind,
	IApprovalRequest,
	IGovernanceApprover,
	IGovernedAction,
} from '../../common/governance.js';
import { IAuditEntry, IAuditSink, InMemoryAuditSink } from '../../common/governanceAuditLog.js';
import { classifyCommandLine } from '../../common/governanceClassifier.js';
import { GovernanceGate } from '../../common/governanceGate.js';

class StubApprover implements IGovernanceApprover {
	readonly seen: IApprovalRequest[] = [];
	constructor(private readonly answer: boolean | Error) { }
	async requestApproval(request: IApprovalRequest): Promise<boolean> {
		this.seen.push(request);
		if (this.answer instanceof Error) {
			throw this.answer;
		}
		return this.answer;
	}
}

class FailingAuditSink implements IAuditSink {
	async append(_entry: IAuditEntry): Promise<void> {
		throw new Error('disk full');
	}
}

function action(overrides: Partial<IGovernedAction> = {}): IGovernedAction {
	return {
		kind: GovernedActionKind.Tool,
		name: 'run_in_terminal',
		origin: 'kente.agent',
		sessionId: 'session-1',
		...overrides,
	};
}

suite('Governance classifier', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies command lines by their riskiest segment', () => {
		assert.deepStrictEqual(
			[
				'docker compose up -d',
				'kubectl --context kind-dev get pods',
				'kubectl --context staging get pods',
				'kubectl get pods',
				'cd infra && kubectl --context prod-eu apply -f .',
				'terraform plan',
				'terraform apply -auto-approve',
				'git push origin feature/thing',
				'git push origin main',
				'git commit -m wip',
				'sudo docker ps',
				'npm test',
			].map(classifyCommandLine),
			[
				GovernanceRiskTier.LocalInfra,
				GovernanceRiskTier.LocalInfra,
				GovernanceRiskTier.RemoteInfra,
				GovernanceRiskTier.RemoteInfra,
				GovernanceRiskTier.RemoteInfra,
				GovernanceRiskTier.RemoteInfra,
				GovernanceRiskTier.Production,
				GovernanceRiskTier.RemoteInfra,
				GovernanceRiskTier.Production,
				GovernanceRiskTier.LocalWrite,
				GovernanceRiskTier.LocalInfra,
				GovernanceRiskTier.LocalWrite,
			]
		);
	});

	test('a docker client pointed at a remote daemon is not a local action', () => {
		assert.strictEqual(classifyCommandLine('docker -H tcp://10.0.0.4:2375 ps'), GovernanceRiskTier.RemoteInfra);
	});
});

suite('Governance gate', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createGate(approver?: IGovernanceApprover, config: Record<string, unknown> = {}, sink: IAuditSink = new InMemoryAuditSink()) {
		const configurationService = new TestConfigurationService(config);
		const gate = store.add(new GovernanceGate(sink, configurationService, new NullLogService()));
		if (approver) {
			store.add(gate.registerApprover(approver));
		}
		return { gate, sink };
	}

	test('local Docker work runs without asking anyone', async () => {
		const approver = new StubApprover(true);
		const { gate } = createGate(approver);

		const decision = await gate.authorize(action({ commandLine: 'docker compose up -d' }), CancellationToken.None);

		assert.deepStrictEqual(
			{ outcome: decision.outcome, tier: decision.tier, asked: decision.approvalRequested, prompts: approver.seen.length },
			{ outcome: GovernanceOutcome.Allowed, tier: GovernanceRiskTier.LocalInfra, asked: false, prompts: 0 }
		);
	});

	// The Phase 1 exit criterion.
	test('a remote cluster action cannot run without recorded approval', async () => {
		const approver = new StubApprover(false);
		const { gate, sink } = createGate(approver);
		const remote = action({ commandLine: 'kubectl --context prod-eu apply -f deploy.yaml' });

		const denied = await gate.authorize(remote, CancellationToken.None);
		assert.strictEqual(denied.outcome, GovernanceOutcome.Denied);

		const approved = await (createGate(new StubApprover(true), {}, sink).gate).authorize(remote, CancellationToken.None);
		assert.strictEqual(approved.outcome, GovernanceOutcome.Allowed);

		assert.deepStrictEqual(
			(sink as InMemoryAuditSink).entries.map(e => ({ tier: e.tier, outcome: e.outcome, asked: e.approvalRequested })),
			[
				{ tier: GovernanceRiskTier.RemoteInfra, outcome: GovernanceOutcome.Denied, asked: true },
				{ tier: GovernanceRiskTier.RemoteInfra, outcome: GovernanceOutcome.Allowed, asked: true },
			]
		);
	});

	test('denies when no approver is registered', async () => {
		const { gate } = createGate(undefined);

		const decision = await gate.authorize(action({ commandLine: 'kubectl --context prod get pods' }), CancellationToken.None);

		assert.deepStrictEqual(
			{ outcome: decision.outcome, reason: decision.reason },
			{ outcome: GovernanceOutcome.Denied, reason: 'approval required but no approver is registered' }
		);
	});

	test('denies when the approver throws', async () => {
		const { gate } = createGate(new StubApprover(new Error('ui gone')));

		const decision = await gate.authorize(action({ commandLine: 'terraform apply' }), CancellationToken.None);

		assert.strictEqual(decision.outcome, GovernanceOutcome.Denied);
	});

	test('denies when cancelled while awaiting approval', async () => {
		const source = store.add(new CancellationTokenSource());
		const approver: IGovernanceApprover = {
			async requestApproval() {
				source.cancel();
				return true;
			}
		};
		const { gate } = createGate(approver);

		const decision = await gate.authorize(action({ commandLine: 'kubectl --context prod delete ns app' }), source.token);

		assert.strictEqual(decision.outcome, GovernanceOutcome.Denied);
	});

	test('denies an approved action whose audit entry could not be written', async () => {
		const { gate } = createGate(new StubApprover(true), {}, new FailingAuditSink());

		const decision = await gate.authorize(action({ commandLine: 'kubectl --context prod apply -f x.yaml' }), CancellationToken.None);

		assert.deepStrictEqual(
			{ outcome: decision.outcome, reason: decision.reason },
			{ outcome: GovernanceOutcome.Denied, reason: 'denied because the decision could not be recorded' }
		);
	});

	test('an unrecognised threshold falls back to the default instead of disabling gating', async () => {
		const { gate } = createGate(new StubApprover(false), { [GovernanceConfigKeys.ApprovalThreshold]: 'nonsense' });

		const decision = await gate.authorize(action({ commandLine: 'kubectl --context prod apply -f x.yaml' }), CancellationToken.None);

		assert.strictEqual(decision.outcome, GovernanceOutcome.Denied);
	});

	test('model requests are recorded even though they are never gated', async () => {
		const { gate, sink } = createGate(new StubApprover(false));

		const decision = await gate.authorize(
			action({ kind: GovernedActionKind.Model, name: 'claude-opus-5', commandLine: undefined, detail: { promptTokens: 1200 } }),
			CancellationToken.None
		);

		assert.strictEqual(decision.outcome, GovernanceOutcome.Allowed);
		assert.deepStrictEqual(
			(sink as InMemoryAuditSink).entries.map(e => ({ kind: e.kind, name: e.name, detail: e.detail })),
			[{ kind: GovernedActionKind.Model, name: 'claude-opus-5', detail: { promptTokens: 1200 } }]
		);
	});
});
