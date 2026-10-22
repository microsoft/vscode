/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { NEW_CHANGES_TAB_COMMAND_ID } from '../../../editor/browser/addTabActions.js';
import { SessionActivityBarActivityService } from '../../../../services/activity/common/sessionActivityBarActivityService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionChangesSummary, ISessionFileChange, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChangesActivityContribution, hasNewChanges, MAX_SEEN_CHANGES_CHATS, SeenChangesStore } from '../../browser/changesActivity.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';

suite('Sessions - Changes Activity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const stats = (files: number, insertions = files, deletions = 0) => ({ files, insertions, deletions });

	test('reports changes as new only when they differ from seen changes', () => {
		assert.deepStrictEqual({
			neverSeen: hasNewChanges(stats(2), undefined),
			unchanged: hasNewChanges(stats(2, 5, 1), stats(2, 5, 1)),
			moreLines: hasNewChanges(stats(2, 6, 1), stats(2, 5, 1)),
			fromNoChanges: hasNewChanges(stats(1), stats(0)),
			noChanges: hasNewChanges(stats(0), stats(2)),
		}, {
			neverSeen: false,
			unchanged: false,
			moreLines: true,
			fromNoChanges: true,
			noChanges: false,
		});
	});

	test('persists seen changes in batches and evicts the least recently seen chat', () => {
		const storageService = store.add(new TestStorageService());
		const seen = new SeenChangesStore(storageService);
		for (let i = 0; i <= MAX_SEEN_CHANGES_CHATS; i++) {
			seen.set(`chat${i}`, stats(i));
		}
		// Seeing chat1 again keeps it over chat2.
		seen.set('chat1', stats(7));
		seen.set('overflow', stats(3));
		const persistedBeforeFlush = storageService.get('sessions.changesActivity.seenChanges', StorageScope.APPLICATION);
		seen.dispose();

		const restored = store.add(new SeenChangesStore(storageService));
		assert.deepStrictEqual({ persistedBeforeFlush, restored: ['chat0', 'chat1', 'chat2', 'overflow'].map(chat => restored.get(chat, undefined)) }, {
			persistedBeforeFlush: undefined,
			restored: [undefined, stats(7), undefined, stats(3)],
		});
	});
});

suite('Sessions - Changes Activity Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('test-session:/session');
	const changesEditorResource = URI.parse('changes-multi-diff-source:/session');
	const fileChange = (insertions: number) => ({ modifiedUri: URI.file('/repo/file.ts'), insertions, deletions: 0 });

	function createHarness(options: { changes?: readonly ISessionFileChange[]; summary?: ISessionChangesSummary } = {}) {
		const changes = observableValue<readonly ISessionFileChange[]>('changes', options.changes ?? []);
		const sessionSummary = observableValue<ISessionChangesSummary | undefined>('summary', options.summary);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('test-chat:/main'),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([]),
			changes,
		});
		const session = upcastPartial<IActiveSession>({
			resource: sessionResource,
			sessionId: 'provider:session',
			activeChat: constObservable(chat),
			mainChat: constObservable(chat),
			changesSummary: sessionSummary,
		});

		const mainGroup = upcastPartial<IEditorGroup>({ id: 1 });
		const auxiliaryWindowGroup = upcastPartial<IEditorGroup>({ id: 2 });
		const changesEditor = upcastPartial<EditorInput>({ resource: changesEditorResource });
		let visibleEditorPanes: readonly IVisibleEditorPane[] = [];
		const onDidVisibleEditorsChange = store.add(new Emitter<void>());
		let sidePaneVisible = true;
		const onDidChangePartVisibility = store.add(new Emitter<void>());

		const activityService = store.add(new SessionActivityBarActivityService());
		store.add(new ChangesActivityContribution(
			upcastPartial<IAgentWorkbenchLayoutService>({
				agentWorkbenchLayout: AgentWorkbenchLayout.Desktop,
				onDidChangePartVisibility: onDidChangePartVisibility.event as Event<never>,
				onDidToggleSidePane: Event.None,
				isSidePaneVisible: () => sidePaneVisible,
			}),
			upcastPartial<ISessionsService>({ activeSession: constObservable(session) }),
			upcastPartial<ISessionChangesService>({ getSessionResource: resource => resource.toString() === changesEditorResource.toString() ? sessionResource : undefined }),
			upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }),
			upcastPartial<IEditorService>({
				onDidVisibleEditorsChange: onDidVisibleEditorsChange.event as Event<never>,
				get visibleEditorPanes() { return visibleEditorPanes; },
			}),
			upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ getGroup: (id: number) => id === mainGroup.id ? mainGroup : undefined }) }),
			store.add(new TestStorageService()),
			activityService,
			upcastPartial<IActionViewItemService>({ register: () => Disposable.None }),
		));

		return {
			badge: () => activityService.getActivity(NEW_CHANGES_TAB_COMMAND_ID).length > 0,
			setChanges: (value: readonly ISessionFileChange[]) => changes.set(value, undefined),
			resolveSummary: (value: readonly ISessionFileChange[]) => transaction(tx => {
				sessionSummary.set(undefined, tx);
				changes.set(value, tx);
			}),
			showChangesEditor: (where: 'main' | 'auxiliaryWindow' | undefined) => {
				visibleEditorPanes = where ? [upcastPartial<IVisibleEditorPane>({ input: changesEditor, group: where === 'main' ? mainGroup : auxiliaryWindowGroup })] : [];
				onDidVisibleEditorsChange.fire();
			},
			setSidePaneVisible: (visible: boolean) => {
				sidePaneVisible = visible;
				onDidChangePartVisibility.fire();
			},
		};
	}

	test('badges changes made while the Changes tab is not shown, until it is shown', () => {
		const harness = createHarness();
		const steps: Record<string, boolean> = {};

		steps.baseline = harness.badge();
		harness.setChanges([fileChange(1)]);
		steps.newChanges = harness.badge();
		// The Changes tab can show only its file list while the editor part is hidden; that is still seeing the changes.
		harness.showChangesEditor('main');
		steps.shownInSidePane = harness.badge();
		harness.setChanges([fileChange(2)]);
		steps.changedWhileShown = harness.badge();
		harness.setSidePaneVisible(false);
		harness.setChanges([fileChange(3)]);
		steps.changedWhileSidePaneClosed = harness.badge();
		harness.showChangesEditor('auxiliaryWindow');
		steps.shownInAuxiliaryWindow = harness.badge();

		assert.deepStrictEqual(steps, {
			baseline: false,
			newChanges: true,
			shownInSidePane: false,
			changedWhileShown: false,
			changedWhileSidePaneClosed: true,
			shownInAuxiliaryWindow: false,
		});
	});

	test('does not badge changes that load after only their summary was known', () => {
		const harness = createHarness({ summary: { files: 1, additions: 4, deletions: 0 } });

		const whileOnlySummaryKnown = harness.badge();
		// Like the Copilot provider, the file list replaces the summary in one update.
		harness.resolveSummary([fileChange(4)]);

		assert.deepStrictEqual({ whileOnlySummaryKnown, afterFilesLoaded: harness.badge() }, { whileOnlySummaryKnown: false, afterFilesLoaded: false });
	});
});
