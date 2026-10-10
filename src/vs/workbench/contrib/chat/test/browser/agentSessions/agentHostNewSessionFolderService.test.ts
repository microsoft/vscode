/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ExtUri, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import type { AgentInfo, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostNewSessionFolderService, computeDesiredWorkingDirectories, computeWorkingDirectories } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';

suite('AgentHostNewSessionFolderService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let service: AgentHostNewSessionFolderService;
	let cleanup: DisposableStore;
	let onDidDisposeSession: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;
	let onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	let workspaceFolders: URI[];

	setup(() => {
		onDidDisposeSession = ds.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>());
		onDidChangeWorkspaceFolders = ds.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
		};
		workspaceFolders = [folderA, folderB];
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
			override getWorkspace(): IWorkspace {
				return { folders: workspaceFolders.map(uri => ({ uri } as IWorkspaceFolder)) } as IWorkspace;
			}
		};
		service = ds.add(new AgentHostNewSessionFolderService(chatService, workspaceContextService, { extUri: extUriBiasedIgnorePathCase } as Partial<IUriIdentityService> as IUriIdentityService));
		cleanup = ds.add(new DisposableStore());
	});

	const sessionA = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-a' });
	const sessionB = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-b' });
	const folderA = URI.file('/repoA');
	const folderB = URI.file('/repoB');
	const folderC = URI.file('/repoC');

	const wsFolder = (uri: URI): IWorkspaceFolder => ({ uri, index: 0, name: uri.path, toResource: relativePath => URI.joinPath(uri, relativePath) });

	test('set/get/clear round-trips and fires onDidChange on real changes only', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		assert.strictEqual(service.getFolder(sessionA), undefined, 'unknown resource is undefined');

		service.setFolder(sessionA, folderA);
		service.setFolder(sessionA, folderA); // same value: no event
		service.setFolder(sessionA, folderB);
		const afterSet = service.getFolder(sessionA)?.toString();

		service.clear(sessionA);
		const afterClear = service.getFolder(sessionA);
		service.clear(sessionA); // already cleared: no event

		assert.deepStrictEqual({
			afterSet,
			afterClear,
			changes,
		}, {
			afterSet: folderB.toString(),
			afterClear: undefined,
			changes: [sessionA.toString(), sessionA.toString(), sessionA.toString()],
		});
	});

	test('clears the chosen folder when its session is disposed', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		service.setFolder(sessionA, folderA);
		onDidDisposeSession.fire({ sessionResources: [sessionA], reason: 'cleared' });

		assert.deepStrictEqual({
			afterDispose: service.getFolder(sessionA),
			changes,
		}, {
			afterDispose: undefined,
			changes: [sessionA.toString(), sessionA.toString()],
		});
	});

	test('getDefaultFolder returns the last chosen folder and survives session disposal', () => {
		assert.strictEqual(service.getDefaultFolder(), undefined, 'no default before any choice');

		service.setFolder(sessionA, folderA);
		const afterFirst = service.getDefaultFolder()?.toString();

		service.setFolder(sessionB, folderB);
		const afterSecond = service.getDefaultFolder()?.toString();

		// Disposing a session forgets its per-session choice but keeps the
		// window-level default sticky so a new chat reuses the last folder.
		onDidDisposeSession.fire({ sessionResources: [sessionB], reason: 'cleared' });
		const afterDispose = service.getDefaultFolder()?.toString();

		assert.deepStrictEqual({ afterFirst, afterSecond, afterDispose }, {
			afterFirst: folderA.toString(),
			afterSecond: folderB.toString(),
			afterDispose: folderB.toString(),
		});
	});

	test('getDefaultFolder hides a default not in the workspace and surfaces it once present', () => {
		service.setFolder(sessionA, folderC);
		const whileWorkspaceLacksFolder = service.getDefaultFolder();

		workspaceFolders = [folderA, folderB, folderC];
		const afterFolderAdded = service.getDefaultFolder()?.toString();

		assert.deepStrictEqual({ whileWorkspaceLacksFolder, afterFolderAdded }, {
			whileWorkspaceLacksFolder: undefined,
			afterFolderAdded: folderC.toString(),
		});
	});

	test('clears an explicit selection when its folder is removed from the workspace', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		service.setFolder(sessionA, folderB);
		workspaceFolders = [folderA];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [wsFolder(folderB)], changed: [] });

		assert.deepStrictEqual({
			afterRemoval: service.getFolder(sessionA),
			changes,
		}, {
			afterRemoval: undefined,
			changes: [sessionA.toString(), sessionA.toString()],
		});
	});

	test('leaves the sticky default intact when the selected folder is removed so it resurfaces on re-add', () => {
		service.setFolder(sessionA, folderB);
		workspaceFolders = [folderA];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [wsFolder(folderB)], changed: [] });
		const whileRemoved = service.getDefaultFolder();

		workspaceFolders = [folderA, folderB];
		const afterReadd = service.getDefaultFolder()?.toString();

		assert.deepStrictEqual({ whileRemoved, afterReadd }, {
			whileRemoved: undefined,
			afterReadd: folderB.toString(),
		});
	});

	test('preserves a selection outside the workspace when a different folder is removed', () => {
		const external = URI.file('/external/repo');
		service.setFolder(sessionA, external);
		workspaceFolders = [folderA];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [wsFolder(folderB)], changed: [] });

		assert.strictEqual(service.getFolder(sessionA)?.toString(), external.toString());
	});

	test('resolveNewSessionPrimary applies new-session precedence', () => {
		workspaceFolders = [folderA, folderB, folderC];
		// sessionA has a valid explicit choice; setting it also makes folderB the sticky default.
		service.setFolder(sessionA, folderB);

		const validExplicit = service.resolveNewSessionPrimary(sessionA)?.toString();
		// sessionB has no explicit choice, so it falls back to the sticky default.
		const stickyDefault = service.resolveNewSessionPrimary(sessionB)?.toString();

		// Remove folderB: the explicit choice and the sticky default both become
		// invalid, so it falls back to the first remaining workspace folder.
		workspaceFolders = [folderA, folderC];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [wsFolder(folderB)], changed: [] });
		const firstFolderFallback = service.resolveNewSessionPrimary(sessionA)?.toString();

		// With no folders at all there is nothing to select.
		workspaceFolders = [];
		const noFolders = service.resolveNewSessionPrimary(sessionA);

		assert.deepStrictEqual({ validExplicit, stickyDefault, firstFolderFallback, noFolders }, {
			validExplicit: folderB.toString(),
			stickyDefault: folderB.toString(),
			firstFolderFallback: folderA.toString(),
			noFolders: undefined,
		});
	});

	test('clears a removed selection on a case-sensitive remote even when a case-variant folder remains', () => {
		const repoUpper = URI.parse('vscode-remote://ssh-remote+host/work/Repo');
		const repoLower = URI.parse('vscode-remote://ssh-remote+host/work/repo');
		let remoteFolders = [repoUpper, repoLower];
		const changeEmitter = ds.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const chatSvc = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = Event.None;
		};
		const wsSvc = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = changeEmitter.event;
			override getWorkspace(): IWorkspace {
				return { folders: remoteFolders.map(uri => ({ uri } as IWorkspaceFolder)) } as IWorkspace;
			}
		};
		// A provider-aware, case-sensitive comparator (as IUriIdentityService.extUri
		// resolves for a case-sensitive remote filesystem).
		const caseSensitive = ds.add(new AgentHostNewSessionFolderService(chatSvc, wsSvc, { extUri: new ExtUri(() => false) } as Partial<IUriIdentityService> as IUriIdentityService));

		caseSensitive.setFolder(sessionA, repoUpper);
		remoteFolders = [repoLower];
		changeEmitter.fire({ added: [], removed: [wsFolder(repoUpper)], changed: [] });

		assert.strictEqual(caseSensitive.getFolder(sessionA), undefined, 'the case-distinct sibling must not keep the removed selection alive');
	});
});

suite('computeWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const folderA = URI.file('/repoA');
	const folderB = URI.file('/repoB');
	const folderC = URI.file('/repoC');

	const toStrings = (dirs: readonly URI[] | undefined) => dirs?.map(d => d.toString());

	function rootStateWith(provider: string, multipleWorkingDirectories: boolean): RootState {
		const agent = {
			provider,
			displayName: provider,
			description: '',
			models: [],
			capabilities: multipleWorkingDirectories ? { multipleWorkingDirectories: { immutablePrimary: true } } : {},
		} as AgentInfo;
		return { agents: [agent] } as unknown as RootState;
	}

	const advertised = rootStateWith('copilot', true);

	test('derives the ordered set from the chosen primary (capability advertised)', () => {
		assert.deepStrictEqual({
			noPrimary: toStrings(computeWorkingDirectories(undefined, [folderA, folderB, folderC], advertised, 'copilot')),
			singleFolder: toStrings(computeWorkingDirectories(folderA, [folderA], advertised, 'copilot')),
			primaryFirst: toStrings(computeWorkingDirectories(folderA, [folderA, folderB, folderC], advertised, 'copilot')),
			primaryMiddle: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], advertised, 'copilot')),
			primaryOutsideWorkspace: toStrings(computeWorkingDirectories(folderC, [folderA, folderB], advertised, 'copilot')),
			noWorkspaceFolders: toStrings(computeWorkingDirectories(folderA, [], advertised, 'copilot')),
		}, {
			noPrimary: undefined,
			singleFolder: [folderA.toString()],
			primaryFirst: [folderA.toString(), folderB.toString(), folderC.toString()],
			primaryMiddle: [folderB.toString(), folderA.toString(), folderC.toString()],
			primaryOutsideWorkspace: [folderC.toString()],
			noWorkspaceFolders: [folderA.toString()],
		});
	});

	test('restricts to the primary unless the provider advertises the capability', () => {
		const notAdvertised = rootStateWith('other', false);
		assert.deepStrictEqual({
			// Provider present and does NOT advertise → restrict to primary.
			restricted: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], notAdvertised, 'other')),
			// Provider present and advertises → full ordered set.
			advertised: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], advertised, 'copilot')),
			// Provider absent from the root state → unsupported → primary only.
			providerAbsent: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], advertised, 'missing')),
			// Root state unavailable → unsupported → primary only.
			rootStateUndefined: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], undefined, 'copilot')),
			// Root state errored → unsupported → primary only.
			rootStateError: toStrings(computeWorkingDirectories(folderB, [folderA, folderB, folderC], new Error('boom'), 'copilot')),
		}, {
			restricted: [folderB.toString()],
			advertised: [folderB.toString(), folderA.toString(), folderC.toString()],
			providerAbsent: [folderB.toString()],
			rootStateUndefined: [folderB.toString()],
			rootStateError: [folderB.toString()],
		});
	});

	test('preserves the primary and retained secondary order while applying membership changes', () => {
		assert.deepStrictEqual({
			retainsSecondaryOrder: toStrings(computeDesiredWorkingDirectories(
				folderA,
				[folderA, folderC, folderB],
				[folderB, folderC],
			)),
			removesStaleAndAddsMissing: toStrings(computeDesiredWorkingDirectories(
				folderA,
				[folderA, folderB],
				[folderC],
			)),
			deduplicates: toStrings(computeDesiredWorkingDirectories(
				folderA,
				[folderA, folderB, folderB],
				[folderB, folderC, folderC],
			)),
		}, {
			retainsSecondaryOrder: [folderA.toString(), folderC.toString(), folderB.toString()],
			removesStaleAndAddsMissing: [folderA.toString(), folderC.toString()],
			deduplicates: [folderA.toString(), folderB.toString(), folderC.toString()],
		});
	});
});
