/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICanvasService, CanvasInput } from '../common/canvas.js';
import { CanvasEditor, SessionCanvasFocusedContext } from './canvasEditor.js';
import { CanvasService } from './canvasService.js';

registerSingleton(ICanvasService, CanvasService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(CanvasEditor, CanvasInput.EDITOR_ID, localize('canvas.editor', "Canvas")),
	[new SyncDescriptor(CanvasInput)],
);

class CanvasesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.canvases';

	constructor(
		@ICanvasService _canvasService: ICanvasService,
	) {
		super();
		for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
			this._register(AccessibleViewRegistry.register({
				type,
				priority: 200,
				name: `sessionCanvas-${type}`,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, SessionCanvasFocusedContext),
				getProvider: accessor => {
					const pane = accessor.get(IEditorService).activeEditorPane;
					return pane instanceof CanvasEditor ? pane.createAccessibleProvider(type) : undefined;
				},
			}));
		}
	}
}

registerWorkbenchContribution2(CanvasesContribution.ID, CanvasesContribution, WorkbenchPhase.BlockRestore);
