/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { DiffEditorCommandsService, FocusTextDiffEditorMode } from '../../../../browser/parts/editor/diffEditorCommandsService.js';
import { TextDiffEditor } from '../../../../browser/parts/editor/textDiffEditor.js';
import { IEditorPane, IVisibleEditorPane } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

suite('DiffEditorCommandsService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IWrite { readonly resource: URI | undefined; readonly key: string; readonly value: unknown }

	function createModifiedEditor(model: ITextModel | undefined, hasFocus: boolean): ICodeEditor {
		return new class extends mock<ICodeEditor>() {
			override getModel() { return model ?? null; }
			override focus() { focusCalls.push('modified'); }
			override hasTextFocus() { return false; }
			override hasWidgetFocus() { return hasFocus; }
		};
	}

	function createOriginalEditor(hasFocus: boolean): ICodeEditor {
		return new class extends mock<ICodeEditor>() {
			override focus() { focusCalls.push('original'); }
			override hasTextFocus() { return hasFocus; }
			override hasWidgetFocus() { return hasFocus; }
		};
	}

	let focusCalls: string[] = [];
	let goToDiffCalls: Array<'next' | 'previous'> = [];

	function createDiffEditorControl(model: ITextModel | undefined, originalFocused: boolean, modifiedFocused: boolean): IDiffEditor {
		return new class extends mock<IDiffEditor>() {
			override getOriginalEditor() { return createOriginalEditor(originalFocused); }
			override getModifiedEditor() { return createModifiedEditor(model, modifiedFocused); }
			override goToDiff(target: 'next' | 'previous') { goToDiffCalls.push(target); }
		};
	}

	function createTextDiffEditor(control: IDiffEditor | undefined): TextDiffEditor {
		const editor = Object.create(TextDiffEditor.prototype) as TextDiffEditor;
		(editor as unknown as { getControl(): IDiffEditor | undefined }).getControl = () => control;
		return editor;
	}

	function createService(activeEditorPane: IEditorPane | undefined): { service: DiffEditorCommandsService; resourceWrites: IWrite[] } {
		const resourceWrites: IWrite[] = [];

		const editorService = new class extends mock<IEditorService>() {
			override get activeEditorPane() { return activeEditorPane as IVisibleEditorPane | undefined; }
			override get activeEditor() { return undefined; }
			override get visibleEditorPanes() { return []; }
			override get visibleEditors() { return []; }
		};
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() {
			override getValue<T>(): T { return true as unknown as T; }
			override updateValue(resource: URI | undefined, key: string, value: unknown): Promise<void> {
				resourceWrites.push({ resource, key, value });
				return Promise.resolve();
			}
		};
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override getContextKeyValue<T>(): T | undefined { return undefined; }
		};

		const service = new DiffEditorCommandsService(editorService, textResourceConfigurationService, contextKeyService);
		return { service, resourceWrites };
	}

	setup(() => {
		focusCalls = [];
		goToDiffCalls = [];
	});

	test('navigateInDiffEditor goes to the next/previous change of the active text diff editor', () => {
		const control = createDiffEditorControl(undefined, false, false);
		const { service } = createService(createTextDiffEditor(control));

		service.navigateInDiffEditor([], true);
		service.navigateInDiffEditor([], false);

		assert.deepStrictEqual(goToDiffCalls, ['next', 'previous']);
	});

	test('navigateInDiffEditor is a no-op when there is no active text diff editor', () => {
		const { service } = createService(undefined);

		service.navigateInDiffEditor([], true);

		assert.deepStrictEqual(goToDiffCalls, []);
	});

	test('focusInDiffEditor focuses the requested side', () => {
		const control = createDiffEditorControl(undefined, false, false);
		const { service } = createService(createTextDiffEditor(control));

		service.focusInDiffEditor([], FocusTextDiffEditorMode.Original);
		service.focusInDiffEditor([], FocusTextDiffEditorMode.Modified);

		assert.deepStrictEqual(focusCalls, ['original', 'modified']);
	});

	test('focusInDiffEditor toggle focuses the other side', () => {
		const modifiedFocusedControl = createDiffEditorControl(undefined, false, true);
		const { service: service1 } = createService(createTextDiffEditor(modifiedFocusedControl));
		service1.focusInDiffEditor([], FocusTextDiffEditorMode.Toggle);
		assert.deepStrictEqual(focusCalls, ['original']);

		focusCalls = [];

		const originalFocusedControl = createDiffEditorControl(undefined, false, false);
		const { service: service2 } = createService(createTextDiffEditor(originalFocusedControl));
		service2.focusInDiffEditor([], FocusTextDiffEditorMode.Toggle);
		assert.deepStrictEqual(focusCalls, ['modified']);
	});

	test('toggleDiffIgnoreTrimWhitespace flips the setting for the modified side model', async () => {
		const model = { uri: URI.file('/foo.txt') } as ITextModel;
		const control = createDiffEditorControl(model, false, false);
		const { service, resourceWrites } = createService(createTextDiffEditor(control));

		await service.toggleDiffIgnoreTrimWhitespace([]);

		assert.deepStrictEqual(resourceWrites, [{ resource: model.uri, key: 'diffEditor.ignoreTrimWhitespace', value: false }]);
	});

	test('toggleDiffIgnoreTrimWhitespace is a no-op when there is no modified model', async () => {
		const control = createDiffEditorControl(undefined, false, false);
		const { service, resourceWrites } = createService(createTextDiffEditor(control));

		await service.toggleDiffIgnoreTrimWhitespace([]);

		assert.deepStrictEqual(resourceWrites, []);
	});
});
