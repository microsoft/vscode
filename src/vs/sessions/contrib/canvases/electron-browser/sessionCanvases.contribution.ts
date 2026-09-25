/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionCanvasService, SessionCanvasesEnabledSettingId, SessionCanvasInput } from '../common/sessionCanvas.js';
import { SessionCanvasEditor, SessionCanvasFocusedContext } from './sessionCanvasEditor.js';
import { SessionCanvasService } from './sessionCanvasService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	title: localize('canvas.configurationTitle', "Agents"),
	properties: {
		[SessionCanvasesEnabledSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			markdownDescription: localize('canvas.configurationDescription', "Show model-opened canvas views in the local Agents window when the connected runtime supports them. This preview preference does not approve extension execution, grant environment access, or override runtime policy."),
		},
	},
});

registerSingleton(ISessionCanvasService, SessionCanvasService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionCanvasEditor, SessionCanvasInput.EDITOR_ID, localize('canvas.editor', "Canvas")),
	[new SyncDescriptor(SessionCanvasInput)],
);

class SessionCanvasesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.canvases';

	constructor(
		@ISessionCanvasService _canvasService: ISessionCanvasService,
	) {
		super();
		for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
			this._register(AccessibleViewRegistry.register({
				type,
				priority: 200,
				name: `sessionCanvas-${type}`,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SessionCanvasesEnabledSettingId}`, true), SessionCanvasFocusedContext),
				getProvider: accessor => {
					const pane = accessor.get(IEditorService).activeEditorPane;
					return pane instanceof SessionCanvasEditor ? pane.createAccessibleProvider(type) : undefined;
				},
			}));
		}
	}
}

registerWorkbenchContribution2(SessionCanvasesContribution.ID, SessionCanvasesContribution, WorkbenchPhase.BlockRestore);
