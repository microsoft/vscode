/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, IEditorCloseEvent, ITextDiffEditorPane, IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { ICanvasWorkingSetState } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, isPreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ICustomViewService } from '../../../customView/browser/customViewService.js';
import { IWindowCanvas, IWindowCanvasDescriptor, WindowCanvasInput, WindowCanvasService } from '../../browser/windowCanvasService.js';

class TestCanvas extends Disposable implements IWindowCanvas {
	draft = '';
	visible = false;
	sessionsOpened = 0;
	readonly input = document.createElement('input');
	focusCalls = 0;
	render(container: HTMLElement): void { container.appendChild(this.input); }
	layout(): void { }
	focus(): void { this.focusCalls++; this.input.focus(); }
	setVisible(visible: boolean): void { this.visible = visible; }
	async openNewSession(): Promise<void> { this.sessionsOpened++; }
}

suite('WindowCanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const descriptor: IWindowCanvasDescriptor = { id: 'test.inbox', title: 'Inbox', icon: Codicon.inbox, ctor: new SyncDescriptor(TestCanvas) };

	function createHarness(storage = store.add(new InMemoryStorageService()), whenReady = Promise.resolve()) {
		const instantiationService = store.add(new TestInstantiationService());
		const activeChanged = store.add(new Emitter<void>());
		const focused = store.add(new Emitter<void>());
		const closed = store.add(new Emitter<IEditorCloseEvent>());
		const didOpen = store.add(new Emitter<WindowCanvasInput>());
		const willOpen = store.add(new Emitter<void>());
		const workingSetState = observableValue<ICanvasWorkingSetState>('workingSet', { owner: undefined, restoring: false, applying: false });
		const opened: { input: WindowCanvasInput; options: IEditorOptions | undefined }[] = [];
		const editors = new Set<WindowCanvasInput>();
		const errors: string[] = [];
		let activeEditor: WindowCanvasInput | undefined;
		let openGate: DeferredPromise<void> | undefined;
		let failOpen = false;
		let paneVisible = true;
		let hides = 0;
		let suppressions = 0;
		let willShutdown = false;
		let activations = 0;
		let focusCalls = 0;
		let sessionsVisible = true;
		const group = upcastPartial<IEditorGroup>({ id: 1, windowId: 1, contains: input => input instanceof WindowCanvasInput && editors.has(input) });
		const pane = upcastPartial<ITextDiffEditorPane & IVisibleEditorPane>({
			group,
			get input() { return activeEditor; },
			isVisible: () => paneVisible,
			focus: () => {
				focusCalls++;
				sessionsVisible = false;
				focused.fire();
			},
		});
		const close = (input: WindowCanvasInput) => {
			editors.delete(input);
			closed.fire({ editor: input, groupId: 1, context: EditorCloseContext.UNKNOWN, index: 0, sticky: false });
			input.dispose();
			if (activeEditor === input) {
				activeEditor = undefined;
				activeChanged.fire();
			}
		};
		instantiationService.stub(IEditorGroupsService, {
			whenReady,
			mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ activeGroup: group, groups: [group], windowId: 1, onDidFocus: focused.event }),
			getGroup: () => group,
			activateGroup: () => { activations++; return group; },
		});
		instantiationService.stub(IEditorService, {
			onDidActiveEditorChange: activeChanged.event,
			onDidCloseEditor: closed.event,
			get activeEditor() { return activeEditor; },
			activeEditorPane: pane,
			openEditor: async (input, options) => {
				assert.ok(input instanceof WindowCanvasInput);
				const editorOptions = isPreferredGroup(options) ? undefined : options;
				if (editorOptions?.activation !== EditorActivation.PRESERVE && !editorOptions?.preserveFocus) {
					activations++;
				}
				willOpen.fire();
				if (openGate) {
					await openGate.p;
				}
				if (failOpen) {
					throw new Error('test open failure');
				}
				service.getPresentation(input);
				const active = !editors.size || !editorOptions?.inactive;
				editors.add(input);
				if (active) {
					activeEditor = input;
					activeChanged.fire();
				}
				opened.push({ input, options: editorOptions });
				didOpen.fire(input);
				if (active && !editorOptions?.preserveFocus) {
					pane.focus();
				}
				return active ? pane : undefined;
			},
			findEditors: () => [...editors].map(editor => ({ editor, groupId: 1 })),
			closeEditors: async inputs => { for (const { editor } of inputs) { assert.ok(editor instanceof WindowCanvasInput); close(editor); } },
		});
		instantiationService.stub(ICustomViewService, { activeCustomView: constObservable(undefined), hideCustomView: () => { hides++; } });
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, { error: message => { errors.push(String(message)); } });
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ILifecycleService, { get willShutdown() { return willShutdown; } });
		const service = store.add(instantiationService.createInstance(WindowCanvasService));
		store.add(service.connectWorkingSets({
			state: workingSetState,
			registerEditorToRetain: () => Disposable.None,
			suppressEditorPartAutoVisibility: () => { suppressions++; return Disposable.None; },
		}));
		return {
			service, opened, editors, storage, close, workingSetState, didOpen, willOpen, errors,
			get hides() { return hides; },
			get suppressions() { return suppressions; },
			get activations() { return activations; },
			get focusCalls() { return focusCalls; },
			get sessionsVisible() { return sessionsVisible; },
			showSessions() { sessionsVisible = true; },
			shutdown() { willShutdown = true; },
			setOpenGate(gate: DeferredPromise<void>) { openGate = gate; },
			setFailOpen(value: boolean) { failOpen = value; },
			setPaneVisible(value: boolean) { paneVisible = value; },
			focus() { focused.fire(); },
		};
	}

	test('repeated opens reuse one native canvas and its content without a chat owner', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		const first = h.opened[0].input;
		const content = h.service.getPresentation(first).content;
		await h.service.openCanvas(descriptor.id);
		assert.deepStrictEqual({
			ids: h.service.canvases.get().map(canvas => canvas.id),
			sameInput: h.opened[1].input === first,
			sameContent: h.service.getPresentation(h.opened[1].input).content === content,
			editors: h.editors.size, hides: h.hides,
		}, { ids: [descriptor.id], sameInput: true, sameContent: true, editors: 1, hides: 2 });
	});

	test('session working-set replacement retains draft state and reopens without taking focus', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		const first = h.opened[0].input;
		const content = h.service.getPresentation(first).content;
		assert.ok(content instanceof TestCanvas);
		content.draft = 'unsent draft';
		h.service.deactivateCanvas();
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		h.close(first);
		const nextOpen = Event.toPromise(h.didOpen.event);
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		const next = await nextOpen;
		assert.deepStrictEqual({
			recreatedInput: next !== first,
			sameContent: h.service.getPresentation(next).content === content,
			draft: content.draft,
			preserveFocus: h.opened[1].options?.preserveFocus,
			inactive: h.opened[1].options?.inactive,
			navigation: h.service.navigationRequest.get(),
			activeOpen: h.service.activeCanvasOpen.get(),
		}, { recreatedInput: true, sameContent: true, draft: 'unsent draft', preserveFocus: true, inactive: true, navigation: undefined, activeOpen: undefined });
	});

	test('history reuses canvas content and distinguishes repeated explicit opens from traversal', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		const openings: string[] = [];
		store.add(autorun(reader => {
			const opening = h.service.activeCanvasOpen.read(reader);
			if (opening) {
				openings.push(opening.source);
			}
		}));
		await h.service.openCanvas(descriptor.id);
		const first = h.opened[0].input;
		const presentation = h.service.getPresentation(first);
		assert.ok(presentation.content instanceof TestCanvas);
		presentation.content.draft = 'unsent draft';
		h.service.deactivateCanvas();
		await h.service.openCanvas(descriptor.id, { source: 'history' });
		await h.service.openCanvas(descriptor.id);

		assert.deepStrictEqual({
			openings,
			sameInput: h.opened.every(open => open.input === first),
			sameContent: h.service.getPresentation(first) === presentation,
			draft: presentation.content.draft,
			editors: h.editors.size,
		}, { openings: ['explicit', 'history', 'explicit'], sameInput: true, sameContent: true, draft: 'unsent draft', editors: 1 });
	});

	test('focusing a retained canvas after a session publishes a new explicit destination', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		const first = h.service.activeCanvasOpen.get();
		h.service.deactivateCanvas();
		h.focus();
		assert.deepStrictEqual({
			destination: h.service.activeCanvasOpen.get(),
			newRequest: h.service.navigationRequest.get() !== first,
			editorOpens: h.opened.length,
		}, { destination: { id: descriptor.id, source: 'explicit' }, newRequest: true, editorOpens: 1 });
	});

	test('a canceled canvas open never records or reveals a destination after editor readiness', async () => {
		const ready = new DeferredPromise<void>();
		const h = createHarness(undefined, ready.p);
		store.add(h.service.registerCanvas(descriptor));
		const opening = h.service.openCanvas(descriptor.id);
		const request = h.service.navigationRequest.get();
		h.service.cancelPendingOpen();
		await ready.complete();
		await opening;
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			request, navigation: h.service.navigationRequest.get(),
			destination: h.service.activeCanvasOpen.get(), opens: h.opened.length,
		}, { request: { id: descriptor.id, source: 'explicit' }, navigation: undefined, destination: undefined, opens: 0 });
	});

	test('a foreground canvas open waits for working-set restoration without losing its intent', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		const opening = h.service.openCanvas(descriptor.id, { source: 'history' });
		const whileRestoring = h.opened.length;
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		await opening;
		assert.deepStrictEqual({
			whileRestoring, destination: h.service.activeCanvasOpen.get(),
			options: h.opened.map(open => ({ preserveFocus: open.options?.preserveFocus, inactive: open.options?.inactive })),
		}, { whileRestoring: 0, destination: { id: descriptor.id, source: 'history' }, options: [{ preserveFocus: true, inactive: false }] });
	});

	test('canceling Back to Inbox after the editor open starts preserves Sessions focus and visibility', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		h.service.deactivateCanvas();
		h.showSessions();
		const focusCalls = h.focusCalls;
		const activations = h.activations;
		const gate = new DeferredPromise<void>();
		h.setOpenGate(gate);
		const started = Event.toPromise(h.willOpen.event);
		const opening = h.service.openCanvas(descriptor.id, { source: 'history' });
		await started;
		h.service.cancelPendingOpen();
		await gate.complete();
		await opening;
		assert.deepStrictEqual({
			navigation: h.service.navigationRequest.get(),
			destination: h.service.activeCanvasOpen.get(),
			focusCalls: h.focusCalls - focusCalls,
			activations: h.activations - activations,
			sessionsVisible: h.sessionsVisible,
		}, { navigation: undefined, destination: undefined, focusCalls: 0, activations: 0, sessionsVisible: true });
	});

	test('a current foreground open activates and focuses the canvas once the editor is ready', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		const gate = new DeferredPromise<void>();
		h.setOpenGate(gate);
		const started = Event.toPromise(h.willOpen.event);
		const opening = h.service.openCanvas(descriptor.id, { source: 'history' });
		await started;
		const pending = { activations: h.activations, focusCalls: h.focusCalls };
		await gate.complete();
		await opening;
		assert.deepStrictEqual({
			pending, activations: h.activations, focusCalls: h.focusCalls,
			destination: h.service.activeCanvasOpen.get(),
		}, { pending: { activations: 0, focusCalls: 0 }, activations: 1, focusCalls: 1, destination: { id: descriptor.id, source: 'history' } });
	});

	test('canceling an open stops waiting for background working-set restoration', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		const opening = h.service.openCanvas(descriptor.id);
		h.service.cancelPendingOpen();
		await opening;
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		assert.deepStrictEqual({ opens: h.opened.length, navigation: h.service.navigationRequest.get(), destination: h.service.activeCanvasOpen.get() }, {
			opens: 0, navigation: undefined, destination: undefined,
		});
	});

	for (const { focusMoved, retainFocusOnRestore } of [
		{ focusMoved: false, retainFocusOnRestore: false },
		{ focusMoved: false, retainFocusOnRestore: true },
		{ focusMoved: true, retainFocusOnRestore: true },
	]) {
		test(`working-set replacement restores focus only for opted-in canvases without overriding user focus (${retainFocusOnRestore}, ${focusMoved})`, async () => {
			const h = createHarness();
			store.add(h.service.registerCanvas({ ...descriptor, retainFocusOnRestore }));
			store.add(h.didOpen.event(input => document.body.appendChild(h.service.getPresentation(input).element)));
			await h.service.openCanvas(descriptor.id);
			const presentation = h.service.getPresentation(h.opened[0].input);
			store.add({ dispose: () => presentation.element.remove() });
			assert.ok(presentation.content instanceof TestCanvas);
			const content = presentation.content;
			const otherInput = document.body.appendChild(document.createElement('input'));
			store.add({ dispose: () => otherInput.remove() });
			content.input.focus();
			assert.strictEqual(document.activeElement, content.input);
			h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
			presentation.element.remove();
			h.close(h.opened[0].input);
			if (focusMoved) {
				otherInput.focus();
			}
			const nextOpen = Event.toPromise(h.didOpen.event);
			h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
			await nextOpen;
			await timeout(0);
			assert.deepStrictEqual({ focused: document.activeElement === (focusMoved ? otherInput : retainFocusOnRestore ? content.input : document.body), focusCalls: content.focusCalls, errors: h.errors }, {
				focused: true, focusCalls: retainFocusOnRestore && !focusMoved ? 1 : 0, errors: [],
			});
		});
	}

	for (const navigateBeforeRestore of [false, true]) {
		test(`explicit session navigation prevents restoring old canvas focus (${navigateBeforeRestore})`, async () => {
			const h = createHarness();
			store.add(h.service.registerCanvas({ ...descriptor, retainFocusOnRestore: true }));
			store.add(h.didOpen.event(input => document.body.appendChild(h.service.getPresentation(input).element)));
			await h.service.openCanvas(descriptor.id);
			const first = h.opened[0].input;
			const presentation = h.service.getPresentation(first);
			store.add({ dispose: () => presentation.element.remove() });
			assert.ok(presentation.content instanceof TestCanvas);
			const content = presentation.content;
			content.draft = 'unsent';
			content.input.focus();
			if (navigateBeforeRestore) {
				h.service.deactivateCanvas();
			}
			h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
			if (!navigateBeforeRestore) {
				h.service.deactivateCanvas();
			}
			presentation.element.remove();
			h.close(first);
			const nextOpen = Event.toPromise(h.didOpen.event);
			h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
			const restored = await nextOpen;
			await timeout(0);
			assert.deepStrictEqual({
				focusCalls: content.focusCalls,
				canvas: h.service.activeCanvasOpen.get(),
				sameContent: h.service.getPresentation(restored).content === content,
				draft: content.draft,
			}, { focusCalls: 0, canvas: undefined, sameContent: true, draft: 'unsent' });
		});
	}

	test('without open canvases working-set changes do not affect editor visibility', () => {
		const h = createHarness();
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		assert.deepStrictEqual({ suppressions: h.suppressions, opens: h.opened.length }, { suppressions: 0, opens: 0 });
	});

	test('explicit close prevents later session switches from reopening the canvas', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		h.close(h.opened[0].input);
		h.workingSetState.set({ owner: undefined, restoring: true, applying: true }, undefined);
		h.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		await Promise.resolve();
		assert.strictEqual(h.opened.length, 1);
	});

	test('restores window-level open canvases only after their definition is registered', async () => {
		const first = createHarness();
		store.add(first.service.registerCanvas(descriptor));
		await first.service.openCanvas(descriptor.id);
		const restored = createHarness(first.storage);
		const before = restored.opened.length;
		const nextOpen = Event.toPromise(restored.didOpen.event);
		store.add(restored.service.registerCanvas(descriptor));
		await nextOpen;
		await timeout(0);
		assert.deepStrictEqual({ before, restored: restored.opened.map(entry => entry.input.descriptor.id), hides: restored.hides, errors: restored.errors, navigation: restored.service.navigationRequest.get(), destination: restored.service.activeCanvasOpen.get() }, {
			before: 0, restored: [descriptor.id], hides: 0, errors: [], navigation: undefined, destination: undefined,
		});
	});

	test('disabling a canvas clears its pending restoration', async () => {
		const first = createHarness();
		store.add(first.service.registerCanvas(descriptor));
		await first.service.openCanvas(descriptor.id);
		const disabled = createHarness(first.storage);
		await disabled.service.closeCanvas(descriptor.id);
		store.add(disabled.service.registerCanvas(descriptor));
		await Promise.resolve();
		assert.strictEqual(disabled.opened.length, 0);
	});

	test('shutdown teardown preserves the next window restoration state', async () => {
		const first = createHarness();
		const registration = store.add(first.service.registerCanvas(descriptor));
		await first.service.openCanvas(descriptor.id);
		first.shutdown();
		registration.dispose();
		const restored = createHarness(first.storage);
		const nextOpen = Event.toPromise(restored.didOpen.event);
		store.add(restored.service.registerCanvas(descriptor));
		await nextOpen;
		assert.deepStrictEqual(restored.opened.map(entry => entry.input.descriptor.id), [descriptor.id]);
	});

	test('closing before editor groups are ready cancels an explicit open', async () => {
		const ready = new DeferredPromise<void>();
		const h = createHarness(undefined, ready.p);
		store.add(h.service.registerCanvas(descriptor));
		const rejected = assert.rejects(h.service.openCanvas(descriptor.id), /unavailable/);
		await h.service.closeCanvas(descriptor.id);
		await ready.complete();
		await rejected;
		assert.strictEqual(h.opened.length, 0);
	});

	test('failed rendering disposes the partial presentation before retry', async () => {
		let attempts = 0;
		let disposed = 0;
		class FailingCanvas extends TestCanvas {
			override render(): void {
				if (++attempts === 1) {
					throw new Error('test render failure');
				}
			}
			override dispose(): void { disposed++; super.dispose(); }
		}
		const h = createHarness();
		store.add(h.service.registerCanvas({ ...descriptor, ctor: new SyncDescriptor(FailingCanvas) }));
		await assert.rejects(h.service.openCanvas(descriptor.id), /test render failure/);
		await h.service.openCanvas(descriptor.id);
		assert.deepStrictEqual({ attempts, disposed, open: h.editors.size }, { attempts: 2, disposed: 1, open: 1 });
	});

	test('unregistered and failed opens reject instead of reporting success', async () => {
		const h = createHarness();
		await assert.rejects(h.service.openCanvas(descriptor.id), /unavailable/);
		store.add(h.service.registerCanvas(descriptor));
		h.setFailOpen(true);
		await assert.rejects(h.service.openCanvas(descriptor.id), /test open failure/);
		assert.deepStrictEqual({ navigation: h.service.navigationRequest.get(), destination: h.service.activeCanvasOpen.get() }, { navigation: undefined, destination: undefined });
		h.setFailOpen(false);
		await h.service.openCanvas(descriptor.id);
		assert.strictEqual(h.editors.size, 1);
	});

	test('disabling during an editor open cannot recreate the canvas content', async () => {
		const h = createHarness();
		const registration = store.add(h.service.registerCanvas(descriptor));
		const gate = new DeferredPromise<void>();
		h.setOpenGate(gate);
		const rejected = assert.rejects(h.service.openCanvas(descriptor.id), /unavailable/);
		await Promise.resolve();
		registration.dispose();
		await gate.complete();
		await rejected;
		assert.deepStrictEqual({ available: h.service.canvases.get(), open: h.editors.size }, { available: [], open: 0 });
	});

	test('New Session routes only to a visible active native canvas', async () => {
		const h = createHarness();
		store.add(h.service.registerCanvas(descriptor));
		await h.service.openCanvas(descriptor.id);
		const content = h.service.getPresentation(h.opened[0].input).content;
		assert.ok(content instanceof TestCanvas);
		await h.service.openNewSession();
		h.setPaneVisible(false);
		const hiddenResult = h.service.openNewSession();
		assert.deepStrictEqual({ sessionsOpened: content.sessionsOpened, hiddenResult }, { sessionsOpened: 1, hiddenResult: undefined });
	});
});
