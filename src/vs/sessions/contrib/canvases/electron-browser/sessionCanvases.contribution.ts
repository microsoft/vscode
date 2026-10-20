/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/canvases/electron-browser/canvases.contribution.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { registerCanvasContextPicker } from '../../../../workbench/contrib/canvases/browser/canvasContextPicker.js';
import { CanvasInput, ICanvasContextService, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionCanvasRegistryService } from '../common/sessionCanvas.js';
import { registerSessionCanvasActions } from './sessionCanvasActions.js';
import { SessionCanvasContextService, SessionCanvasRegistryService } from './sessionCanvasService.js';
import { SessionCanvasSerializer } from './sessionCanvasSerializer.js';

registerSingleton(ICanvasContextService, SessionCanvasContextService, InstantiationType.Delayed);
registerSingleton(ISessionCanvasRegistryService, SessionCanvasRegistryService, InstantiationType.Delayed);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(CanvasInput.ID, SessionCanvasSerializer);

class SessionCanvasAddTabContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.canvasAddTab';

	constructor(
		@ICanvasService canvasService: ICanvasService,
		@ISessionCanvasRegistryService registryService: ISessionCanvasRegistryService,
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IMenuService menuService: IMenuService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		this._register(registerSessionCanvasActions(canvasService, registryService));
		this._register(registerCanvasContextPicker(contextPickService, menuService, notificationService, Menus.SessionsEditorTabsBarAddTabCanvas));
	}
}

registerWorkbenchContribution2(SessionCanvasAddTabContribution.ID, SessionCanvasAddTabContribution, WorkbenchPhase.BlockRestore);
