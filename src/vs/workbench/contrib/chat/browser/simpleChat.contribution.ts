import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, ViewContainer } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SimpleChatViewPane } from './simpleChatView.js';

export const SIMPLE_CHAT_VIEW_CONTAINER_ID = 'workbench.view.simpleChat';

const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
        id: SIMPLE_CHAT_VIEW_CONTAINER_ID,
        title: localize('simpleChat', "Simple Chat"),
        icon: Codicon.commentDiscussion,
        ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SIMPLE_CHAT_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
        order: 0,
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([
        {
                id: SimpleChatViewPane.ID,
                name: localize('simpleChatView', "Simple Chat"),
                ctorDescriptor: new SyncDescriptor(SimpleChatViewPane),
                canMoveView: true,
                canToggleVisibility: true,
        }
], viewContainer);
