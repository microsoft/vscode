/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/canvases/electron-browser/canvases.contribution.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { registerCanvasContextPicker } from '../../../../workbench/contrib/canvases/browser/canvasContextPicker.js';
import { CanvasInput, getCanvasReferenceKey, ICanvasContextService, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { ActiveSessionCanvasReferenceContext } from '../../../common/contextkeys.js';
import { ISessionCanvasRegistryService } from '../common/sessionCanvas.js';
import { registerSessionCanvasActions } from './sessionCanvasActions.js';
import { SessionCanvasContextService, SessionCanvasRegistryService } from './sessionCanvasService.js';
import { SessionCanvasSerializer } from './sessionCanvasSerializer.js';
import { PinnedCanvasPageContribution } from './pinnedCanvasPage.js';
import './pinnedCanvasActions.js';

registerSingleton(ICanvasContextService, SessionCanvasContextService, InstantiationType.Delayed);
registerSingleton(ISessionCanvasRegistryService, SessionCanvasRegistryService, InstantiationType.Delayed);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(CanvasInput.ID, SessionCanvasSerializer);

class SessionCanvasAddTabContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.canvasAddTab';

	constructor(
		@ICanvasService canvasService: ICanvasService,
		@ISessionCanvasRegistryService registryService: ISessionCanvasRegistryService,
		@ICanvasContextService contextService: ICanvasContextService,
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IMenuService menuService: IMenuService,
		@INotificationService notificationService: INotificationService,
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);
		this._register(bindContextKey(ActiveSessionCanvasReferenceContext, contextKeyService, reader => {
			const input = activeEditor.read(reader);
			return input instanceof CanvasInput ? getCanvasReferenceKey(input.reference) : '';
		}));
		this._register(registerSessionCanvasActions(canvasService, registryService, contextService));
		this._register(registerCanvasContextPicker(contextPickService, menuService, notificationService, Menus.SessionsEditorTabsBarAddTabCanvas));
	}
}

registerWorkbenchContribution2(SessionCanvasAddTabContribution.ID, SessionCanvasAddTabContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(PinnedCanvasPageContribution.ID, PinnedCanvasPageContribution, WorkbenchPhase.BlockRestore);
