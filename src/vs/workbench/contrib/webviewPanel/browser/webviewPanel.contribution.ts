/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { HideWebViewEditorFindCommand, ReloadWebviewAction, ShowWebViewEditorFindWidgetAction, WebViewEditorFindNextCommand, WebViewEditorFindPreviousCommand } from './webviewCommands';
import { WebviewEditor } from './webviewEditor';
import { WebviewInput } from './webviewEditorInput';
import { WebviewEditorInputSerializer } from './webviewEditorInputSerializer';
import { IWebviewWorkbenchService, WebviewEditorService } from './webviewWorkbenchService';

(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)).registerEditorPane(EditorPaneDescriptor.create(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);

class WebviewPanelContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
	) {
		super();

		// Add all the initial groups to be listened to
		this.editorGroupService.whenReady.then(() => this.editorGroupService.groups.forEach(group => {
			this.registerGroupListener(group);
		}));

		// Additional groups added should also be listened to
		this._register(this.editorGroupService.onDidAddGroup(group => this.registerGroupListener(group)));
	}

	private registerGroupListener(group: IEditorGroup): void {
		const listener = group.onWillOpenEditor(e => this.onEditorOpening(e.editor, group));

		Event.once(group.onWillDispose)(() => {
			listener.dispose();
		});
	}

	private onEditorOpening(
		editor: EditorInput,
		group: IEditorGroup
	): void {
		if (!(editor instanceof WebviewInput) || editor.typeId !== WebviewInput.typeId) {
			return undefined;
		}

		if (group.contains(editor)) {
			return undefined;
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
			return undefined;
		}

		previousGroup.closeEditor(editor);
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(WebviewPanelContribution, 'WebviewPanelContribution', LifecyclePhase.Starting);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	WebviewEditorInputSerializer.ID,
	WebviewEditorInputSerializer);

registerSingleton(IWebviewWorkbenchService, WebviewEditorService, true);

registerAction2(ShowWebViewEditorFindWidgetAction);
registerAction2(HideWebViewEditorFindCommand);
registerAction2(WebViewEditorFindNextCommand);
registerAction2(WebViewEditorFindPreviousCommand);
registerAction2(ReloadWebviewAction);
