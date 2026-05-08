/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/filesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IViewPaneLocationColors, IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { agentsPanelBackground } from '../../../common/theme.js';
import { ExplorerView } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';

const $ = dom.$;

export const SESSIONS_FILES_VIEW_ID = 'sessions.files.explorer';
export const SESSIONS_FILES_EMPTY_VIEW_ID = 'sessions.files.explorer.empty';

export class SessionsExplorerView extends ExplorerView {
	protected override getLocationBasedColors(): IViewPaneLocationColors {
		const colors = super.getLocationBasedColors();
		return {
			...colors,
			background: agentsPanelBackground,
			listOverrideStyles: {
				...colors.listOverrideStyles,
				listBackground: agentsPanelBackground,
			}
		};
	}
}

export class SessionsExplorerEmptyView extends ViewPane {
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
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const bodyContainer = dom.append(container, $('.files-empty-view-body'));
		const welcomeContainer = dom.append(bodyContainer, $('.files-empty-welcome'));

		const welcomeIcon = dom.append(welcomeContainer, $('.files-empty-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.files));

		const welcomeMessage = dom.append(welcomeContainer, $('.files-empty-welcome-message'));
		welcomeMessage.textContent = localize('filesView.noFiles', "Folders and files will appear here.");
	}
}
