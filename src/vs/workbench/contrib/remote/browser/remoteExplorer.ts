/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Extensions, IViewDescriptorService, IViewsRegistry } from 'vs/workbench/common/views';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IRemoteExplorerService, TUNNEL_VIEW_ID } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { forwardedPortsViewEnabled, TunnelPanelDescriptor, TunnelViewModel } from 'vs/workbench/contrib/remote/browser/tunnelView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Registry } from 'vs/platform/registry/common/platform';

export const VIEWLET_ID = 'workbench.view.remote';

export class ForwardedPortsView extends Disposable implements IWorkbenchContribution {
	private contextKeyListener?: IDisposable;
	private _activityBadge?: IDisposable;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IActivityService private readonly activityService: IActivityService
	) {
		super();
		this.enableForwardedPortsView();
		this.enableBadge();
	}

	private enableForwardedPortsView() {
		if (this.contextKeyListener) {
			this.contextKeyListener.dispose();
			this.contextKeyListener = undefined;
		}

		const viewEnabled: boolean = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);
		if (this.environmentService.remoteAuthority && viewEnabled) {
			const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService), this.environmentService);
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			const viewContainer = this.viewDescriptorService.getViewContainerById(VIEWLET_ID);
			if (viewContainer) {
				viewsRegistry.registerViews([tunnelPanelDescriptor!], viewContainer);
			}
		} else if (this.environmentService.remoteAuthority) {
			this.contextKeyListener = this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(new Set(forwardedPortsViewEnabled.keys()))) {
					this.enableForwardedPortsView();
				}
			});
		}
	}

	private enableBadge() {
		this._register(this.remoteExplorerService.tunnelModel.onForwardPort(() => this.updateActivityBadge()));
		this._register(this.remoteExplorerService.tunnelModel.onClosePort(() => this.updateActivityBadge()));
		const disposable = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onViewsRegistered(e => {
			if (e.find(view => view.views.find(viewDescriptor => viewDescriptor.id === TUNNEL_VIEW_ID))) {
				this.updateActivityBadge();
				disposable.dispose();
			}
		});
	}

	private updateActivityBadge() {
		if (this._activityBadge) {
			this._activityBadge.dispose();
		}
		if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
			const viewContainer = this.viewDescriptorService.getViewContainerByViewId(TUNNEL_VIEW_ID);
			if (viewContainer) {
				this._activityBadge = this.activityService.showViewContainerActivity(viewContainer.id, {
					badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, n => n === 1 ? nls.localize('1forwardedPort', "1 forwarded port") : nls.localize('nForwardedPorts', "{0} forwarded ports", n))
				});
			}
		}
	}
}
