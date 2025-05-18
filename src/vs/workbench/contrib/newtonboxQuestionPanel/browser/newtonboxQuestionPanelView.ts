/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/questionPanel.css';
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
import { IProductService } from '../../../../platform/product/common/productService.js';

export class NewtonboxQuestionPanelView extends ViewPane {

    constructor(
        options: IViewletViewOptions,
        @IKeybindingService keybindingService: IKeybindingService,
        @IContextMenuService contextMenuService: IContextMenuService,
        @IConfigurationService protected override readonly configurationService: IConfigurationService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
        @IInstantiationService instantiationService: IInstantiationService,
        @IOpenerService openerService: IOpenerService,
        @IThemeService themeService: IThemeService,
        @IHoverService hoverService: IHoverService,
        @IAccessibleViewInformationService accessibleViewService: IAccessibleViewInformationService,
        @IProductService private readonly productService: IProductService
    ) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    }

    private renderError(message: string): string {
        return `
            <div style="color: var(--vscode-errorForeground); padding: 10px;">
                <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Error Loading Question</div>
                <div>${message}</div>
            </div>
        `;
    }

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);

        // Create and style the question container
        const questionContainer = document.createElement('div');
        questionContainer.className = 'question-container';

        // Get question from product configuration
        const questionHtml = this.productService.newtonboxQuestion;
        
        if (!questionHtml) {
            console.error('newtonboxQuestion is not set in product configuration');
            questionContainer.innerHTML = this.renderError(
                'The question content is not configured. Please set the NEWTONBOX_QUESTION environment variable with HTML content.'
            );
        } else {
            questionContainer.innerHTML = questionHtml;
        }

        container.appendChild(questionContainer);
    }

    protected override layoutBody(height: number, width: number): void {
        super.layoutBody(height, width);
    }
}
