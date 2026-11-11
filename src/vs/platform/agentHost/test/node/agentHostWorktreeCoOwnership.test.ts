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
import { AgentHostWorktreeCoOwnership, IWorktreeMoveInput, planWorktreeMove, presentedWorktreeFolders } from '../../node/agentHostWorktreeCoOwnership.js';
import { parseSessionWorktreeFolders, sessionWorktreeFolderRepositoryRoot, withSessionWorktreeFolders } from '../../node/shared/sessionWorktreeFolders.js';
import { IReadWorktreeForRemovalOptions, IRecordedWorktree, NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';

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
		targetHasOlderBuildCopy: true,
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
			presented: plan.presented.map(folder => folder.worktreePath),
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
			// Into a session older builds read no session values of (a promoted one): nothing names it an owner, it shares (M2).
			ownAloneNoCopy: decisions(planWorktreeMove(input({ chatFolders: [own.workingDirectory], targetHasOlderBuildCopy: false }))),
			sessionMoveNoCopy: decisions(planWorktreeMove(input({ kind: 'session', chatFolders: [primary.worktreePath], remainingFolders: [], targetHasOlderBuildCopy: false }))),
		}, {
			// `presented`: the worktrees the target records as worktree folders (its own is filtered when it records them).
			primary: { transfers: [], coOwned: [`${primary.worktreePath}:agents/source`], withhold: [true, false], handOver: false, presented: [primary.worktreePath] },
			backToOrigin: { transfers: [], coOwned: [`${coOwned.worktreePath}:agents/origin`], withhold: [false, true], handOver: false, presented: [coOwned.worktreePath] },
			ownAlone: { transfers: [`${own.workingDirectory}:${chat}`], coOwned: [], withhold: [false, false], handOver: false, presented: [own.workingDirectory] },
			ownShared: { refused: own.workingDirectory },
			descendant: { transfers: [`${own.workingDirectory}:${staying}`], coOwned: [], withhold: [false, false], handOver: false, presented: [own.workingDirectory] },
			shared: { transfers: [], coOwned: [`${sessionLevel.workingDirectory}:agents/lib`, `${coOwned.worktreePath}:agents/origin`], withhold: [false, false], handOver: false, presented: [sessionLevel.workingDirectory, coOwned.worktreePath] },
			sessionMove: { transfers: [`${own.workingDirectory}:${chat}`, `${sessionLevel.workingDirectory}:${chat}`], coOwned: [], withhold: [false, false], handOver: true, presented: [] },
			sharedSessionMove: { transfers: [], coOwned: [], withhold: [false, false], handOver: false, presented: [primary.worktreePath] },
			ownAloneNoCopy: { transfers: [], coOwned: [`${own.workingDirectory}:agents/own`], withhold: [false, false], handOver: false, presented: [own.workingDirectory] },
			sessionMoveNoCopy: { transfers: [], coOwned: [`${primary.worktreePath}:agents/source`, `${own.workingDirectory}:agents/own`, `${sessionLevel.workingDirectory}:agents/lib`], withhold: [false, false], handOver: false, presented: [primary.worktreePath] },
		});
	});

	test('a session\'s worktrees include those this process created but whose metadata isn\'t persisted (yet), so a move records them (L2, Block 5)', async () => {
		const store = new class extends mock<IAgentHostSessionStateStore>() {
			override async readWithoutImport(_session: URI, keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
				return new Map(keys.includes(ADDITIONAL_WORKTREES_METADATA_KEY) ? [[ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify([{ handle: own.handle, workingDirectory: own.workingDirectory, repositoryRoot: own.repositoryRoot, chat }])]] : []);
			}
		}();
		const isolation = new class extends NullAgentHostWorktreeIsolation {
			override async readSessionWorktreeForRemoval(_session: URI, options?: IReadWorktreeForRemovalOptions): Promise<IRecordedWorktree | undefined> {
				return options?.includeUnpersisted ? { worktree: URI.parse(primary.worktreePath), repositoryRoot: URI.parse(primary.repositoryRoot), branchName: primary.branch } : undefined;
			}
			override async readDetachedWorktreeForRemoval(_handle: string, options?: IReadWorktreeForRemovalOptions): Promise<IRecordedWorktree | undefined> {
				return options?.includeUnpersisted ? { worktree: URI.parse(own.workingDirectory), repositoryRoot: URI.parse(own.repositoryRoot), branchName: own.branch } : undefined;
			}
		}();
		const database = new AgentHostDatabase(':memory:');
		try {
			const records = await new AgentHostWorktreeCoOwnership(database, store, isolation, new NullLogService()).readSessionWorktrees(URI.parse(source));
			assert.deepStrictEqual({ primary: records.primary, additional: records.additional }, {
				primary,
				additional: [{ handle: own.handle, workingDirectory: own.workingDirectory, repositoryRoot: own.repositoryRoot, chat, branch: own.branch }],
			});
		} finally {
			await database.close();
		}
	});

	test('a transferred record names its new owner only once the target lists it, and the source drops it only after (1.142 ordering)', async () => {
		const events: string[] = [];
		const store = new class extends mock<IAgentHostSessionStateStore>() {
			override async update(session: URI, key: string, _updater: (previous: string | undefined) => string | null, flush: SessionStateMirrorFlush): Promise<number> {
				events.push(`publish:${session.toString()}:${key}:${flush}`);
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
					`publish:${target.toString()}:agentHost.additionalWorktrees:${SessionStateMirrorFlush.Acknowledged}`,
					`owner:${own.handle}:${target.toString()}`,
					`publish:${source}:agentHost.additionalWorktrees:${SessionStateMirrorFlush.Immediate}`,
				],
				// The session that ended has no older-build copy to drop.
				sessionMove: [
					`publish:${target.toString()}:agentHost.additionalWorktrees:${SessionStateMirrorFlush.Acknowledged}`,
					`owner:${sessionLevel.handle}:${target.toString()}`,
					`handOver:${AgentSession.id(URI.parse(source))}:${own.handle}:${target.toString()}`,
				],
			});
		} finally {
			await database.close();
		}
	});
	test('the target records the presented worktrees as its worktree folders, never its own one; a session presents as a worktree session when its primary folder is (inside) one of them', () => {
		const recorded = withSessionWorktreeFolders(JSON.stringify([{ workingDirectory: sessionLevel.workingDirectory, repositoryRoot: 'file:///stale', branch: 'old' }]), presentedWorktreeFolders([primary, coOwned, { worktreePath: sessionLevel.workingDirectory, repositoryRoot: sessionLevel.repositoryRoot, branch: sessionLevel.branch }], coOwned.worktreePath));
		assert.deepStrictEqual({
			recorded: parseSessionWorktreeFolders(recorded ?? undefined),
			primaryInside: sessionWorktreeFolderRepositoryRoot(recorded ?? undefined, `${primary.worktreePath}/src`),
			// The target's own worktree is presented natively, and a folder no entry names stays a folder.
			own: sessionWorktreeFolderRepositoryRoot(recorded ?? undefined, coOwned.worktreePath),
			unrelated: sessionWorktreeFolderRepositoryRoot(recorded ?? undefined, 'file:///repo.worktrees/unrecorded'),
			nothing: withSessionWorktreeFolders(undefined, []),
		}, {
			recorded: [
				{ workingDirectory: primary.worktreePath, repositoryRoot: primary.repositoryRoot, branch: primary.branch },
				{ workingDirectory: sessionLevel.workingDirectory, repositoryRoot: sessionLevel.repositoryRoot, branch: sessionLevel.branch },
			],
			primaryInside: primary.repositoryRoot,
			own: undefined,
			unrelated: undefined,
			nothing: null,
		});
	});
});
