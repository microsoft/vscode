/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { EmptyFileEditor } from './emptyFileEditor.js';
import { EmptyFileEditorInput, EmptyFileEditorSerializer } from './emptyFileEditorInput.js';

/**
 * Registers the empty-file editor (the "Select a file or search with <kbd>" placeholder pane) and
 * its serializer, but only in the single-pane layout where the "Files" add-tab flow uses it.
 * Registered at startup (before editor restore) so persisted empty-file tabs can be deserialized.
 * Opening it is owned by `addTabActions.ts`'s "Files" action.
 */
class SinglePaneEmptyFileEditorContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.singlePaneEmptyFileEditor';

	constructor(
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();

		if (!layoutService.isSinglePaneLayoutEnabled) {
			return;
		}

		this._register(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(
				EmptyFileEditor,
				EmptyFileEditor.ID,
				localize('emptyFileEditor.label', "File")
			),
			[new SyncDescriptor(EmptyFileEditorInput)]
		));

		this._register(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
			EmptyFileEditorInput.ID,
			EmptyFileEditorSerializer
		));
	}
}

registerWorkbenchContribution2(SinglePaneEmptyFileEditorContribution.ID, SinglePaneEmptyFileEditorContribution, WorkbenchPhase.BlockStartup);
