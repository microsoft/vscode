/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry, ViewContainer } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { NewtonboxQuestionPanelView } from './newtonboxQuestionPanelView.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

const QUESTION_PANEL_CONTAINER_ID = 'workbench.view.newtonboxQuestionPanel';
const QUESTION_PANEL_ID = 'newtonboxQuestionPanel.mainView';
const QUESTION_PANEL_TITLE = localize('newtonboxQuestionPanel', "Newtonbox Question Panel");

class NewtonboxQuestionPanelContribution extends Disposable {
    private viewContainer: ViewContainer | undefined;
    private questionPanelIcon: ThemeIcon | undefined;

    constructor(
        @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
        @IViewsService private readonly viewsService: IViewsService,
        @IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
        @IProductService private readonly productService: IProductService,
    ) {
        super();
        if(!this.productService.newtonboxQuestionVisible)
            return;
        this.questionPanelIcon = registerIcon('newtonbox-question-panel-icon', { fontCharacter: 'Q' }, localize('newtonboxQuestionPanelIcon', 'Icon for the Newtonbox Question Panel'));
        this.registerViews();
        this.handleInitialization();
    }

    private registerViews() {

        this.viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
            {
                id: QUESTION_PANEL_CONTAINER_ID,
                title: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
                icon: this.questionPanelIcon,
                ctorDescriptor: new SyncDescriptor(
                    ViewPaneContainer,
                    [QUESTION_PANEL_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
                ),
                storageId: QUESTION_PANEL_CONTAINER_ID,
                hideIfEmpty: false,
                order: 0, // This will place it at the top
            },
            ViewContainerLocation.Sidebar
        );

        Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
            id: QUESTION_PANEL_ID,
            name: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
            ctorDescriptor: new SyncDescriptor(NewtonboxQuestionPanelView),
            canToggleVisibility: true,
            canMoveView: true,
            containerIcon: this.questionPanelIcon,
            order: 0,
            when: undefined // Always show
        }], this.viewContainer);
    }

    private async handleInitialization(): Promise<void> {
        // Wait for workspace trust to be handled
        await this.workspaceTrustService.workspaceTrustInitialized;
        
        // Show the sidebar if it's hidden
        this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
        
        // Open our view
        await this.viewsService.openView(QUESTION_PANEL_ID, true);
    }
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(NewtonboxQuestionPanelContribution, LifecyclePhase.Restored);
