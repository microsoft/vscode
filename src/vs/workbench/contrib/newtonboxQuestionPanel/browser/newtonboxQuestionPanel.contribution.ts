/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { NewtonboxQuestionPanelView } from './newtonboxQuestionPanelView.js';
import { QUESTION_PANEL_CONTAINER_ID, QUESTION_PANEL_ID } from '../common/newtonboxQuestionPanel.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

// Define constants
export const QUESTION_PANEL_TITLE = localize('newtonboxQuestionPanel', "Newtonbox Question Panel");

// Register custom icon
const questionPanelIcon = registerIcon('newtonbox-question-panel-icon', { fontCharacter: 'Q' }, localize('newtonboxQuestionPanelIcon', 'Icon for the Newtonbox Question Panel'));

// Register the view container
const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
    {
        id: QUESTION_PANEL_CONTAINER_ID,
        title: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
        icon: questionPanelIcon,
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

// Register the workbench contribution
class NewtonboxQuestionPanelContribution extends Disposable {
    constructor(
        @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
        @IViewsService private readonly viewsService: IViewsService,
        @IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService
    ) {
        super();
        this.registerViews();
        this.handleInitialization();
    }

    private registerViews() {
        const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

        viewsRegistry.registerViews([{
            id: QUESTION_PANEL_ID,
            name: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
            ctorDescriptor: new SyncDescriptor(NewtonboxQuestionPanelView),
            canToggleVisibility: true,
            canMoveView: true,
            containerIcon: questionPanelIcon,
            order: 0,
            when: undefined // Always show
        }], viewContainer);
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
