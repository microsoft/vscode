/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
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
	render(): void { }
	layout(): void { }
	focus(): void { }
	setVisible(visible: boolean): void { this.visible = visible; }
	async openNewSession(): Promise<void> { this.sessionsOpened++; }
}

suite('WindowCanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const descriptor: IWindowCanvasDescriptor = { id: 'test.inbox', title: 'Inbox', icon: Codicon.inbox, ctor: new SyncDescriptor(TestCanvas) };

	function createHarness(storage = store.add(new InMemoryStorageService()), whenReady = Promise.resolve()) {
		const instantiationService = store.add(new TestInstantiationService());
		const activeChanged = store.add(new Emitter<void>());
		const closed = store.add(new Emitter<IEditorCloseEvent>());
		const didOpen = store.add(new Emitter<WindowCanvasInput>());
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
		const pane = upcastPartial<ITextDiffEditorPane & IVisibleEditorPane>({ isVisible: () => paneVisible });
		const group = upcastPartial<IEditorGroup>({ id: 1, windowId: 1, contains: input => input instanceof WindowCanvasInput && editors.has(input) });
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
			mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ activeGroup: group, groups: [group], windowId: 1 }),
			getGroup: () => group,
		});
		instantiationService.stub(IEditorService, {
			onDidActiveEditorChange: activeChanged.event,
			onDidCloseEditor: closed.event,
			get activeEditor() { return activeEditor; },
			activeEditorPane: pane,
			openEditor: async (input, options) => {
				assert.ok(input instanceof WindowCanvasInput);
				if (openGate) {
					await openGate.p;
				}
				if (failOpen) {
					throw new Error('test open failure');
				}
				service.getPresentation(input);
				editors.add(input);
				activeEditor = input;
				opened.push({ input, options: isPreferredGroup(options) ? undefined : options });
				activeChanged.fire();
				didOpen.fire(input);
				return !isPreferredGroup(options) && options?.inactive ? undefined : pane;
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
			service, opened, editors, storage, close, workingSetState, didOpen, errors,
			get hides() { return hides; },
			get suppressions() { return suppressions; },
			shutdown() { willShutdown = true; },
			setOpenGate(gate: DeferredPromise<void>) { openGate = gate; },
			setFailOpen(value: boolean) { failOpen = value; },
			setPaneVisible(value: boolean) { paneVisible = value; },
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
		}, { recreatedInput: true, sameContent: true, draft: 'unsent draft', preserveFocus: true, inactive: true });
	});

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
		assert.deepStrictEqual({ before, restored: restored.opened.map(entry => entry.input.descriptor.id), hides: restored.hides, errors: restored.errors }, {
			before: 0, restored: [descriptor.id], hides: 0, errors: [],
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
