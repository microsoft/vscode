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
import { UndoCommand, RedoCommand } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupContextKeyProvider, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestEditorInput } from '../../../../test/browser/workbenchTestServices.js';
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

	test('blocks workbench undo and redo when active custom editor is read-only', () => {
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override registerContextKeyProvider(): IDisposable {
				return Disposable.None;
			}
		}();
		const fileService = new class extends mock<IFileService>() {
			override readonly onDidRunOperation = Event.None;
		}();
		let readonly = true;
		const calls: string[] = [];
		const activeEditor = Object.create(CustomEditorInput.prototype) as CustomEditorInput;
		Object.assign(activeEditor, {
			isReadonly: () => readonly,
			undo: () => { calls.push('undo'); },
			redo: () => { calls.push('redo'); },
		});
		const editorService = new class extends mock<IEditorService>() {
			override readonly activeEditor = activeEditor;
			override readonly activeEditorPane = undefined;
		}();
		disposables.add(new CustomEditorService(fileService, editorService, editorGroupsService));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ICodeEditorService, { getFocusedCodeEditor: () => null });
		instantiationService.stub(IEditorService, editorService);
		instantiationService.invokeFunction(accessor => {
			UndoCommand.runCommand(accessor, {});
			RedoCommand.runCommand(accessor, {});
		});
		assert.deepStrictEqual(calls, []);

		readonly = false;
		instantiationService.invokeFunction(accessor => {
			UndoCommand.runCommand(accessor, {});
			RedoCommand.runCommand(accessor, {});
		});
		assert.deepStrictEqual(calls, ['undo', 'redo']);
	});
});
