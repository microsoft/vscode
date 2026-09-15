/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IActiveNotebookEditorDelegate, INotebookEditorDelegate } from '../../browser/notebookBrowser.js';
import { NotebookDisplayOptions, NotebookOptions } from '../../browser/notebookOptions.js';
import { BaseCellEditorOptions } from '../../browser/viewModel/cellEditorOptions.js';

suite('BaseCellEditorOptions', () => {
	let disposables: DisposableStore;

	setup(() => disposables = new DisposableStore());
	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('context menus render outside the notebook overlay', () => {
		const configurationService = new TestConfigurationService({ editor: { useShadowDOM: true } });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);

		const notebookEditor = new class extends mock<INotebookEditorDelegate>() {
			override readonly onDidChangeModel = Event.None;
			override readonly isReadOnly = false;
			override hasModel(): this is IActiveNotebookEditorDelegate { return false; }
		};
		const notebookOptions = new class extends mock<NotebookOptions>() {
			override readonly onDidChangeOptions = Event.None;
			override getDisplayOptions(): NotebookDisplayOptions {
				return { editorOptionsCustomizations: undefined } as NotebookDisplayOptions;
			}
		};

		const options = disposables.add(new BaseCellEditorOptions(notebookEditor, notebookOptions, configurationService, 'typescript'));

		assert.strictEqual(options.value.useShadowDOM, false);
	});
});
