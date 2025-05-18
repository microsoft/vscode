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
import { Codicon } from '../../../../base/common/codicons.js';
import { NewtonboxQuestionPanelView } from './newtonboxQuestionPanelView.js';
import { QUESTION_PANEL_CONTAINER_ID, QUESTION_PANEL_ID } from '../common/newtonboxQuestionPanel.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

// Define constants
export const QUESTION_PANEL_TITLE = localize('newtonboxQuestionPanel', "Newtonbox Question Panel");

// Register the view container
const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
    {
        id: QUESTION_PANEL_CONTAINER_ID,
        title: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
        icon: Codicon.question,
        ctorDescriptor: new SyncDescriptor(
            ViewPaneContainer,
            [QUESTION_PANEL_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
        ),
        storageId: QUESTION_PANEL_CONTAINER_ID,
        hideIfEmpty: true,
        order: 0, // This will place it at the top
    },
    ViewContainerLocation.Sidebar
);

// Register the workbench contribution
class NewtonboxQuestionPanelContribution {
    constructor() {
        this.registerViews();
    }

    private registerViews() {
        const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

        viewsRegistry.registerViews([{
            id: QUESTION_PANEL_ID,
            name: { value: QUESTION_PANEL_TITLE, original: 'Newtonbox Question Panel' },
            ctorDescriptor: new SyncDescriptor(NewtonboxQuestionPanelView),
            canToggleVisibility: true,
            canMoveView: true,
            containerIcon: Codicon.question,
            order: 0
        }], viewContainer);
    }
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(NewtonboxQuestionPanelContribution, LifecyclePhase.Restored);
