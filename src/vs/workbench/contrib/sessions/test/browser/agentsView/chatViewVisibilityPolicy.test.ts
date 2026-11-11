/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../../common/views.js';
import { IPaneComposite } from '../../../../../common/panecomposite.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { ChatViewContainerId } from '../../../../chat/browser/chat.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatViewVisibilityPolicy } from '../../../browser/agentsView/chatViewVisibilityPolicy.js';

suite('ChatViewVisibilityPolicy', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IWindow {
		readonly visible: Set<Parts>;
		readonly active: Map<ViewContainerLocation, string>;
		chatLocation: ViewContainerLocation;
		readonly opened: string[];
		readonly storage: InMemoryStorageService;
		setHidden(hidden: boolean, part: Parts): void;
		/** The user opens a view container, as through its view's command. */
		open(id: string, location: ViewContainerLocation): void;
		moveChatView(location: ViewContainerLocation): void;
		/** A policy of the window, such as after a reload. */
		createPolicy(): ChatViewVisibilityPolicy;
	}

	function createWindow(storage = disposables.add(new InMemoryStorageService())): IWindow {
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const onDidPaneCompositeOpen = disposables.add(new Emitter<{ composite: IPaneComposite; viewContainerLocation: ViewContainerLocation }>());
		const onDidChangeContainerLocation = disposables.add(new Emitter<{ viewContainer: ViewContainer; from: ViewContainerLocation; to: ViewContainerLocation }>());
		const chatContainer = upcastPartial<ViewContainer>({ id: ChatViewContainerId });
		const window: IWindow = {
			visible: new Set([Parts.EDITOR_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART]),
			active: new Map([[ViewContainerLocation.AuxiliaryBar, ChatViewContainerId], [ViewContainerLocation.Panel, 'workbench.panel.terminal']]),
			chatLocation: ViewContainerLocation.AuxiliaryBar,
			opened: [],
			storage,
			setHidden(hidden, part) {
				if (hidden ? window.visible.delete(part) : !window.visible.has(part) && !!window.visible.add(part)) {
					onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
				}
			},
			open(id, location) {
				window.active.set(location, id);
				onDidPaneCompositeOpen.fire({ composite: upcastPartial<IPaneComposite>({ getId: () => id }), viewContainerLocation: location });
			},
			moveChatView(location) {
				const from = window.chatLocation;
				window.chatLocation = location;
				onDidChangeContainerLocation.fire({ viewContainer: chatContainer, from, to: location });
			},
			createPolicy: () => disposables.add(new ChatViewVisibilityPolicy(() => 1, layoutService, paneCompositeService, viewDescriptorService, storage, NullTelemetryService)),
		};
		const layoutService = upcastPartial<IWorkbenchLayoutService>({
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: (part: Parts) => window.visible.has(part),
			setPartHidden: (hidden: boolean, part: Parts) => window.setHidden(hidden, part),
			setAuxiliaryBarMaximized: () => false,
		});
		const paneCompositeService = upcastPartial<IPaneCompositePartService>({
			onDidPaneCompositeOpen: onDidPaneCompositeOpen.event,
			getActivePaneComposite: (location: ViewContainerLocation) => {
				const id = window.active.get(location);
				return id ? upcastPartial<IPaneComposite>({ getId: () => id }) : undefined;
			},
			openPaneComposite: async (id: string | undefined, location: ViewContainerLocation) => {
				window.opened.push(`${id}@${location}`);
				window.open(id!, location);
				return undefined;
			},
		});
		const viewDescriptorService = upcastPartial<IViewDescriptorService>({
			onDidChangeContainerLocation: onDidChangeContainerLocation.event,
			getViewContainerById: (id: string) => id === ChatViewContainerId ? chatContainer : null,
			getViewContainerLocation: () => window.chatLocation,
		});
		return window;
	}

	const flush = () => new Promise<void>(resolve => setTimeout(resolve));

	/** Opens the chat part, lets `whileOpen` act, then closes it: what shows of the Secondary Side Bar and the panel at each step. */
	async function run(window: IWindow, whileOpen?: () => void) {
		const parts = () => ({ auxiliaryBar: window.visible.has(Parts.AUXILIARYBAR_PART), panel: window.visible.has(Parts.PANEL_PART) });
		window.setHidden(false, Parts.CHAT_PART);
		const open = parts();
		whileOpen?.();
		window.setHidden(true, Parts.CHAT_PART);
		await flush();
		return { open, closed: parts(), opened: window.opened };
	}

	test('hides the Chat view the Secondary Side Bar shows while the chat part shows, and shows it again without focus as it closes', async () => {
		const window = createWindow();
		window.createPolicy();
		assert.deepStrictEqual(await run(window), {
			open: { auxiliaryBar: false, panel: false },
			closed: { auxiliaryBar: true, panel: false },
			opened: [`${ChatViewContainerId}@${ViewContainerLocation.AuxiliaryBar}`],
		});
	});

	test('hides and shows again the panel when it shows the Chat view', async () => {
		const window = createWindow();
		window.visible.add(Parts.PANEL_PART);
		window.chatLocation = ViewContainerLocation.Panel;
		window.active.set(ViewContainerLocation.Panel, ChatViewContainerId);
		window.active.set(ViewContainerLocation.AuxiliaryBar, 'workbench.view.outline');
		window.createPolicy();
		assert.deepStrictEqual(await run(window), {
			open: { auxiliaryBar: true, panel: false },
			closed: { auxiliaryBar: true, panel: true },
			opened: [`${ChatViewContainerId}@${ViewContainerLocation.Panel}`],
		});
	});

	test('leaves the Secondary Side Bar as it is when it shows another view, or the Chat view is in the Primary Side Bar', async () => {
		const otherView = createWindow();
		otherView.active.set(ViewContainerLocation.AuxiliaryBar, 'workbench.view.outline');
		otherView.createPolicy();
		const inSideBar = createWindow();
		inSideBar.chatLocation = ViewContainerLocation.Sidebar;
		inSideBar.createPolicy();
		assert.deepStrictEqual({ otherView: await run(otherView), inSideBar: await run(inSideBar) }, {
			otherView: { open: { auxiliaryBar: true, panel: false }, closed: { auxiliaryBar: true, panel: false }, opened: [] },
			inSideBar: { open: { auxiliaryBar: true, panel: false }, closed: { auxiliaryBar: true, panel: false }, opened: [] },
		});
	});

	test('leaves the Chat view to the user once they show it, open it or move it while the chat part shows', async () => {
		const shown = createWindow();
		shown.createPolicy();
		const opened = createWindow();
		opened.createPolicy();
		const moved = createWindow();
		moved.createPolicy();
		assert.deepStrictEqual({
			shown: await run(shown, () => {
				shown.setHidden(false, Parts.AUXILIARYBAR_PART);
				shown.setHidden(true, Parts.AUXILIARYBAR_PART);
			}),
			opened: await run(opened, () => opened.open(ChatViewContainerId, ViewContainerLocation.Panel)),
			moved: await run(moved, () => moved.moveChatView(ViewContainerLocation.Panel)),
		}, {
			shown: { open: { auxiliaryBar: false, panel: false }, closed: { auxiliaryBar: false, panel: false }, opened: [] },
			opened: { open: { auxiliaryBar: false, panel: false }, closed: { auxiliaryBar: false, panel: false }, opened: [] },
			moved: { open: { auxiliaryBar: false, panel: false }, closed: { auxiliaryBar: false, panel: false }, opened: [] },
		});
	});

	test('shows the Chat view it hid again after a reload, as the chat part closes then', async () => {
		const window = createWindow();
		window.createPolicy();
		window.setHidden(false, Parts.CHAT_PART);
		// The window reloads with the chat part shown and the Secondary Side Bar hidden
		const reloaded = createWindow(window.storage);
		reloaded.visible.delete(Parts.AUXILIARYBAR_PART);
		reloaded.visible.add(Parts.CHAT_PART);
		reloaded.createPolicy();
		reloaded.setHidden(true, Parts.CHAT_PART);
		await flush();
		assert.deepStrictEqual({ auxiliaryBar: reloaded.visible.has(Parts.AUXILIARYBAR_PART), opened: reloaded.opened }, {
			auxiliaryBar: true,
			opened: [`${ChatViewContainerId}@${ViewContainerLocation.AuxiliaryBar}`],
		});
	});
});
