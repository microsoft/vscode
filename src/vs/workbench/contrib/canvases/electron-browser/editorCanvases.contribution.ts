/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './canvases.contribution.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { registerEditorCanvasActions } from '../browser/editorCanvasActions.js';
import { ICanvasContextService, ICanvasService } from '../common/canvas.js';
import { EditorCanvasContextService } from './editorCanvasContextService.js';

registerSingleton(ICanvasContextService, EditorCanvasContextService, InstantiationType.Delayed);

class EditorCanvasActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorCanvasActions';

	constructor(
		@ICanvasService canvasService: ICanvasService,
		@IChatWidgetService widgetService: IChatWidgetService,
		@ILogService logService: ILogService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		this._register(registerEditorCanvasActions(canvasService, widgetService, logService, notificationService));
	}
}

registerWorkbenchContribution2(EditorCanvasActionsContribution.ID, EditorCanvasActionsContribution, WorkbenchPhase.BlockRestore);
