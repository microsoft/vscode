/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MultiDiffEditorViewModel } from '../../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { MultiDiffEditorWidget } from '../../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DiffEditorViewMode } from '../../../../../../editor/common/config/editorOptions.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDiffEditorOptionsService, SessionsWordWrap } from '../../../../../services/editor/common/diffEditorOptionsService.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { IChat, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { MultiDiffEditorFileList } from '../../../../multiDiffEditor/browser/multiDiffEditorFileList.js';
import { MultiDiffEditorWithFileListWidget } from '../../../../multiDiffEditor/browser/multiDiffEditorWithFileListWidget.js';
import { CreatePullRequestContextView } from '../../../../sessionChanges/browser/createPullRequestContextView.js';
import { IChatPetService } from '../../../../chat/browser/chatPetService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionChangesEditor } from '../../../../sessionChanges/browser/sessionChangesEditor.js';
import { ISessionChangesService } from '../../../../sessionChanges/browser/sessionChangesService.js';
import { AgentsChatPartChangesEditorHeader } from '../../../browser/agentsView/agentsChatPartChangesEditorHeader.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { IChangesViewService } from '../../../common/changesViewService.js';
import { stubSessionHosts, TestShown } from '../sessionHostTestUtils.js';

suite('AgentsChatPartChangesEditorHeader', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// An Agent Host session, whose operations the actions bar of the header builds from its changeset; a quick chat, which needs
	// no folders mounted for them
	const session = upcastPartial<ISession>({ resource: URI.parse('agents:/session'), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, status: constObservable(SessionStatus.Completed), isQuickChat: constObservable(true) });
	const chat = upcastPartial<IChat>({ resource: URI.parse('agents:/session/chat') });
	const changeset = (id: string, label: string) => upcastPartial<ISessionChangeset>({ id, label, isEnabled: constObservable(true), isDefault: constObservable(id === 'branch') });
	const operation = (id: string, label: string) => upcastPartial<ISessionChangesetOperation>({ id, label, scopes: [SessionChangesetOperationScope.Changeset] });

	/**
	 * A Changes editor of the session the main window shows, in a host whose editor groups have no sessions header row
	 * (`ownHeader`, as an editor window) or have one (as the Agents window), with the chat part's picker registered or not.
	 */
	function createChangesEditor(options: { readonly ownHeader: boolean; readonly chatPart: boolean; readonly aiEnabled: boolean }) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const parent = append(mainWindow.document.body, $('.editor-instance'));
		store.add(toDisposable(() => parent.remove()));
		const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
		const aiEnabled = ChatContextKeys.enabled.bindTo(contextKeyService);
		aiEnabled.set(options.aiEnabled);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));

		// The pickers its header toolbar creates
		const pickers: IActionViewItem[] = [];
		const providers = new Map<string, IActionViewItemFactory>();
		const keyOf = (menu: MenuId, id: string | MenuId) => `${menu.id}/${typeof id === 'string' ? id : id.id}`;
		instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({
			onDidChange: Event.None,
			register: (menu: MenuId, id: string | MenuId, provider: IActionViewItemFactory) => {
				providers.set(keyOf(menu, id), provider);
				return toDisposable(() => providers.delete(keyOf(menu, id)));
			},
			lookUp: (menu: MenuId, id: string | MenuId) => {
				const provider = providers.get(keyOf(menu, id));
				return provider && ((...args: Parameters<IActionViewItemFactory>) => {
					const item = provider(...args);
					if (item) {
						pickers.push(item);
					}
					return item;
				});
			},
		}));
		const shown: { items: readonly IActionListItem<unknown>[]; delegate: IActionListDelegate<unknown> }[] = [];
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: <T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
				shown.push({ items, delegate: delegate as IActionListDelegate<unknown> });
			},
			hide: () => { },
		}));

		const selected = observableValue<ISessionChangeset | undefined>('selected', changeset('branch', 'Branch Changes'));
		const switched: { changeset: string | undefined; session: string | undefined; chat: string | undefined }[] = [];
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = constObservable(session.resource);
			override readonly activeSessionHasGitRepositoryObs = constObservable(true);
			override readonly activeSessionChangesetsObs = constObservable([changeset('branch', 'Branch Changes'), changeset('session', 'Session Changes')]);
			override readonly activeSessionChangesetObs = selected;
			override readonly activeSessionChangesetsLoadingObs = constObservable(false);
			override readonly activeSessionChangesetLoadingObs = constObservable(false);
			override readonly activeSessionChangesSummaryObs = constObservable(undefined);
			override readonly activeSessionChangesObs = constObservable([]);
			override readonly activeSessionLoadingObs = constObservable(false);
			override readonly activeSessionChangesetOperationsObs = constObservable([operation('commit', 'Commit'), operation('push', 'Push')]);
			override readonly activeSessionStateObs = constObservable(undefined);
			override setChangesetId(id: string | undefined, forSession?: ISession, forChat?: IChat): void {
				switched.push({ changeset: id, session: forSession?.resource.toString(), chat: forChat?.resource.toString() });
			}
		}());
		const activeSession = constObservable<TestShown | undefined>({ session, chat });
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly windowSessions = constObservable([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(ISessionsHostLayoutService, upcastPartial<ISessionsHostLayoutService>({ agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, sessionEditorsShowOwnHeader: options.ownHeader || undefined }));
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const diffWidget = {
			viewModel: observableValue<MultiDiffEditorViewModel | undefined>('viewModel', undefined),
			onDidChangeActiveControl: Event.None,
			setPaddingBottom() { },
			setVariant() { },
			setDiffLayoutOptions() { },
			layout() { },
			dispose() { },
		};
		instantiationService.stubInstance(MultiDiffEditorWidget, diffWidget);
		instantiationService.stubInstance(MultiDiffEditorWithFileListWidget, {
			multiDiffEditorWidget: diffWidget as unknown as MultiDiffEditorWidget,
			isFileListVisible: observableValue('fileListVisible', false),
			layout() { },
			dispose() { },
		});
		instantiationService.stubInstance(MultiDiffEditorFileList, { layout() { }, dispose() { } });
		instantiationService.stub(IChatPetService, new class extends mock<IChatPetService>() { }());
		instantiationService.stubInstance(CreatePullRequestContextView, { close() { }, dispose() { } });

		if (options.chatPart) {
			store.add(instantiationService.createInstance(AgentsChatPartChangesEditorHeader));
		}
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);

		// Opens the picker, and picks the changeset labelled `label`
		const pick = (label: string) => {
			const picker = pickers.find(item => item instanceof ActionWidgetDropdownActionViewItem) as ActionWidgetDropdownActionViewItem | undefined;
			picker?.show();
			const item = shown.at(-1)?.items.find(candidate => candidate.label === label);
			if (item?.item) {
				shown.at(-1)!.delegate.onSelect(item.item, false);
			}
		};
		const snapshot = () => {
			const header = parent.querySelector<HTMLElement>('.session-changes-editor-header');
			return {
				header: !!header && header.style.display !== 'none',
				picker: parent.querySelector('.session-changes-editor-header-left .changes-picker-label')?.textContent,
				operations: [...parent.querySelectorAll('.session-changes-editor-header-right .monaco-button')].map(button => button.textContent),
			};
		};
		return { pick, snapshot, switched, setAiEnabled: (enabled: boolean) => aiEnabled.set(enabled) };
	}

	test('the Changes editor of the chat part of an editor window shows the picker of its changesets in a header row of its own, which switches the changeset of its session', () => {
		const changesEditor = createChangesEditor({ ownHeader: true, chatPart: true, aiEnabled: true });
		const before = changesEditor.snapshot();
		changesEditor.pick('Session Changes');

		assert.deepStrictEqual({ before, switched: changesEditor.switched }, {
			// Commit, with Push in the dropdown beside it
			before: { header: true, picker: 'Branch Changes', operations: ['Commit', ''] },
			switched: [{ changeset: 'session', session: session.resource.toString(), chat: chat.resource.toString() }],
		});
	});

	test('the header, with its picker and the operations on the changes, shows only while AI features are enabled, also as they change while it is open', () => {
		const changesEditor = createChangesEditor({ ownHeader: true, chatPart: true, aiEnabled: true });
		const enabled = changesEditor.snapshot();
		changesEditor.setAiEnabled(false);
		const disabledWhileOpen = changesEditor.snapshot();
		changesEditor.setAiEnabled(true);
		const enabledAgain = changesEditor.snapshot();

		const shown = { header: true, picker: 'Branch Changes', operations: ['Commit', ''] };
		const none = { header: false, picker: undefined, operations: [] };
		assert.deepStrictEqual({
			enabled,
			disabledWhileOpen,
			enabledAgain,
			disabledAtCreation: createChangesEditor({ ownHeader: true, chatPart: true, aiEnabled: false }).snapshot(),
		}, { enabled: shown, disabledWhileOpen: none, enabledAgain: shown, disabledAtCreation: none });
	});

	test('a host whose editor groups have the sessions header row, as the Agents window, keeps the header of the Changes editor there', () => {
		assert.deepStrictEqual(createChangesEditor({ ownHeader: false, chatPart: false, aiEnabled: true }).snapshot(), { header: false, picker: undefined, operations: [] });
	});
});
