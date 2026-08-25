/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionFileChange, ISessionFolder, ISessionTurnFileChange, ISessionWorkspace, TURN_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { SessionsChatResponseFileChangesService } from '../../browser/sessionTurnChanges.js';

suite('SessionTurnChanges', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('activates the session and selects Last Turn Changes from the live input pill', () => {
		const chatResource = URI.parse('chat:session');
		const lastTurnChanges = observableValue<readonly ISessionTurnFileChange[]>('lastTurnChanges', [{
			uri: URI.file('/workspace/first.ts'),
			originalUri: URI.parse('agenthost:/snapshots/first-before'),
			modifiedUri: URI.file('/workspace/first.ts'),
			insertions: 1,
			deletions: 0,
			isOutsideWorkspace: false,
		}]);
		const chat = upcastPartial<IChat>({
			resource: chatResource,
			updatedAt: constObservable(new Date('2026-08-13T10:00:00Z')),
			lastTurnChanges,
		});
		const session = upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host:session'),
			providerId: 'local-agent-host',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const calls: object[] = [];
		let selectedChanges: IObservable<readonly ISessionFileChange[]> | undefined;
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource() {
				return { session, chat };
			}
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
			override showSession(sessionResource: URI, options?: { preserveFocus?: boolean }): void {
				calls.push({ showSession: sessionResource.toString(), preserveFocus: options?.preserveFocus });
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions): Promise<undefined> {
				const selection = options?.changesetSelection;
				calls.push({
					openChangesEditor: sessionResource.toString(),
					changesetId: selection?.kind === 'transient' ? selection.changeset.id : selection?.id,
				});
				selectedChanges = selection?.kind === 'transient' ? selection.changeset.changes : undefined;
				return undefined;
			}
		}();
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override revealEditorPartExplicitly(): void {
				calls.push({ revealEditorPartExplicitly: true });
			}
		}();
		const service = disposables.add(new SessionsChatResponseFileChangesService(
			new class extends mock<IEditorService>() { }(),
			sessionsManagementService,
			sessionsService,
			sessionChangesService,
			layoutService,
		));

		service.openChangesForRequest(chatResource, undefined, { isLastTurn: true });
		lastTurnChanges.set([{
			uri: URI.file('/workspace/second.ts'),
			modifiedUri: URI.file('/workspace/second.ts'),
			insertions: 2,
			deletions: 1,
			isOutsideWorkspace: false,
		}], undefined);

		assert.deepStrictEqual({
			calls,
			selectedChanges: selectedChanges?.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : undefined),
		}, {
			calls: [
				{ showSession: session.resource.toString(), preserveFocus: true },
				{ revealEditorPartExplicitly: true },
				{ openChangesEditor: session.resource.toString(), changesetId: TURN_CHANGES_CHANGESET_ID },
			],
			selectedChanges: undefined,
		});
	});

	test('opens exact historical request changes as a transient changeset', () => {
		const workspaceFolder = URI.file('/workspace');
		const session = upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host:session'),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [upcastPartial<ISessionFolder>({
					root: workspaceFolder,
					workingDirectory: workspaceFolder,
				})],
			})),
		});
		const chatResource = URI.parse('chat:session');
		const calls: object[] = [];
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource() {
				return { session, chat: upcastPartial<IChat>({ resource: chatResource }) };
			}
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(session);
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions): Promise<undefined> {
				const selection = options?.changesetSelection;
				if (selection?.kind === 'transient') {
					calls.push({
						sessionResource: sessionResource.toString(),
						changeset: {
							id: selection.changeset.id,
							label: selection.changeset.label,
							changes: selection.changeset.changes.get().map(change => ({
								uri: isIChatSessionFileChange2(change) ? change.uri.toString() : undefined,
								originalUri: change.originalUri?.toString(),
								modifiedUri: change.modifiedUri?.toString(),
								insertions: change.insertions,
								deletions: change.deletions,
							})),
							operations: selection.changeset.operations.get(),
						},
					});
				}
				return undefined;
			}
		}();
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override revealEditorPartExplicitly(): void {
				calls.push({ revealEditorPartExplicitly: true });
			}
		}();
		const service = disposables.add(new SessionsChatResponseFileChangesService(
			new class extends mock<IEditorService>() { }(),
			sessionsManagementService,
			sessionsService,
			sessionChangesService,
			layoutService,
		));
		disposables.add(service.registerProvider('chat', {
			getChangesForRequest: () => constObservable([{
				originalURI: URI.parse('agenthost:/snapshots/before'),
				modifiedURI: URI.file('/workspace/file.ts'),
				modifiedSnapshotURI: URI.parse('agenthost:/snapshots/after'),
				added: 4,
				removed: 2,
				quitEarly: false,
				identical: false,
				isFinal: true,
				isBusy: false,
			}, {
				originalURI: URI.parse('agenthost:/snapshots/deleted-before'),
				modifiedURI: URI.file('/workspace/deleted.ts'),
				isDeleted: true,
				added: 0,
				removed: 3,
				quitEarly: false,
				identical: false,
				isFinal: true,
				isBusy: false,
			}, {
				originalURI: URI.parse('agenthost:/snapshots/outside-before'),
				modifiedURI: URI.file('/outside/ignored.ts'),
				added: 1,
				removed: 1,
				quitEarly: false,
				identical: false,
				isFinal: true,
				isBusy: false,
			}]),
		}));

		service.openChangesForRequest(chatResource, 'request', { isLastTurn: false });

		assert.deepStrictEqual(calls, [
			{ revealEditorPartExplicitly: true },
			{
				sessionResource: 'agent-host:session',
				changeset: {
					id: 'turn:request',
					label: 'Turn Changes',
					changes: [{
						uri: 'file:///workspace/file.ts',
						originalUri: 'agenthost:/snapshots/before',
						modifiedUri: 'agenthost:/snapshots/after',
						insertions: 4,
						deletions: 2,
					}, {
						uri: 'file:///workspace/deleted.ts',
						originalUri: 'agenthost:/snapshots/deleted-before',
						modifiedUri: undefined,
						insertions: 0,
						deletions: 3,
					}],
					operations: [],
				},
			},
		]);
	});

	test('routes latest and historical response changes to their respective selections', () => {
		const chatResource = URI.parse('chat:session');
		const chat = upcastPartial<IChat>({
			resource: chatResource,
			updatedAt: constObservable(new Date('2026-08-13T10:00:00Z')),
		});
		const session = upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host:session'),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const selections: string[] = [];
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource() {
				return { session, chat };
			}
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(session);
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(_sessionResource: URI, options?: ISessionChangesEditorOptions): Promise<undefined> {
				const selection = options?.changesetSelection;
				if (selection) {
					selections.push(selection.kind === 'transient' ? selection.changeset.id : selection.id ?? '');
				}
				return undefined;
			}
		}();
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override revealEditorPartExplicitly(): void { }
		}();
		const service = disposables.add(new SessionsChatResponseFileChangesService(
			new class extends mock<IEditorService>() { }(),
			sessionsManagementService,
			sessionsService,
			sessionChangesService,
			layoutService,
		));
		disposables.add(service.registerProvider('chat', {
			getChangesForRequest: () => constObservable([]),
		}));

		service.openChangesForRequest(chatResource, 'historical', { isLastTurn: false });
		service.openChangesForRequest(chatResource, 'latest', { isLastTurn: true });

		assert.deepStrictEqual(selections, ['turn:historical', TURN_CHANGES_CHANGESET_ID]);
	});

	test('opens chat-specific last-turn changes when another chat is more recent', () => {
		const chatResource = URI.parse('chat:older');
		const chat = upcastPartial<IChat>({
			resource: chatResource,
			updatedAt: constObservable(new Date('2026-08-13T10:00:00Z')),
			lastTurnChanges: constObservable([{
				uri: URI.file('/workspace/input.ts'),
				originalUri: URI.parse('agenthost:/snapshots/input-before'),
				modifiedUri: URI.file('/workspace/input.ts'),
				insertions: 2,
				deletions: 1,
				isOutsideWorkspace: false,
			}]),
		});
		const newerChat = upcastPartial<IChat>({
			resource: URI.parse('chat:newer'),
			updatedAt: constObservable(new Date('2026-08-13T11:00:00Z')),
		});
		const workspaceFolder = URI.file('/workspace');
		const session = upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host:session'),
			providerId: 'local-agent-host',
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [upcastPartial<ISessionFolder>({
					root: workspaceFolder,
					workingDirectory: workspaceFolder,
				})],
			})),
			chats: constObservable([chat, newerChat]),
			mainChat: constObservable(chat),
		});
		const selections: object[] = [];
		const service = disposables.add(new SessionsChatResponseFileChangesService(
			new class extends mock<IEditorService>() { }(),
			new class extends mock<ISessionsManagementService>() {
				override getSessionForChatResource() {
					return { session, chat };
				}
			}(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(session);
			}(),
			new class extends mock<ISessionChangesService>() {
				override async openChangesEditor(_sessionResource: URI, options?: ISessionChangesEditorOptions): Promise<undefined> {
					const selection = options?.changesetSelection;
					if (selection) {
						selections.push({
							id: selection.kind === 'transient' ? selection.changeset.id : selection.id,
							label: selection.kind === 'transient' ? selection.changeset.label : undefined,
							uris: selection.kind === 'transient'
								? selection.changeset.changes.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : undefined)
								: undefined,
						});
					}
					return undefined;
				}
			}(),
			new class extends mock<IAgentWorkbenchLayoutService>() {
				override revealEditorPartExplicitly(): void { }
			}(),
		));
		disposables.add(service.registerProvider('chat', {
			getChangesForRequest: () => constObservable([{
				originalURI: URI.parse('agenthost:/snapshots/response-before'),
				modifiedURI: URI.file('/workspace/response.ts'),
				added: 1,
				removed: 0,
				quitEarly: false,
				identical: false,
				isFinal: true,
				isBusy: false,
			}]),
		}));

		service.openChangesForRequest(chatResource, 'request', { isLastTurn: true });
		service.openChangesForRequest(chatResource, undefined, { isLastTurn: true });

		assert.deepStrictEqual(selections, [{
			id: 'turn:request',
			label: 'Turn Changes',
			uris: ['file:///workspace/response.ts'],
		}, {
			id: TURN_CHANGES_CHANGESET_ID,
			label: undefined,
			uris: undefined,
		}]);
	});

	test('falls back to a standalone multi-diff for non-Agents sessions', () => {
		let openCount = 0;
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(): Promise<undefined> {
				openCount++;
				return undefined;
			}
		}();
		const service = disposables.add(new SessionsChatResponseFileChangesService(
			editorService,
			new class extends mock<ISessionsManagementService>() {
				override getSessionForChatResource() {
					return undefined;
				}
			}(),
			new class extends mock<ISessionsService>() { }(),
			new class extends mock<ISessionChangesService>() { }(),
			new class extends mock<IAgentWorkbenchLayoutService>() { }(),
		));
		disposables.add(service.registerProvider('test', {
			getChangesForRequest: () => constObservable([{
				originalURI: URI.file('/before.ts'),
				modifiedURI: URI.file('/after.ts'),
				added: 1,
				removed: 0,
				quitEarly: false,
				identical: false,
				isFinal: true,
				isBusy: false,
			}]),
		}));

		service.openChangesForRequest(URI.parse('test:session'), 'request', { isLastTurn: false });

		assert.strictEqual(openCount, 1);
	});
});
