/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsEmptyState.css';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { HiddenItemStrategy, IMenuWorkbenchToolBarOptions, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { SessionsWatermarkActionViewItem } from './emptyEditorGroupAddTab.js';

export class SessionsEmptyStateActions extends Disposable {
	private readonly toolbar: MenuWorkbenchToolBar;

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IMenuWorkbenchToolBarOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		container.classList.add('sessions-watermark-actions');
		const scopedContextKeyService = this._register(contextKeyService.createScoped(container));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this.toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, container, menuId, {
			...options,
			orientation: ActionsOrientation.VERTICAL,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: group => group === 'navigation' },
			actionViewItemProvider: action => scopedInstantiationService.createInstance(SessionsWatermarkActionViewItem, action, commandId => keybindingService.lookupKeybinding(commandId, scopedContextKeyService)),
		}));
	}

	focus(): void {
		this.toolbar.focus();
	}
}
