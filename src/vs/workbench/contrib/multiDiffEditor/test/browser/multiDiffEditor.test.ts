/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { FloatingEditorToolbarWidget } from '../../../../../editor/contrib/floatingMenu/browser/floatingMenu.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { MultiDiffEditor } from '../../browser/multiDiffEditor.js';

suite('MultiDiffEditor lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('clears the view model before the editor group can dispose its scoped services', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		const root = document.createElement('div');
		let cleared = 0;
		instantiation.stubInstance(MultiDiffEditorWidget, {
			onDidChangeActiveControl: Event.None,
			getRootElement: () => root,
			getContextKeyService: () => instantiation.get(IContextKeyService),
			getScopedInstantiationService: () => instantiation,
			setViewModel: () => { cleared++; },
			dispose: () => { },
		});
		instantiation.stubInstance(FloatingEditorToolbarWidget, {
			element: document.createElement('div'),
			hasActions: constObservable(false),
			dispose: () => { },
		});
		const editor = store.add(instantiation.createInstance(MultiDiffEditor, new TestEditorGroupView(1)));
		editor.create(root);
		editor.clearInput();
		const clearedSynchronously = cleared;
		editor.dispose();
		await timeout(0);
		assert.deepStrictEqual({ clearedSynchronously, afterDisposal: cleared }, { clearedSynchronously: 1, afterDisposal: 1 });
	});
});
