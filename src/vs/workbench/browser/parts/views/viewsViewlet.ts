/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IViewDescriptor, IViewDescriptorService, IAddedViewDescriptorRef, IView } from '../../../common/views.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ViewPaneContainer } from './viewPaneContainer.js';
import { ViewPane, IViewPaneOptions } from './viewPane.js';
import { Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IViewletViewOptions extends IViewPaneOptions {
	readonly fromExtensionId?: ExtensionIdentifier;
}

export abstract class FilterViewPaneContainer extends ViewPaneContainer {
	private constantViewDescriptors: Map<string, IViewDescriptor> = new Map();
	private allViews: Map<string, Map<string, IViewDescriptor>> = new Map();
	private filterValue: string[] | undefined;

	constructor(
		viewletId: string,
		onDidChangeFilterValue: Event<string[]>,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {

		super(viewletId, { mergeViewWithContainerWhenSingleView: false }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
		this._register(onDidChangeFilterValue(newFilterValue => {
			this.filterValue = newFilterValue;
			this.onFilterChanged(newFilterValue);
		}));

		this._register(this.viewContainerModel.onDidChangeActiveViewDescriptors(() => {
			this.updateAllViews(this.viewContainerModel.activeViewDescriptors);
		}));
	}

	private updateAllViews(viewDescriptors: ReadonlyArray<IViewDescriptor>) {
		viewDescriptors.forEach(descriptor => {
			const filterOnValue = this.getFilterOn(descriptor);
			if (!filterOnValue) {
				return;
			}
			if (!this.allViews.has(filterOnValue)) {
				this.allViews.set(filterOnValue, new Map());
			}
			this.allViews.get(filterOnValue)!.set(descriptor.id, descriptor);
			if (this.filterValue && !this.filterValue.includes(filterOnValue) && this.panes.find(pane => pane.id === descriptor.id)) {
				this.viewContainerModel.setVisible(descriptor.id, false);
			}
		});
	}

	protected addConstantViewDescriptors(constantViewDescriptors: IViewDescriptor[]) {
		constantViewDescriptors.forEach(viewDescriptor => this.constantViewDescriptors.set(viewDescriptor.id, viewDescriptor));
	}

	protected abstract getFilterOn(viewDescriptor: IViewDescriptor): string | undefined;

	protected abstract setFilter(viewDescriptor: IViewDescriptor): void;

	private onFilterChanged(newFilterValue: string[]) {
		if (this.allViews.size === 0) {
			this.updateAllViews(this.viewContainerModel.activeViewDescriptors);
		}
		this.getViewsNotForTarget(newFilterValue).forEach(item => this.viewContainerModel.setVisible(item.id, false));
		this.getViewsForTarget(newFilterValue).forEach(item => this.viewContainerModel.setVisible(item.id, true));
	}

	private getViewsForTarget(target: string[]): IViewDescriptor[] {
		const views: IViewDescriptor[] = [];
		for (let i = 0; i < target.length; i++) {
			if (this.allViews.has(target[i])) {
				views.push(...Array.from(this.allViews.get(target[i])!.values()));
			}
		}

		return views;
	}

	private getViewsNotForTarget(target: string[]): IViewDescriptor[] {
		const iterable = this.allViews.keys();
		let key = iterable.next();
		let views: IViewDescriptor[] = [];
		while (!key.done) {
			let isForTarget: boolean = false;
			target.forEach(value => {
				if (key.value === value) {
					isForTarget = true;
				}
			});
			if (!isForTarget) {
				views = views.concat(this.getViewsForTarget([key.value]));
			}

			key = iterable.next();
		}
		return views;
	}

	protected override onDidAddViewDescriptors(added: IAddedViewDescriptorRef[]): ViewPane[] {
		const panes: ViewPane[] = super.onDidAddViewDescriptors(added);
		for (let i = 0; i < added.length; i++) {
			if (this.constantViewDescriptors.has(added[i].viewDescriptor.id)) {
				panes[i].setExpanded(false);
			}
		}
		// Check that allViews is ready
		if (this.allViews.size === 0) {
			this.updateAllViews(this.viewContainerModel.activeViewDescriptors);
		}
		return panes;
	}

	override openView(id: string, focus?: boolean): IView | undefined {
		const result = super.openView(id, focus);
		if (result) {
			const descriptorMap = Array.from(this.allViews.entries()).find(entry => entry[1].has(id));
			if (descriptorMap && !this.filterValue?.includes(descriptorMap[0])) {
				this.setFilter(descriptorMap[1].get(id)!);
			}
		}
		return result;
	}

	abstract override getTitle(): string;

}
