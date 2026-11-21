/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RedoCommand, UndoCommand } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupContextKeyProvider, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestEditorInput } from '../../../../test/browser/workbenchTestServices.js';
import { IWebview, IWebviewService } from '../../../webview/browser/webview.js';
import { CustomEditorSideBySideDiffInput } from '../../browser/customEditorDiffInput.js';
import { CustomEditorInput } from '../../browser/customEditorInput.js';
import { CustomEditorService } from '../../browser/customEditors.js';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, ICustomEditorCompatibleInput } from '../../common/customEditor.js';

suite('CustomEditorService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('activeCustomEditorId reports built-in editors that replaced a custom editor', () => {
		const contextKeyProviders = new Map<string, IEditorGroupContextKeyProvider<ContextKeyValue>>();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override registerContextKeyProvider<T extends ContextKeyValue>(provider: IEditorGroupContextKeyProvider<T>): IDisposable {
				contextKeyProviders.set(provider.contextKey.key, provider);
				return Disposable.None;
			}
		}();
		const fileService = new class extends mock<IFileService>() {
			override readonly onDidRunOperation = Event.None;
		}();
		disposables.add(new CustomEditorService(fileService, new class extends mock<IEditorService>() { }(), editorGroupsService));

		class CompatibleEditorInput extends TestEditorInput implements ICustomEditorCompatibleInput {
			readonly customEditorViewType = 'test.replacedCustomEditor';
		}
		const activeCustomEditorId = (input: EditorInput) => contextKeyProviders.get(CONTEXT_ACTIVE_CUSTOM_EDITOR_ID.key)?.getGroupContextKeyValue(new class extends mock<IEditorGroup>() {
			override readonly activeEditorPane = new class extends mock<IVisibleEditorPane>() {
				override readonly input = input;
			}();
		}());

		assert.deepStrictEqual({
			compatible: activeCustomEditorId(disposables.add(new CompatibleEditorInput(URI.file('/test/pic.png'), 'testEditor'))),
			other: activeCustomEditorId(disposables.add(new TestEditorInput(URI.file('/test/readme.md'), 'testEditor'))),
		}, {
			compatible: 'test.replacedCustomEditor',
			other: '',
		});
	});

	test('Undo and Redo routing with focused webviews', () => {
		let activeEditor: EditorInput | undefined;
		const editorService = new class extends mock<IEditorService>() {
			override get activeEditor(): EditorInput | undefined {
				return activeEditor;
			}
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override registerContextKeyProvider(): IDisposable {
				return Disposable.None;
			}
		}();
		const fileService = new class extends mock<IFileService>() {
			override readonly onDidRunOperation = Event.None;
		}();

		disposables.add(new CustomEditorService(fileService, editorService, editorGroupsService));

		let lowerPriorityUndoRan = false;
		let lowerPriorityRedoRan = false;
		disposables.add(UndoCommand.addImplementation(100, 'test-lower-priority-undo', () => {
			lowerPriorityUndoRan = true;
			return true;
		}));
		disposables.add(RedoCommand.addImplementation(100, 'test-lower-priority-redo', () => {
			lowerPriorityRedoRan = true;
			return true;
		}));

		let activeWebview: IWebview | undefined;
		const webviewService = new class extends mock<IWebviewService>() {
			override get activeWebview(): IWebview | undefined {
				return activeWebview;
			}
		}();

		const accessor: ServicesAccessor = {
			get: <T>(id: any): T => {
				if (id === IWebviewService) {
					return webviewService as unknown as T;
				}
				if (id === ICodeEditorService) {
					return new class extends mock<ICodeEditorService>() {
						override getFocusedCodeEditor() { return null; }
						override getActiveCodeEditor() { return null; }
					}() as unknown as T;
				}
				if (id === ILogService) {
					return new class extends mock<ILogService>() {
						override trace(): void { }
					}() as unknown as T;
				}
				if (id === IContextKeyService) {
					return new class extends mock<IContextKeyService>() {
						override getContext() { return null as any; }
					}() as unknown as T;
				}
				throw new Error(`Unexpected service request for ${id}`);
			}
		};

		const unrelatedWebview = new class extends mock<IWebview>() {
			override readonly isFocused = true;
		}();
		const customEditorWebview = new class extends mock<IWebview>() {
			override readonly isFocused = true;
		}();

		function createCustomEditorInput(webview: IWebview) {
			let undoCalls = 0;
			let redoCalls = 0;
			const input = Object.create(CustomEditorInput.prototype);
			Object.defineProperty(input, 'webview', { value: webview, configurable: true, writable: true });
			input.undo = () => { undoCalls++; return true; };
			input.redo = () => { redoCalls++; return true; };
			input.getUndoCalls = () => undoCalls;
			input.getRedoCalls = () => redoCalls;
			return input;
		}

		// 1. Single custom editor with unrelated focused webview: lower priority handler is reached
		const singleEditor = createCustomEditorInput(customEditorWebview);
		activeEditor = singleEditor;
		activeWebview = unrelatedWebview;
		lowerPriorityUndoRan = false;
		lowerPriorityRedoRan = false;

		UndoCommand.runCommand(accessor, undefined);
		assert.strictEqual(singleEditor.getUndoCalls(), 0);
		assert.strictEqual(lowerPriorityUndoRan, true);

		RedoCommand.runCommand(accessor, undefined);
		assert.strictEqual(singleEditor.getRedoCalls(), 0);
		assert.strictEqual(lowerPriorityRedoRan, true);

		// 2. Single custom editor with its own focused webview: custom editor undo/redo runs
		activeWebview = customEditorWebview;
		lowerPriorityUndoRan = false;
		lowerPriorityRedoRan = false;

		UndoCommand.runCommand(accessor, undefined);
		assert.strictEqual(singleEditor.getUndoCalls(), 1);
		assert.strictEqual(lowerPriorityUndoRan, false);

		RedoCommand.runCommand(accessor, undefined);
		assert.strictEqual(singleEditor.getRedoCalls(), 1);
		assert.strictEqual(lowerPriorityRedoRan, false);

		// 3. Side-by-side diff editor
		const originalWebview = new class extends mock<IWebview>() {
			override readonly isFocused = true;
		}();
		const modifiedWebview = new class extends mock<IWebview>() {
			override readonly isFocused = true;
		}();

		function createSideBySideDiffInput(origWebview: IWebview, modWebview: IWebview) {
			let undoCalls = 0;
			let redoCalls = 0;
			const orig = Object.create(CustomEditorSideBySideDiffInput.prototype);
			Object.defineProperty(orig, 'webview', { value: origWebview, configurable: true, writable: true });

			const mod = Object.create(CustomEditorSideBySideDiffInput.prototype);
			Object.defineProperty(mod, 'webview', { value: modWebview, configurable: true, writable: true });
			mod.undo = () => { undoCalls++; return true; };
			mod.redo = () => { redoCalls++; return true; };
			mod.getUndoCalls = () => undoCalls;
			mod.getRedoCalls = () => redoCalls;

			const diff = Object.create(DiffEditorInput.prototype);
			Object.defineProperty(diff, 'original', { value: orig, configurable: true, writable: true });
			Object.defineProperty(diff, 'modified', { value: mod, configurable: true, writable: true });
			return { diff, mod };
		}

		const { diff, mod } = createSideBySideDiffInput(originalWebview, modifiedWebview);
		activeEditor = diff;

		// 3a. Diff editor with original side focused: custom editor undo/redo runs
		activeWebview = originalWebview;
		lowerPriorityUndoRan = false;
		lowerPriorityRedoRan = false;

		UndoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getUndoCalls(), 1);
		assert.strictEqual(lowerPriorityUndoRan, false);

		RedoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getRedoCalls(), 1);
		assert.strictEqual(lowerPriorityRedoRan, false);

		// 3b. Diff editor with modified side focused: custom editor undo/redo runs
		activeWebview = modifiedWebview;
		lowerPriorityUndoRan = false;
		lowerPriorityRedoRan = false;

		UndoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getUndoCalls(), 2);
		assert.strictEqual(lowerPriorityUndoRan, false);

		RedoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getRedoCalls(), 2);
		assert.strictEqual(lowerPriorityRedoRan, false);

		// 3c. Diff editor with unrelated webview focused: lower priority handler is reached
		activeWebview = unrelatedWebview;
		lowerPriorityUndoRan = false;
		lowerPriorityRedoRan = false;

		UndoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getUndoCalls(), 2);
		assert.strictEqual(lowerPriorityUndoRan, true);

		RedoCommand.runCommand(accessor, undefined);
		assert.strictEqual(mod.getRedoCalls(), 2);
		assert.strictEqual(lowerPriorityRedoRan, true);
	});
});
