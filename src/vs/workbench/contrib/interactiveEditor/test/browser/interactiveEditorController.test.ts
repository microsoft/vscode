/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InteractiveEditorController, InteractiveEditorRunOptions, State } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorController';
import { IInteractiveEditorSessionService, InteractiveEditorSessionService } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorSession';
import { IInteractiveEditorService, InteractiveEditorResponseType } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { InteractiveEditorServiceImpl } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditorServiceImpl';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { mock } from 'vs/base/test/common/mock';
import { Emitter, Event } from 'vs/base/common/event';
import { equals } from 'vs/base/common/arrays';

suite('InteractiveEditorController', function () {

	class TestController extends InteractiveEditorController {

		static INIT_SEQUENCE: readonly State[] = [State.CREATE_SESSION, State.INIT_UI, State.WAIT_FOR_INPUT];
		static INIT_SEQUENCE_AUTO_SEND: readonly State[] = [...this.INIT_SEQUENCE, State.MAKE_REQUEST, State.APPLY_RESPONSE, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT];

		private readonly _onDidChangeState = new Emitter<State>();
		readonly onDidChangeState: Event<State> = this._onDidChangeState.event;

		readonly states: readonly State[] = [];

		waitFor(states: readonly State[]): Promise<void> {
			const actual: State[] = [];

			return new Promise<void>((resolve, reject) => {
				const d = this.onDidChangeState(state => {
					actual.push(state);
					if (equals(states, actual)) {
						d.dispose();
						resolve();
					}
				});

				setTimeout(() => {
					d.dispose();
					reject(`timeout, \nWANTED ${states.join('>')}, \nGOT ${actual.join('>')}`);
				}, 1000);
			});
		}

		protected override _nextState(state: State, options: InteractiveEditorRunOptions | undefined): Promise<void> {
			this._onDidChangeState.fire(state);
			(<State[]>this.states).push(state);
			return super._nextState(state, options);
		}

		override dispose() {
			super.dispose();
			this._onDidChangeState.dispose();
		}
	}

	const store = new DisposableStore();
	let editor: ICodeEditor;
	let model: ITextModel;
	let ctrl: TestController;
	// let contextKeys: MockContextKeyService;
	let interactiveEditorService: InteractiveEditorServiceImpl;
	let interactiveEditorSessionService: IInteractiveEditorSessionService;
	let instaService: TestInstantiationService;

	setup(function () {

		const contextKeyService = new MockContextKeyService();
		interactiveEditorService = new InteractiveEditorServiceImpl(contextKeyService);

		const serviceCollection = new ServiceCollection(
			[IContextKeyService, contextKeyService],
			[IInteractiveEditorService, interactiveEditorService],
			[IInteractiveEditorSessionService, new SyncDescriptor(InteractiveEditorSessionService)],
			[IEditorProgressService, new class extends mock<IEditorProgressService>() {
				override show(total: unknown, delay?: unknown): IProgressRunner {
					return {
						total() { },
						worked(value) { },
						done() { },
					};
				}
			}]
		);

		instaService = workbenchInstantiationService(undefined, store).createChild(serviceCollection);
		interactiveEditorSessionService = instaService.get(IInteractiveEditorSessionService);

		model = instaService.get(IModelService).createModel('Hello\nWorld\nHello Again\nHello World\n', null);
		editor = instantiateTestCodeEditor(instaService, model);

		store.add(interactiveEditorService.addProvider({
			debugName: 'Unit Test',
			prepareInteractiveEditorSession() {
				return {
					id: Math.random()
				};
			},
			provideResponse(session, request) {
				return {
					type: InteractiveEditorResponseType.EditorEdit,
					id: Math.random(),
					edits: [{
						range: new Range(1, 1, 1, 1),
						text: request.prompt
					}]
				};
			}
		}));
	});

	teardown(function () {
		editor.dispose();
		model.dispose();
		store.clear();
		ctrl?.dispose();
	});

	test('creation, not showing anything', function () {
		ctrl = instaService.createInstance(TestController, editor);
		assert.ok(ctrl);
		assert.strictEqual(ctrl.getWidgetPosition(), undefined);
	});

	test('run (show/hide)', async function () {
		ctrl = instaService.createInstance(TestController, editor);
		const run = ctrl.run({ message: 'Hello', autoSend: true });

		await Event.toPromise(Event.filter(ctrl.onDidChangeState, e => e === State.WAIT_FOR_INPUT));
		assert.ok(ctrl.getWidgetPosition() !== undefined);
		await ctrl.cancelSession();

		await run;

		assert.ok(ctrl.getWidgetPosition() === undefined);
	});

	test('wholeRange expands to whole lines, editor selection default', async function () {

		editor.setSelection(new Range(1, 1, 1, 3));
		ctrl = instaService.createInstance(TestController, editor);

		const d = interactiveEditorService.addProvider({
			debugName: 'Unit Test',
			prepareInteractiveEditorSession() {
				return {
					id: Math.random()
				};
			},
			provideResponse(session, request) {
				throw new Error();
			}
		});

		ctrl.run({});
		await Event.toPromise(Event.filter(ctrl.onDidChangeState, e => e === State.WAIT_FOR_INPUT));

		const session = interactiveEditorSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 6));

		ctrl.cancelSession();
		d.dispose();
	});

	test('wholeRange expands to whole lines, session provided', async function () {

		editor.setSelection(new Range(1, 1, 1, 1));
		ctrl = instaService.createInstance(TestController, editor);

		const d = interactiveEditorService.addProvider({
			debugName: 'Unit Test',
			prepareInteractiveEditorSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(1, 1, 1, 3)
				};
			},
			provideResponse(session, request) {
				throw new Error();
			}
		});

		ctrl.run({});
		await Event.toPromise(Event.filter(ctrl.onDidChangeState, e => e === State.WAIT_FOR_INPUT));

		const session = interactiveEditorSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 6));

		ctrl.cancelSession();
		d.dispose();
	});

	test('typing outside of wholeRange finishes session', async function () {
		ctrl = instaService.createInstance(TestController, editor);
		ctrl.run({ message: 'Hello', autoSend: true });

		await ctrl.waitFor(TestController.INIT_SEQUENCE_AUTO_SEND);

		const session = interactiveEditorSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 11));

		editor.setSelection(new Range(2, 1, 2, 1));
		editor.trigger('test', 'type', { text: 'a' });

		await ctrl.waitFor([State.ACCEPT]);
	});

	test('\'whole range\' isn\'t updated for edits outside whole range #4346', async function () {

		editor.setSelection(new Range(3, 1, 3, 1));

		const d = interactiveEditorService.addProvider({
			debugName: 'Unit Test',
			prepareInteractiveEditorSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(3, 1, 3, 3)
				};
			},
			provideResponse(session, request) {
				return {
					type: InteractiveEditorResponseType.EditorEdit,
					id: Math.random(),
					edits: [{
						range: new Range(1, 1, 1, 1), // EDIT happens outside of whole range
						text: `${request.prompt}\n${request.prompt}`
					}]
				};
			}
		});
		store.add(d);
		ctrl = instaService.createInstance(TestController, editor);
		ctrl.run({ message: 'Hello', autoSend: false });

		await ctrl.waitFor(TestController.INIT_SEQUENCE);

		const session = interactiveEditorSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(3, 1, 3, 12));

		ctrl.accept();

		await ctrl.waitFor([State.MAKE_REQUEST, State.APPLY_RESPONSE, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);

		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 4, 12));
	});
});
