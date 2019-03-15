/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CallHierarchyProviderRegistry, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyTreePeekWidget, CallHierarchyColumnPeekWidget } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyPeek';
import { Range } from 'vs/editor/common/core/range';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerEditorContribution, registerEditorAction, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';


const _hasCompletionItemProvider = new RawContextKey<boolean>('editorHasCallHierarchyProvider', false);

registerEditorContribution(class extends Disposable implements IEditorContribution {
	constructor(
		editor: ICodeEditor
	) {
		super();
		const context = editor.invokeWithinContext(accssor => _hasCompletionItemProvider.bindTo(accssor.get(IContextKeyService)));
		this._register(Event.any<any>(editor.onDidChangeModel, editor.onDidChangeModelLanguage, CallHierarchyProviderRegistry.onDidChange)(() => {
			context.set(editor.hasModel() && CallHierarchyProviderRegistry.has(editor.getModel()));
		}));
	}
	getId(): string {
		return 'callhierarch.contextkey';
	}
});

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.showCallHierarchy',
			label: localize('title', "Call Hierarchy"),
			alias: 'Call Hierarchy',
			menuOpts: {
				group: 'navigation',
				order: 111
			},
			precondition: _hasCompletionItemProvider
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {

		const instaService = accessor.get(IInstantiationService);
		const configService = accessor.get(IConfigurationService);

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

		let mode = configService.getValue<'tree' | 'columns'>('callHierarchy.mode');
		let widget: CallHierarchyTreePeekWidget | CallHierarchyColumnPeekWidget;
		if (mode === 'columns') {
			widget = instaService.createInstance(CallHierarchyColumnPeekWidget, editor, provider, CallHierarchyDirection.CallsTo, rootItem);
		} else {
			widget = instaService.createInstance(CallHierarchyTreePeekWidget, editor, provider, CallHierarchyDirection.CallsTo, rootItem);
		}

		const listener = Event.any<any>(editor.onDidChangeModel, editor.onDidChangeModelLanguage)(_ => widget.dispose());
		widget.show(Range.fromPositions(editor.getPosition()));
		widget.onDidClose(() => {
			listener.dispose();
		});
	}
});
