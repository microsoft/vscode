/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CallHierarchyProviderRegistry, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';

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
		const editor = accessor.get(ICodeEditorService).getActiveCodeEditor();

		if (!editor || !editor.hasModel()) {
			console.log('bad editor');
			return;
		}

		const [provider] = CallHierarchyProviderRegistry.ordered(editor.getModel());
		if (!provider) {
			console.log('no provider');
			return;
		}

		const data = await provider.provideCallHierarchyItem(editor.getModel(), editor.getPosition(), CancellationToken.None);
		if (!data) {
			console.log('no data');
			return;
		}

		const callsTo = await provider.resolveCallHierarchyItem(data, CallHierarchyDirection.CallsTo, CancellationToken.None);
		console.log(data);
		console.log(callsTo);
	}
});
