/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../../common/agentHostSessionStateStore.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostWorktreeCoOwnership, IWorktreeMoveInput, planWorktreeMove } from '../../node/agentHostWorktreeCoOwnership.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

const source = 'copilotcli:/source';
const chat = 'ahp-chat://moved';
const staying = 'ahp-chat://staying';
const primary = { worktreePath: 'file:///repo.worktrees/source', repositoryRoot: 'file:///repo', branch: 'agents/source' };
const own = { handle: '11111111-1111-4111-8111-111111111111', workingDirectory: 'file:///repo.worktrees/own', repositoryRoot: 'file:///repo', chat, branch: 'agents/own' };
const sessionLevel = { handle: '22222222-2222-4222-8222-222222222222', workingDirectory: 'file:///lib.worktrees/source', repositoryRoot: 'file:///lib', branch: 'agents/lib' };
const coOwned = { worktreePath: 'file:///other.worktrees/origin', repositoryRoot: 'file:///other', branch: 'agents/origin' };

function input(overrides: Partial<IWorktreeMoveInput>): IWorktreeMoveInput {
	return {
		kind: 'chat',
		chat,
		moved: [chat],
		chatFolders: [],
		remainingFolders: [[primary.worktreePath]],
		source: { primary, additional: [own, sessionLevel], coOwned: [coOwned] },
		targetPrimary: undefined,
		...overrides,
	};
}

suite('AgentHostWorktreeCoOwnership', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a move transfers a chat\'s own worktree, shares every other worktree it works in, and refuses its own worktree a staying chat also uses', () => {
		const decisions = (plan: ReturnType<typeof planWorktreeMove>) => plan.refused !== undefined ? { refused: plan.refused } : {
			transfers: plan.transfers.map(worktree => `${worktree.workingDirectory}:${worktree.chat}`),
			coOwned: plan.coOwned.map(folder => `${folder.worktreePath}:${folder.branch}`),
			withhold: [plan.withholdSource, plan.withholdTarget],
			handOver: plan.handOver,
		};
		assert.deepStrictEqual({
			// In its session's own worktree (a subfolder of it): the source withholds its branch from older builds.
			primary: decisions(planWorktreeMove(input({ chatFolders: [`${primary.worktreePath}/src`] }))),
			// Moving back into the session whose worktree it works in: the target withholds its branch.
			backToOrigin: decisions(planWorktreeMove(input({ chatFolders: [coOwned.worktreePath], targetPrimary: coOwned.worktreePath }))),
			// Its own additional worktree, no staying chat uses it: its record moves (case a).
			ownAlone: decisions(planWorktreeMove(input({ chatFolders: [own.workingDirectory] }))),
			// Its own additional worktree, which a staying chat uses too (D2).
			ownShared: decisions(planWorktreeMove(input({ chatFolders: [own.workingDirectory], remainingFolders: [[own.workingDirectory]] }))),
			// A worktree a descendant of the chat was created for transfers with it.
			descendant: decisions(planWorktreeMove(input({ moved: [chat, staying], chatFolders: [own.workingDirectory], source: { primary, additional: [{ ...own, chat: staying }], coOwned: [] } }))),
			// The session's additional worktree and one it shares since an earlier move: shared.
			shared: decisions(planWorktreeMove(input({ chatFolders: [sessionLevel.workingDirectory, coOwned.worktreePath] }))),
			// A session that moves under another session ends: its records go to the target, its own worktree handed over.
			sessionMove: decisions(planWorktreeMove(input({ kind: 'session', chatFolders: [primary.worktreePath], remainingFolders: [] }))),
			// ...unless it already shares that worktree: its share continues as the target's.
			sharedSessionMove: decisions(planWorktreeMove(input({ kind: 'session', chatFolders: [primary.worktreePath], remainingFolders: [], source: { primary, additional: [], coOwned: [primary] } }))),
		}, {
			primary: { transfers: [], coOwned: [`${primary.worktreePath}:agents/source`], withhold: [true, false], handOver: false },
			backToOrigin: { transfers: [], coOwned: [`${coOwned.worktreePath}:agents/origin`], withhold: [false, true], handOver: false },
			ownAlone: { transfers: [`${own.workingDirectory}:${chat}`], coOwned: [], withhold: [false, false], handOver: false },
			ownShared: { refused: own.workingDirectory },
			descendant: { transfers: [`${own.workingDirectory}:${staying}`], coOwned: [], withhold: [false, false], handOver: false },
			shared: { transfers: [], coOwned: [`${sessionLevel.workingDirectory}:agents/lib`, `${coOwned.worktreePath}:agents/origin`], withhold: [false, false], handOver: false },
			sessionMove: { transfers: [`${own.workingDirectory}:${chat}`, `${sessionLevel.workingDirectory}:${chat}`], coOwned: [], withhold: [false, false], handOver: true },
			sharedSessionMove: { transfers: [], coOwned: [], withhold: [false, false], handOver: false },
		});
	});

	test('a transferred record names its new owner only once the target lists it, and the source drops it only after (1.142 ordering)', async () => {
		const events: string[] = [];
		const store = new class extends mock<IAgentHostSessionStateStore>() {
			override async update(session: URI, key: string, _updater: (previous: string | undefined) => string | null, flush: SessionStateMirrorFlush): Promise<number> {
				events.push(`publish:${session.toString()}:${key}:${flush === SessionStateMirrorFlush.Immediate ? 'now' : 'later'}`);
				return 1;
			}
		}();
		const isolation = new class extends NullAgentHostWorktreeIsolation {
			override async setDetachedWorktreeOwner(handle: string, owner: URI): Promise<void> {
				events.push(`owner:${handle}:${owner.toString()}`);
			}
			override async completeWorktreeHandOver(sessionId: string, handle: string, owner: URI): Promise<void> {
				events.push(`handOver:${sessionId}:${handle}:${owner.toString()}`);
			}
		}();
		const database = new AgentHostDatabase(':memory:');
		try {
			const coOwnership = new AgentHostWorktreeCoOwnership(database, store, isolation, new NullLogService());
			const target = URI.parse('copilotcli:/target');
			await coOwnership.completeTransfers(URI.parse(source), target, [own], undefined, false);
			const chatMove = events.splice(0);
			await coOwnership.completeTransfers(URI.parse(source), target, [sessionLevel], { handle: own.handle, workingDirectory: primary.worktreePath, repositoryRoot: primary.repositoryRoot, dispose: () => { } }, true);

			assert.deepStrictEqual({ chatMove, sessionMove: events }, {
				chatMove: [
					`publish:${target.toString()}:agentHost.additionalWorktrees:now`,
					`owner:${own.handle}:${target.toString()}`,
					`publish:${source}:agentHost.additionalWorktrees:now`,
				],
				// The session that ended has no older-build copy to drop.
				sessionMove: [
					`publish:${target.toString()}:agentHost.additionalWorktrees:now`,
					`owner:${sessionLevel.handle}:${target.toString()}`,
					`handOver:${AgentSession.id(URI.parse(source))}:${own.handle}:${target.toString()}`,
				],
			});
		} finally {
			await database.close();
		}
	});
});
