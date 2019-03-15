/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CallHierarchyProviderRegistry, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyTreePeekWidget, CallHierarchyColumnPeekWidget } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyPeek';
import { Range } from 'vs/editor/common/core/range';
import { Event } from 'vs/base/common/event';

const tree = false;

registerAction({
	id: 'editor.showCallHierarchy',
	title: {
		value: localize('title', "Show Call Hierarchy"),
		original: 'Show Call Hierarchy'
	},
	menu: {
		menuId: MenuId.CommandPalette
	},
	handler: async function (accessor) {

		const instaService = accessor.get(IInstantiationService);
		const editorService = accessor.get(ICodeEditorService);

		const editor = editorService.getActiveCodeEditor();
		if (!editor || !editor.hasModel()) {
			console.log('bad editor');
			return;
		}

		const [provider] = CallHierarchyProviderRegistry.ordered(editor.getModel());
		if (!provider) {
			console.log('no provider');
			return;
		}

		const rootItem = await provider.provideCallHierarchyItem(editor.getModel(), editor.getPosition(), CancellationToken.None);
		if (!rootItem) {
			console.log('no data');
			return;
		}

		if (tree) {
			const widget = instaService.createInstance(CallHierarchyTreePeekWidget, editor, provider, CallHierarchyDirection.CallsTo, rootItem);
			const listener = Event.any<any>(editor.onDidChangeModel, editor.onDidChangeModelLanguage)(_ => widget.dispose());
			widget.show(Range.fromPositions(editor.getPosition()));
			widget.onDidClose(() => {
				console.log('DONE');
				listener.dispose();
			});
			widget.tree.onDidOpen(e => {
				const [element] = e.elements;
				if (element) {
					console.log(element);
				}
			});

		} else {
			const widget = instaService.createInstance(CallHierarchyColumnPeekWidget, editor, provider, CallHierarchyDirection.CallsTo, rootItem);
			const listener = Event.any<any>(editor.onDidChangeModel, editor.onDidChangeModelLanguage)(_ => widget.dispose());
			widget.show(Range.fromPositions(editor.getPosition()));
			widget.onDidClose(() => {
				console.log('DONE');
				listener.dispose();
			});
		}
	}
});
