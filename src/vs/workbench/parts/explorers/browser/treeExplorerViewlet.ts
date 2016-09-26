import 'vs/css!./media/customViewlet';

import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { SplitView, Orientation } from 'vs/base/browser/ui/splitview/splitview';

import { IViewletView, Viewlet } from 'vs/workbench/browser/viewlet';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

import { TreeView } from 'vs/workbench/parts/explorers/browser/views/treeView';

export const CUSTOM_VIEWLET_ID_ROOT = 'workbench.view.customViewlet.';

export class TreeExplorerViewlet extends Viewlet {
	private static _idCounter = 1;

	private viewletContainer: Builder;
	private splitView: SplitView;
	private views: IViewletView[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(CUSTOM_VIEWLET_ID_ROOT + TreeExplorerViewlet._idCounter, telemetryService);
		TreeExplorerViewlet._idCounter++;

		this.views = [];
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div().addClass('custom-viewlet');
		this.splitView = new SplitView(this.viewletContainer.getHTMLElement());
		this.addTreeView('Tree ' + (this.views.length + 1));

		const settings = this.configurationService.getConfiguration<ICustomViewletConfiguration>();

		return this.onConfigurationUpdated(settings);
	}

	layout(dimension: Dimension): void {
		this.splitView.layout(dimension.height);
	}

	private onConfigurationUpdated(config: ICustomViewletConfiguration): TPromise<void> {
		return TPromise.as(null);
	}

	private addTreeView(treeName: string): void {
		const treeView = this.instantiationService.createInstance(TreeView, treeName, this.getActionRunner());
		this.views.push(treeView);
		this.splitView.addView(treeView);
	}

	dispose(): void {
		this.views.forEach(view => {
			view.dispose();
		});
		this.views = null;
	}
}


export interface ICustomViewletConfiguration {
	viewlet: {

	}
}