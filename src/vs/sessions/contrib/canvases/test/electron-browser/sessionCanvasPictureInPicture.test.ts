/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorIdentifier } from '../../../../../workbench/browser/dnd.js';
import { IEditorGroupView } from '../../../../../workbench/browser/parts/editor/editor.js';
import { IBrowserViewModel } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { CanvasInput, CanvasPictureInPictureEnabledSettingId, ICanvas, ICanvasContextService, ICanvasDetachedPresentation, ICanvasOwner, ICanvasReference, ICanvasService, ICanvasWorkingSetState } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { FOCUS_ACTIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CanvasPictureInPictureActive, SessionCanvasPictureInPictureService } from '../../electron-browser/sessionCanvasPictureInPicture.js';

suite('SessionCanvasPictureInPictureService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const reference: ICanvasReference = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner'), canvas: URI.parse('canvas:/preview') };

	/**
	 * A 1000×700 Agents Window whose canvas group occupies its right 400 pixels below a 35 pixel tab strip.
	 * Motion is reduced, so every spring settles immediately.
	 */
	function createHarness(options?: { readonly isSessionsWindow?: boolean; readonly enabled?: boolean }) {
		const container = $('.canvas-pip-test-container');
		Object.assign(container.style, { position: 'fixed', left: '0px', top: '0px', width: '1000px', height: '700px' });
		const groupElement = $('.canvas-pip-test-group');
		Object.assign(groupElement.style, { position: 'absolute', left: '600px', top: '0px', width: '400px', height: '700px' });
		const tab = $('.canvas-pip-test-tab');
		Object.assign(tab.style, { position: 'absolute', left: '10px', top: '2px', width: '100px', height: '30px' });
		groupElement.appendChild(tab);
		container.appendChild(groupElement);
		getWindow(container).document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const editors: CanvasInput[] = [];
		const windowId = getWindow(container).vscodeWindowId;
		const group = upcastPartial<IEditorGroup & IEditorGroupView>({
			id: 1, windowId, element: groupElement, titleHeight: { total: 35, offset: 0 }, disposed: false,
			get editors() { return editors; },
			contains: candidate => editors.includes(candidate as CanvasInput),
		});
		const ownerVisible = observableValue('ownerVisible', true);
		const sessionShown = observableValue('sessionShown', true);
		const ownerCanvases = observableValue<readonly ICanvas[] | undefined>('ownerCanvases', undefined);
		const removeOwner = store.add(new Emitter<ICanvasOwner>());
		const workingSets = observableValue<ICanvasWorkingSetState>('workingSets', { owner: undefined, restoring: false, applying: false });
		const editorsChanged = store.add(new Emitter<void>());
		const reveals: string[] = [];
		const commands: string[] = [];
		const openedChats: string[] = [];
		let detached: ICanvasDetachedPresentation | undefined;
		const configuration = new TestConfigurationService({ [CanvasPictureInPictureEnabledSettingId]: options?.enabled ?? true });
		store.add(toDisposable(() => configuration.onDidChangeConfigurationEmitter.dispose()));
		const model = upcastPartial<IBrowserViewModel>({
			onDidChangeFocus: Event.None, onDidChangeLoadingState: Event.None, onDidNavigate: Event.None,
			onDidRequestOpenExternal: Event.None, onWillDispose: Event.None,
			layout: async () => { },
		});

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: options?.isSessionsWindow ?? true }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ mainContainer: container, mainContainerOffset: { top: 0, quickPickTop: 0 }, onDidLayoutMainContainer: Event.None }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			mainPart: upcastPartial<IEditorPart>({ windowId, groups: [group] }),
			getGroup: id => id === group.id ? group : undefined,
		}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ onDidEditorsChange: Event.map(editorsChanged.event, () => upcastPartial({})) }));
		instantiationService.stub(ICanvasService, upcastPartial<ICanvasService>({
			enabled: observableValue('enabled', true),
			isOwnerPresentable: (_reference, reader) => ownerVisible.read(reader),
			resolveCanvasModel: async () => ({ model, reused: true }),
			revealCanvas: async target => { reveals.push(target.canvas.toString()); },
			// Like the canvas service, apply the presentation to its tab and to tabs created while it lasts.
			presentDetached: (_reference, presentation) => {
				detached = presentation;
				editors.forEach(editor => editor.setPresentation(presentation));
				return toDisposable(() => {
					if (detached === presentation) {
						detached = undefined;
						editors.forEach(editor => editor.setPresentation(undefined));
					}
				});
			},
		}));
		const session = upcastPartial<ISession>({
			providerId: reference.providerId, resource: reference.session, title: constObservable('Owning session'),
			chats: constObservable([upcastPartial<IChat>({ resource: reference.chat, title: constObservable('Owning chat') })]),
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({ getSession: resource => isEqual(resource, reference.session) ? session : undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ openChat: async (target, chat) => { openedChats.push(`${target.title.get()}/${chat.toString()}`); } }));
		instantiationService.stub(ICanvasContextService, upcastPartial<ICanvasContextService>({
			onDidRemoveOwner: removeOwner.event,
			isOwnerVisible: (_owner, reader) => ownerVisible.read(reader),
			getContext: (owner, reader) => sessionShown.read(reader) ? { owner, canvases: ownerCanvases } : undefined,
			workingSets: { state: workingSets, registerEditorToRetain: () => toDisposable(() => { }), suppressEditorPartAutoVisibility: () => toDisposable(() => { }) },
		}));
		instantiationService.stub(IAccessibilityService, upcastPartial<IAccessibilityService>({ isMotionReduced: () => true, isScreenReaderOptimized: () => false }));
		instantiationService.stub(IAccessibleViewService, {});
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (id: string) => { commands.push(id); return undefined; } }));
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { }, setModel: () => { }, setVisible: () => { }, layout: () => { }, tryFocus: () => false, dispose: () => { },
		});

		const createInput = () => {
			const input = store.add(instantiationService.createInstance(CanvasInput, reference, {
				resource: reference.canvas, instanceId: 'preview', title: 'Preview', source: URI.parse('https://example.test'),
			}));
			input.setPresentation(detached);
			editors.push(input);
			return input;
		};
		const input = createInput();
		const service = store.add(instantiationService.createInstance(SessionCanvasPictureInPictureService));
		const contextKeyService = instantiationService.get(IContextKeyService);
		const query = (selector: string) => container.querySelector<HTMLElement>(selector);
		const floatingWindow = () => query('.canvas-pip-window');
		const drag = (type: string, target: HTMLElement, clientX: number, clientY: number) => {
			target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: new DataTransfer() }));
		};
		const key = (target: Element, key: string, keyCode: number, modifiers?: { shift?: boolean; ctrlCmd?: boolean }) => {
			target.dispatchEvent(new KeyboardEvent('keydown', {
				key, keyCode, bubbles: true, cancelable: true, shiftKey: !!modifiers?.shift,
				ctrlKey: !!modifiers?.ctrlCmd && !isMacintosh, metaKey: !!modifiers?.ctrlCmd && isMacintosh,
			}));
		};

		return {
			container, group, groupElement, tab, editors, input, service, reveals, commands, openedChats, ownerVisible, sessionShown, ownerCanvases, removeOwner, workingSets, editorsChanged, configuration, createInput, drag, key, query, floatingWindow,
			/** The floating window's position, or `undefined` when nothing floats. */
			position: () => {
				const transform = floatingWindow()?.style.transform;
				const match = transform && /translate3d\((?<x>-?[\d.]+)px, (?<y>-?[\d.]+)px/.exec(transform);
				return match && match.groups ? { x: Math.round(Number(match.groups.x)), y: Math.round(Number(match.groups.y)) } : undefined;
			},
			state: () => {
				const element = floatingWindow();
				return element ? ['stashed-left', 'stashed-right', 'dock-armed', 'away'].filter(name => element.classList.contains(name)) : undefined;
			},
			goToChat: () => query('.canvas-pip-go-to-chat'),
			/** Simulates switching to another session, whose working set replaces the canvas tab. */
			leaveSession: () => {
				workingSets.set({ owner: undefined, restoring: true, applying: true }, undefined);
				editors.splice(0).forEach(editor => editor.dispose());
				ownerVisible.set(false, undefined);
				sessionShown.set(false, undefined);
				workingSets.set({ owner: undefined, restoring: false, applying: false }, undefined);
				editorsChanged.fire();
			},
			active: () => contextKeyService.getContextKeyValue(CanvasPictureInPictureActive.key),
			setEnabled: (value: boolean) => {
				configuration.setUserConfiguration(CanvasPictureInPictureEnabledSettingId, value);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === CanvasPictureInPictureEnabledSettingId }));
			},
		};
	}

	test('floats a canvas above the Agents Window and returns it to its tab without reopening it', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		const floating = {
			presented: !!harness.input.presentation.get(),
			position: harness.position(),
			active: harness.active(),
			tab: harness.input.getLabelExtraClasses(),
			inLayer: harness.floatingWindow()?.parentElement === harness.query('.canvas-pip-layer') && harness.query('.canvas-pip-layer')?.parentElement === harness.container,
		};
		harness.service.dock();
		await timeout(0);
		assert.deepStrictEqual({ floating, docked: { presented: !!harness.input.presentation.get(), window: !!harness.floatingWindow(), active: harness.active() }, reveals: harness.reveals }, {
			floating: { presented: true, position: { x: 628, y: 462 }, active: true, tab: ['canvas-detached'], inLayer: true },
			docked: { presented: false, window: false, active: false },
			reveals: ['canvas:/preview'],
		});
	});

	test('only floats canvases in the Agents Window while its setting is enabled', async () => {
		const editorWindow = createHarness({ isSessionsWindow: false });
		const disabled = createHarness({ enabled: false });
		await editorWindow.service.open(editorWindow.input, editorWindow.group);
		await disabled.service.open(disabled.input, disabled.group);
		assert.deepStrictEqual([editorWindow, disabled].map(harness => ({ enabled: harness.service.enabled, presented: !!harness.input.presentation.get(), window: !!harness.floatingWindow() })), [
			{ enabled: false, presented: false, window: false },
			{ enabled: false, presented: false, window: false },
		]);
	});

	test('tucks a floating canvas behind the far side and shows it in the nearest corner', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		const focusable = () => ({
			root: harness.floatingWindow()?.tabIndex,
			header: !harness.query('.canvas-pip-header')?.inert,
			content: !harness.query('.canvas-pip-content')?.inert,
		});
		harness.service.stash();
		const tucked = { position: harness.position(), state: harness.state(), presented: !!harness.input.presentation.get(), focusable: focusable() };
		harness.service.reveal();
		assert.deepStrictEqual({ tucked, shown: { position: harness.position(), state: harness.state(), focusable: focusable() } }, {
			tucked: { position: { x: 972, y: 462 }, state: ['stashed-right'], presented: true, focusable: { root: -1, header: false, content: false } },
			shown: { position: { x: 628, y: 462 }, state: [], focusable: { root: 0, header: true, content: true } },
		});
	});

	test('moves between corners, tucks, resizes and returns to its tab from the keyboard', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		const element = harness.floatingWindow()!;
		const steps: unknown[] = [];
		harness.key(element, 'ArrowLeft', 37);
		steps.push(harness.position());
		harness.key(element, 'ArrowLeft', 37);
		steps.push({ position: harness.position(), state: harness.state() });
		harness.key(harness.query('.canvas-pip-stash-cover')!, 'Enter', 13);
		steps.push({ position: harness.position(), state: harness.state() });
		harness.key(element, 'ArrowRight', 39, { shift: true });
		steps.push({ position: harness.position(), width: element.style.width });
		harness.key(element, 'Escape', 27);
		harness.key(element, 'Enter', 13, { ctrlCmd: true });
		await timeout(0);
		assert.deepStrictEqual({ steps, commands: harness.commands, docked: !harness.input.presentation.get(), reveals: harness.reveals }, {
			steps: [
				{ x: 12, y: 462 },
				{ position: { x: -332, y: 462 }, state: ['stashed-left'] },
				{ position: { x: 12, y: 462 }, state: [] },
				{ position: { x: 12, y: 388 }, width: '480px' },
			],
			commands: [FOCUS_ACTIVE_SESSION_COMMAND_ID],
			docked: true,
			reveals: ['canvas:/preview'],
		});
	});

	test('keeps floating above other sessions and moves onto its restored tab on return', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.service.stash();
		harness.leaveSession();
		await timeout(0);
		const away = { hidden: harness.floatingWindow()?.hidden, state: harness.state(), goToChat: !harness.goToChat()?.hidden, active: harness.active() };
		harness.sessionShown.set(true, undefined);
		harness.ownerVisible.set(true, undefined);
		const restored = harness.createInput();
		harness.editorsChanged.fire();
		await timeout(0);
		await timeout(0);
		const back = { restoredDetached: !!restored.presentation.get(), state: harness.state(), goToChat: !harness.goToChat()?.hidden };
		harness.service.dock();
		await timeout(0);
		assert.deepStrictEqual({ away, back, docked: { presented: !!restored.presentation.get(), window: !!harness.floatingWindow(), reveals: harness.reveals } }, {
			away: { hidden: false, state: ['stashed-right', 'away'], goToChat: true, active: true },
			back: { restoredDetached: true, state: ['stashed-right'], goToChat: false },
			docked: { presented: false, window: false, reveals: ['canvas:/preview'] },
		});
	});

	test('keeps floating above another chat and offers a way back to the chat it belongs to', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		const home = { goToChat: !harness.goToChat()?.hidden, state: harness.state() };
		harness.ownerVisible.set(false, undefined);
		const button = harness.goToChat()?.querySelector<HTMLElement>('.monaco-button');
		const away = { hidden: harness.floatingWindow()?.hidden, position: harness.position(), goToChat: !harness.goToChat()?.hidden, state: harness.state(), label: button?.getAttribute('aria-label') };
		button?.click();
		await timeout(0);
		assert.deepStrictEqual({ home, away, opened: harness.openedChats }, {
			home: { goToChat: false, state: [] },
			away: { hidden: false, position: { x: 628, y: 462 }, goToChat: true, state: ['away'], label: 'Go to Owning chat' },
			opened: ['Owning session/chat:/owner'],
		});
	});

	test('returning to its tab from another conversation goes to its chat first', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.ownerVisible.set(false, undefined);
		harness.service.dock();
		await timeout(0);
		const whileAway = { opened: harness.openedChats.length, window: !!harness.floatingWindow() };
		harness.ownerVisible.set(true, undefined);
		harness.editorsChanged.fire();
		await timeout(0);
		await timeout(0);
		assert.deepStrictEqual({ whileAway, window: !!harness.floatingWindow(), reveals: harness.reveals }, {
			whileAway: { opened: 1, window: true },
			window: false,
			reveals: ['canvas:/preview'],
		});
	});

	test('only tears a canvas out of its tab beside its owning chat', async () => {
		const harness = createHarness();
		harness.ownerVisible.set(false, undefined);
		await harness.service.open(harness.input, harness.group);
		assert.deepStrictEqual({ presented: !!harness.input.presentation.get(), window: !!harness.floatingWindow() }, { presented: false, window: false });
	});

	test('ends a floating canvas that closed while another session was shown', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.leaveSession();
		await timeout(0);
		const away = !!harness.floatingWindow();
		harness.ownerCanvases.set([], undefined);
		harness.sessionShown.set(true, undefined);
		harness.ownerVisible.set(true, undefined);
		await timeout(0);
		assert.deepStrictEqual({ away, window: !!harness.floatingWindow(), active: harness.active() }, { away: true, window: false, active: false });
	});

	test('ends a floating canvas whose conversation was removed', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.leaveSession();
		await timeout(0);
		harness.removeOwner.fire(reference);
		assert.deepStrictEqual({ window: !!harness.floatingWindow(), active: harness.active() }, { window: false, active: false });
	});

	test('closing the tab of a visible conversation closes its floating canvas', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.editors.splice(0);
		harness.input.dispose();
		harness.createInput();
		harness.editorsChanged.fire();
		await timeout(0);
		assert.deepStrictEqual({ window: !!harness.floatingWindow(), active: harness.active(), reveals: harness.reveals }, { window: false, active: false, reveals: [] });
	});

	test('returns floating canvases to their tabs quietly when the setting is turned off', async () => {
		const harness = createHarness();
		await harness.service.open(harness.input, harness.group);
		harness.setEnabled(false);
		assert.deepStrictEqual({ enabled: harness.service.enabled, presented: !!harness.input.presentation.get(), window: !!harness.floatingWindow(), reveals: harness.reveals }, {
			enabled: false, presented: false, window: false, reveals: [],
		});
	});

	test('tears a dragged tab out of the tab bar and settles it in the corner nearest its release', async () => {
		const harness = createHarness();
		const transfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		transfer.setData([new DraggedEditorIdentifier({ editor: harness.input, groupId: harness.group.id })], DraggedEditorIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedEditorIdentifier.prototype)));
		harness.drag('dragstart', harness.tab, 650, 15);
		const lifted = { ghost: !!harness.query('.canvas-pip-tab-ghost'), presented: !!harness.input.presentation.get() };
		harness.drag('dragover', harness.groupElement, 700, 40);
		const stretched = !!harness.input.presentation.get();
		harness.drag('dragover', harness.groupElement, 700, 100);
		const torn = !!harness.input.presentation.get();
		await timeout(100);
		harness.drag('dragover', harness.groupElement, 400, 600);
		await timeout(100);
		harness.drag('dragover', harness.groupElement, 400, 600);
		harness.drag('drop', harness.groupElement, 400, 600);
		harness.drag('dragend', harness.tab, 400, 600);
		await timeout(0);
		assert.deepStrictEqual({ lifted, stretched, torn, settled: harness.position(), ghost: !!harness.query('.canvas-pip-tab-ghost') }, {
			lifted: { ghost: true, presented: false },
			stretched: false,
			torn: true,
			settled: { x: 12, y: 462 },
			ghost: false,
		});
	});

	test('returns a torn-out canvas to its tab when it is dropped back on the tab bar', async () => {
		const harness = createHarness();
		const transfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		transfer.setData([new DraggedEditorIdentifier({ editor: harness.input, groupId: harness.group.id })], DraggedEditorIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedEditorIdentifier.prototype)));
		harness.drag('dragstart', harness.tab, 650, 15);
		harness.drag('dragover', harness.groupElement, 700, 100);
		harness.drag('dragover', harness.groupElement, 700, 20);
		const armed = { state: harness.state(), hint: harness.query('.canvas-pip-dock-hint')?.hidden };
		harness.drag('drop', harness.groupElement, 700, 20);
		harness.drag('dragend', harness.tab, 700, 20);
		await timeout(0);
		assert.deepStrictEqual({ armed, presented: !!harness.input.presentation.get(), window: !!harness.floatingWindow(), reveals: harness.reveals }, {
			armed: { state: ['dock-armed'], hint: false },
			presented: false,
			window: false,
			reveals: ['canvas:/preview'],
		});
	});
});
