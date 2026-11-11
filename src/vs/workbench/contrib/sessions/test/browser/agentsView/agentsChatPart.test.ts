/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { EditorWindowMainSessionHost } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { IChatViewFactory } from '../../../browser/chatViewFactory.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { INewSessionDraftSlot, ISessionsManagementService } from '../../../common/sessionsManagement.js';

/** An editor group that keeps its editors in memory, as the chat part's groups do, without rendering them. */
class FakeGroup {
	private static nextId = 1;
	readonly id = FakeGroup.nextId++;
	editors: EditorInput[] = [];
	activeEditor: EditorInput | null = null;
	readonly onDidActiveEditorChangeEmitter = new Emitter<void>();
	readonly onDidActiveEditorChange = this.onDidActiveEditorChangeEmitter.event;
	readonly onDidCloseEditorEmitter = new Emitter<void>();
	readonly onDidCloseEditor = this.onDidCloseEditorEmitter.event;
	get isEmpty() { return this.editors.length === 0; }
	contains(editor: EditorInput) { return this.editors.includes(editor); }
	open(editor: EditorInput): void {
		if (!this.editors.includes(editor)) {
			this.editors.push(editor);
		}
		this.activeEditor = editor;
		this.onDidActiveEditorChangeEmitter.fire();
	}
	async closeEditor(editor: EditorInput): Promise<boolean> {
		this.editors = this.editors.filter(candidate => candidate !== editor);
		if (this.activeEditor === editor) {
			this.activeEditor = this.editors.at(-1) ?? null;
		}
		this.onDidCloseEditorEmitter.fire();
		this.onDidActiveEditorChangeEmitter.fire();
		editor.dispose();
		return true;
	}
	focus(): void { }
	dispose(): void {
		this.onDidActiveEditorChangeEmitter.dispose();
		this.onDidCloseEditorEmitter.dispose();
	}
}

/** The editor part of the chat part, with one group, as the chat part creates it. */
function createFakePart(store: DisposableStore): IContentPart & { readonly group: FakeGroup } {
	const group = new FakeGroup();
	store.add(toDisposable(() => group.dispose()));
	return upcastPartial<IContentPart & { readonly group: FakeGroup }>({
		group,
		groups: [group as unknown as IEditorGroup],
		activeGroup: group as unknown as IEditorGroup,
		element: document.createElement('div'),
		onDidAddGroup: Event.None,
		onDidRemoveGroup: Event.None,
		onDidChangeActiveGroup: Event.None,
		onDidChange: Event.None,
		setVisible: () => { },
		forceClose: () => { },
		enforcePartOptions: () => toDisposable(() => { }),
	});
}

suite('AgentsChatPartService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contextKeyService = new MockContextKeyService();
		instantiationService.stub(IContextKeyService, contextKeyService);

		// The chat part, and whether the layout shows it
		const part = createFakePart(store);
		let partVisible = false;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: (candidate: Parts) => candidate === Parts.CHAT_PART && partVisible,
			setPartHidden: (hidden: boolean, candidate: Parts) => {
				if (candidate === Parts.CHAT_PART && partVisible === hidden) {
					partVisible = !hidden;
					onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible: partVisible });
				}
			},
			hasFocus: () => false,
		}));
		instantiationService.stub(IAgentsChatPartFrame, upcastPartial<IAgentsChatPartFrame>({ part: upcastPartial<IAgentsChatPartFrame['part']>({ setContent: () => toDisposable(() => { }) }) }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ createEditorPart: () => part, mainPart: undefined }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: (async (editor: EditorInput, _options: unknown, group: FakeGroup) => { group.open(editor); return undefined; }) as IEditorService['openEditor'],
			openEditors: async () => [],
		}));
		instantiationService.stub(IChatViewFactory, upcastPartial<IChatViewFactory>({}));
		instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({ onDidPaneCompositeOpen: Event.None }));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({ onDidChangeContainerLocation: Event.None, getViewContainerById: () => null }));

		// The sessions, of which each composer holds a slot for the session it creates; the listeners on their events count
		const sessionsChanged = store.add(new Emitter<never>());
		let sessionListeners = 0;
		const countedSessionsChanged: Event<never> = (listener, thisArgs, listenerStore) => {
			sessionListeners++;
			const subscription = sessionsChanged.event(listener, thisArgs);
			const counted = toDisposable(() => { sessionListeners--; subscription.dispose(); });
			if (listenerStore instanceof DisposableStore) {
				listenerStore.add(counted);
			} else if (Array.isArray(listenerStore)) {
				listenerStore.push(counted);
			}
			return counted;
		};
		let liveSlots = 0;
		let nextSlot = 0;
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: countedSessionsChanged,
			onDidAcceptNewSessionRequest: Event.None,
			onDidReplaceNewDraftSession: Event.None,
			getSessions: () => [],
			getSession: () => undefined,
			getSessionForChatResource: () => undefined,
			createNewSessionSlot: () => {
				liveSlots++;
				return upcastPartial<INewSessionDraftSlot & IDisposable>({ id: `slot-${nextSlot++}`, newSession: constObservable(undefined), dispose: () => { liveSlots--; } });
			},
		}));
		instantiationService.stub(ISessionGroupsService, upcastPartial<ISessionGroupsService>({ setDraftSlotGroup: () => toDisposable(() => { }), getGroupOfSession: () => undefined }));

		const host = new EditorWindowMainSessionHost(contextKeyService);
		instantiationService.stub(ISessionHost, host);
		const service = store.add(instantiationService.createInstance(AgentsChatPartService));
		return {
			service,
			part,
			hide: () => instantiationService.get(IWorkbenchLayoutService).setPartHidden(true, Parts.CHAT_PART),
			state: () => ({ tabs: part.group.editors.length, liveSlots, sessionListeners, visible: partVisible }),
		};
	}

	test('a new session reuses the active composer that has not sent its session, so opening and closing the chat part does not add tabs', async () => {
		const { service, hide, state } = createService();

		await service.openComposer(undefined);
		const afterFirst = state();
		for (let index = 0; index < 20; index++) {
			hide();
			await service.show(undefined);
			await service.openComposer(undefined);
		}

		assert.deepStrictEqual({ afterFirst, afterCycles: state() }, {
			afterFirst: { tabs: 1, liveSlots: 1, sessionListeners: afterFirst.sessionListeners, visible: true },
			afterCycles: { tabs: 1, liveSlots: 1, sessionListeners: afterFirst.sessionListeners, visible: true },
		});
	});

	test('closing the tab of a composer releases it: opening and closing composers keeps nothing', async () => {
		const { service, part, state } = createService();
		const baseline = state().sessionListeners;

		for (let index = 0; index < 20; index++) {
			await service.openComposer(undefined);
			const input = part.group.activeEditor!;
			await part.group.closeEditor(input);
		}

		assert.deepStrictEqual(state(), { tabs: 0, liveSlots: 0, sessionListeners: baseline, visible: false });
	});
});
