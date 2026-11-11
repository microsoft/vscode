/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ISessionsStorageService } from '../../../../services/sessions/browser/sessionsStorageService.js';
import { AgentsProfileSessionsStorageService } from './agentsProfileSessionsStorageService.js';

/**
 * Shows in place of the Sessions view of an editor window, as a progress bar, while the state it shares with the Agents
 * window loads: its view container is then not empty as the window restores it.
 */
export class AgentsViewLoadingPane extends ViewPane {

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ISessionsStorageService sessionsStorageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// The Sessions view shows only once the state loads, which starts as its storage is created: this view, which shows
		// until then, starts it, as nothing else might, such as when the chat part does not show either
		if (sessionsStorageService instanceof AgentsProfileSessionsStorageService) {
			void sessionsStorageService.whenReady();
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.setAttribute('aria-label', localize('agentsView.loading', "Loading sessions"));
		const progress = this.getProgressIndicator().show(true);
		this._register(toDisposable(() => progress.done()));
	}
}
