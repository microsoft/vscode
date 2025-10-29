import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { localize } from '../../../../nls.js';
import {
	Extensions as ViewExtensions,
	IViewContainersRegistry,
	IViewsRegistry,
	ViewContainer,
	ViewContainerLocation
} from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { StellarRightView } from './stellarRightView.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const STELLAR_AUX_CONTAINER_ID = 'workbench.view.stellarRight';

// Register custom icon for Stellar
const stellarIcon = registerIcon('stellar-view-icon', Codicon.star, localize('stellarIcon', 'Stellar AI Assistant Icon'));

// 1) Register container in Auxiliary Bar
const viewContainers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
export const STELLAR_AUX_CONTAINER: ViewContainer = viewContainers.registerViewContainer({
	id: STELLAR_AUX_CONTAINER_ID,
	title: { value: localize('stellarRight.title', 'Stellar'), original: 'Stellar' },
	icon: stellarIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [STELLAR_AUX_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }])
}, ViewContainerLocation.AuxiliaryBar);

// 2) Register a starter view inside the container
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: StellarRightView.ID,
	name: { value: localize('stellarRight.viewName', 'Stellar'), original: 'Stellar' },
	ctorDescriptor: new SyncDescriptor(StellarRightView),
	canToggleVisibility: true,
	canMoveView: true
}], STELLAR_AUX_CONTAINER);

// 3) Command to open/focus the container
class OpenStellarRightBarAction extends Action2 {
	static readonly ID = 'workbench.action.openStellarRightBar';
	constructor() {
		super({
			id: OpenStellarRightBarAction.ID,
			title: { value: localize('openStellarRightBar', 'Open Stellar Right Bar'), original: 'Open Stellar Right Bar' },
			f1: true
		});
	}
	run(accessor: any) {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		return paneCompositeService.openPaneComposite(STELLAR_AUX_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar, true);
	}
}
registerAction2(OpenStellarRightBarAction);
