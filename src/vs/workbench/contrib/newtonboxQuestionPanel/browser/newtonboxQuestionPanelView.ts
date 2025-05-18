/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/questionPanel.css';
import { localize } from '../../../../nls.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
import { QUESTION_PANEL_ID } from '../common/newtonboxQuestionPanel.js';

export class NewtonboxQuestionPanelView extends ViewPane {
    static readonly ID = QUESTION_PANEL_ID;
    static readonly TITLE = localize('newtonboxQuestionPanelView', "Newtonbox Question");

    constructor(
        options: IViewletViewOptions,
        @IKeybindingService keybindingService: IKeybindingService,
        @IContextMenuService contextMenuService: IContextMenuService,
        @IConfigurationService configurationService: IConfigurationService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
        @IInstantiationService instantiationService: IInstantiationService,
        @IOpenerService openerService: IOpenerService,
        @IThemeService themeService: IThemeService,
        @IHoverService hoverService: IHoverService,
        @IAccessibleViewInformationService accessibleViewService: IAccessibleViewInformationService
    ) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    }

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);

        // Create and style the question container
        const questionContainer = document.createElement('div');
        questionContainer.className = 'question-container';

        // Add the hardcoded question
        questionContainer.textContent = 'What is your favorite programming language and why?';

        container.appendChild(questionContainer);
    }

    protected override layoutBody(height: number, width: number): void {
        super.layoutBody(height, width);
    }
}
