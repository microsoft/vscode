/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorPart.css';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IAuxiliaryWindowService } from '../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { ILifecycleService } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { IEditorGroupView } from '../../../workbench/browser/parts/editor/editor.js';
import { EditorParts as EditorPartsBase } from '../../../workbench/browser/parts/editor/editorParts.js';
import { GroupIdentifier } from '../../../workbench/common/editor.js';
import { GroupDirection, IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../workbench.js';
import { MainEditorPart } from './editorPart.js';
import { DesktopMainEditorPart } from './desktopEditorPart.js';
import { createMainWindowInstantiationService } from '../../services/sessions/browser/sessionHost.js';

export class EditorParts extends EditorPartsBase {

	/**
	 * The editor parts' scope is the main window's: the main part, floating editor windows and modal editors show the
	 * main window's session host. A part created with services of its own, such as a chat window's, provides its own host.
	 */
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IAuxiliaryWindowService auxiliaryWindowService: IAuxiliaryWindowService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		const mainWindowInstantiationService = createMainWindowInstantiationService(instantiationService);
		super(mainWindowInstantiationService, storageService, themeService, auxiliaryWindowService, contextKeyService, lifecycleService);
		this._register(mainWindowInstantiationService);
	}

	protected override createMainEditorPart(): MainEditorPart {
		const layoutService = this.instantiationService.invokeFunction(accessor => accessor.get(IAgentWorkbenchLayoutService));
		return layoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop
			? this.instantiationService.createInstance(DesktopMainEditorPart, this)
			: this.instantiationService.createInstance(MainEditorPart, this);
	}

	override moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		if (this.involvesDesktopMainPart(group, location)) {
			return this.resolveGroup(group);
		}

		return super.moveGroup(group, location, direction);
	}

	override copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		if (this.involvesDesktopMainPart(group, location)) {
			return this.resolveGroup(group);
		}

		return super.copyGroup(group, location, direction);
	}

	private involvesDesktopMainPart(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier): boolean {
		return this.mainPart instanceof DesktopMainEditorPart
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
