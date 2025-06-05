/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { HideWebViewEditorFindCommand, ReloadWebviewAction, ShowWebViewEditorFindWidgetAction, WebViewEditorFindNextCommand, WebViewEditorFindPreviousCommand } from './webviewCommands.js';
import { WebviewEditor } from './webviewEditor.js';
import { WebviewInput } from './webviewEditorInput.js';
import { WebviewEditorInputSerializer } from './webviewEditorInputSerializer.js';
import { IWebviewWorkbenchService, WebviewEditorService } from './webviewWorkbenchService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)).registerEditorPane(EditorPaneDescriptor.create(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);

class WebviewPanelContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.webviewPanel';

	constructor(
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super();

		this._register(editorService.onWillOpenEditor(e => {
			const group = editorGroupService.getGroup(e.groupId);
			if (group) {
				this.onEditorOpening(e.editor, group);
			}
		}));
	}

	private onEditorOpening(
		editor: EditorInput,
		group: IEditorGroup
	): void {
		if (!(editor instanceof WebviewInput) || editor.typeId !== WebviewInput.typeId) {
			return;
		}

		if (group.contains(editor)) {
			return;
		}

		let previousGroup: IEditorGroup | undefined;
		const groups = this.editorGroupService.groups;
		for (const group of groups) {
			if (group.contains(editor)) {
				previousGroup = group;
				break;
			}
		}

		if (!previousGroup) {
			return;
		}

		previousGroup.closeEditor(editor);
	}
}

registerWorkbenchContribution2(WebviewPanelContribution.ID, WebviewPanelContribution, WorkbenchPhase.BlockStartup);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	WebviewEditorInputSerializer.ID,
	WebviewEditorInputSerializer);

registerSingleton(IWebviewWorkbenchService, WebviewEditorService, InstantiationType.Delayed);

registerAction2(ShowWebViewEditorFindWidgetAction);
registerAction2(HideWebViewEditorFindCommand);
registerAction2(WebViewEditorFindNextCommand);
registerAction2(WebViewEditorFindPreviousCommand);
registerAction2(ReloadWebviewAction);
