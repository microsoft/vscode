/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/canvases/electron-browser/canvases.contribution.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CanvasInput, ICanvasContextService, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
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
	) {
		super();
		this._register(registerSessionCanvasActions(canvasService, registryService));
	}
}

registerWorkbenchContribution2(SessionCanvasAddTabContribution.ID, SessionCanvasAddTabContribution, WorkbenchPhase.BlockRestore);
