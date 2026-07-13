/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsIndicatorModel, RequiresInputKind } from '../../browser/blockedSessionsIndicatorModel.js';

suite('BlockedSessionsIndicatorModel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(options?: { quality?: string }): {
		model: BlockedSessionsIndicatorModel;
		blockedModel: TestBlockedSessions;
		approvalModel: TestApprovalModel;
		sessionsService: TestSessionsService;
	} {
		const blockedModel = new TestBlockedSessions();
		const approvalModel = new TestApprovalModel();
		const sessionsService = new TestSessionsService();
		const productService = { quality: options?.quality ?? 'insider' } as unknown as IProductService;
		const instantiationService = new class extends mock<IInstantiationService>() { }();
		const model = store.add(new BlockedSessionsIndicatorModel(
			approvalModel as unknown as AgentSessionApprovalModel,
			blockedModel as unknown as BlockedSessions,
			sessionsService as unknown as ISessionsService,
			instantiationService,
			productService,
		));
		// Keep the derived live so it recomputes on visibility/dismissal changes.
		store.add(autorun(reader => { model.blockedSessions.read(reader); }));
		return { model, blockedModel, approvalModel, sessionsService };
	}

	function blockedIds(model: BlockedSessionsIndicatorModel): string[] {
		return model.blockedSessions.get().map(entry => entry.session.sessionId);
	}

	test('excludes visible sessions from the blocked set', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		sessionsService.setVisible([s1]);
		assert.deepStrictEqual(blockedIds(model), ['s2']);
	});

	test('blinks when a new, not-yet-visible session becomes blocked', () => {
		const { model, blockedModel } = createModel();
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.strictEqual(model.consumePendingBlink(), true);
	});

	test('does not blink when a new block is already visible', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		sessionsService.setVisible([s1]);
		blockedModel.setBlocked([needsInput(s1)]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('does not blink when merely navigating between sessions', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		// The initial block blinks and is consumed.
		assert.strictEqual(model.consumePendingBlink(), true);

		// Navigating to s1 hides it from the blocked set — no new block, no blink.
		sessionsService.setVisible([s1]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });

		// Navigating away re-surfaces s1 in the blocked set but still must not blink.
		sessionsService.setVisible([]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: ['s1'], blink: false });
	});

	test('blinks again when an additional, not-yet-visible session becomes blocked', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		blockedModel.setBlocked([needsInput(s1)]);
		assert.strictEqual(model.consumePendingBlink(), true);
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.consumePendingBlink(), true);
	});

	test('does not blink when a queued block becomes visible before the blink plays', () => {
		// Simulates a blink queued while the pill is suppressed (e.g. the transient
		// "Approved N sessions" state): if the session becomes visible before the pill
		// shows, the queued blink must not fire on the later render.
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		// Blink is queued but NOT consumed yet (pill suppressed); the session then
		// becomes visible before the pill renders.
		sessionsService.setVisible([s1]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('does not blink when a queued block becomes visible then re-surfaces without ever being consumed', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		sessionsService.setVisible([s1]);
		sessionsService.setVisible([]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: ['s1'], blink: false });
	});

	test('does not blink when a queued block unblocks before the blink plays', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		// The session stops being blocked before the queued blink is consumed.
		blockedModel.setBlocked([]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('consumePendingBlink clears the pending blink', () => {
		const { model, blockedModel } = createModel();
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.deepStrictEqual([model.consumePendingBlink(), model.consumePendingBlink()], [true, false]);
	});

	test('reports a homogeneous requires-input kind', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
		approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Terminal));
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.TerminalApproval);
	});

	test('reports no kind for a mix of reasons', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
		approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Question));
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.requiresInputKind.get(), undefined);
	});

	test('classifies failing-CI reason', () => {
		const { model, blockedModel } = createModel();
		const ci = new TestSession('ci');
		blockedModel.setBlocked([{ session: ci as unknown as ISession, reason: BlockedSessionReason.FailingCI }]);
		assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.FailingCI);
	});

	test('builds the requires-input label per kind and count', () => {
		const { model } = createModel();
		assert.deepStrictEqual({
			terminalOne: model.getRequiresInputLabel(1, RequiresInputKind.TerminalApproval),
			terminalMany: model.getRequiresInputLabel(3, RequiresInputKind.TerminalApproval),
			questionOne: model.getRequiresInputLabel(1, RequiresInputKind.Question),
			failingCIMany: model.getRequiresInputLabel(2, RequiresInputKind.FailingCI),
			genericOne: model.getRequiresInputLabel(1, undefined),
			genericMany: model.getRequiresInputLabel(4, undefined),
		}, {
			terminalOne: '1 session requires terminal approval',
			terminalMany: '3 sessions require terminal approval',
			questionOne: '1 session has a question',
			failingCIMany: '2 sessions are failing CI',
			genericOne: '1 session requires input',
			genericMany: '4 sessions require input',
		});
	});

	test('dismissing an approval hides the session until a distinct approval appears', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const first = approval(AgentSessionApprovalKind.Terminal, new Date(1000));
		approvalModel.setApproval(s1.resource, first);
		blockedModel.setBlocked([needsInput(s1)]);
		assert.deepStrictEqual(blockedIds(model), ['s1']);

		// The user allows the pending approval — the session drops out immediately.
		model.dismissApproval({ session: s1 as unknown as ISession, approvalId: agentSessionApprovalId(first) });
		assert.deepStrictEqual(blockedIds(model), []);

		// A new, distinct approval re-surfaces the session.
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, new Date(2000)));
		assert.deepStrictEqual(blockedIds(model), ['s1']);
	});

	test('reports nothing and never blinks when disabled (stable quality)', () => {
		const { model, blockedModel } = createModel({ quality: 'stable' });
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
	});
});

function needsInput(session: TestSession): IBlockedSession {
	return { session: session as unknown as ISession, reason: BlockedSessionReason.NeedsInput };
}

function approval(kind: AgentSessionApprovalKind, since: Date = new Date()): IAgentSessionApprovalInfo {
	return { kind, label: 'npm run build', languageId: undefined, since, confirm: () => { } };
}

class TestSession {
	readonly resource: URI;
	readonly chats: IObservable<readonly { readonly resource: URI }[]>;

	constructor(readonly sessionId: string) {
		this.resource = URI.parse(`test-session:/${sessionId}`);
		this.chats = constObservable([{ resource: this.resource }]);
	}
}

class TestBlockedSessions {
	readonly blockedSessionsWithReasons = observableValue<readonly IBlockedSession[]>('withReasons', []);
	readonly blockedSessions = observableValue<readonly ISession[]>('blocked', []);

	setBlocked(blocked: readonly IBlockedSession[]): void {
		transaction(tx => {
			this.blockedSessionsWithReasons.set(blocked, tx);
			this.blockedSessions.set(blocked.map(entry => entry.session), tx);
		});
	}
}

class TestApprovalModel {
	private readonly _approvals = new Map<string, ISettableObservable<IAgentSessionApprovalInfo | undefined>>();

	getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
		return this._obs(resource.toString());
	}

	setApproval(resource: URI, info: IAgentSessionApprovalInfo | undefined): void {
		this._obs(resource.toString()).set(info, undefined);
	}

	private _obs(key: string): ISettableObservable<IAgentSessionApprovalInfo | undefined> {
		let obs = this._approvals.get(key);
		if (!obs) {
			obs = observableValue<IAgentSessionApprovalInfo | undefined>(`approval.${key}`, undefined);
			this._approvals.set(key, obs);
		}
		return obs;
	}
}

class TestSessionsService {
	readonly visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visible', []);

	setVisible(sessions: readonly TestSession[]): void {
		this.visibleSessions.set(sessions as unknown as readonly IActiveSession[], undefined);
	}
}
