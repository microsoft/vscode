/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorPart.css';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { EditorParts as EditorPartsBase } from '../../../workbench/browser/parts/editor/editorParts.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { MainEditorPart } from './editorPart.js';
import { SinglePaneMainEditorPart } from './singlePaneEditorPart.js';

export class EditorParts extends EditorPartsBase {
	protected override createMainEditorPart(): MainEditorPart {
		const layoutService = this.instantiationService.invokeFunction(accessor => accessor.get(IAgentWorkbenchLayoutService));
		if (layoutService.isSinglePaneLayoutEnabled) {
			return this.instantiationService.createInstance(SinglePaneMainEditorPart, this);
		}
		return this.instantiationService.createInstance(MainEditorPart, this);
	}
}

registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);
