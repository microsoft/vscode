/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorPart.css';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IEditorGroupView } from '../../../workbench/browser/parts/editor/editor.js';
import { EditorParts as EditorPartsBase } from '../../../workbench/browser/parts/editor/editorParts.js';
import { GroupIdentifier } from '../../../workbench/common/editor.js';
import { GroupDirection, IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { MainEditorPart } from './editorPart.js';
import { SinglePaneMainEditorPart } from './singlePaneEditorPart.js';

export class EditorParts extends EditorPartsBase {
	protected override createMainEditorPart(): MainEditorPart {
		const layoutService = this.instantiationService.invokeFunction(accessor => accessor.get(IAgentWorkbenchLayoutService));
		const editorPart = layoutService.isSinglePaneLayoutEnabled
			? this.instantiationService.createInstance(SinglePaneMainEditorPart, this)
			: this.instantiationService.createInstance(MainEditorPart, this);
		this._register(editorPart.enforcePartOptions({ tabActionReserveSpace: false }));

		return editorPart;
	}

	override moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		if (this.involvesSinglePaneMainPart(group, location)) {
			return this.resolveGroup(group);
		}

		return super.moveGroup(group, location, direction);
	}

	override copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		if (this.involvesSinglePaneMainPart(group, location)) {
			return this.resolveGroup(group);
		}

		return super.copyGroup(group, location, direction);
	}

	private involvesSinglePaneMainPart(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier): boolean {
		return this.mainPart instanceof SinglePaneMainEditorPart
			&& (this.getPart(group) === this.mainPart || this.getPart(location) === this.mainPart);
	}

	private resolveGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		const resolvedGroup = typeof group === 'number' ? this.getGroup(group) : group;
		if (!resolvedGroup) {
			throw new Error('Invalid editor group provided!');
		}
		return resolvedGroup;
	}
}

registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);
