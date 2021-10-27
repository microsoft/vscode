/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IConstructorSignature0, BrandedService, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { Dimension } from 'vs/base/browser/dom';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, Separator } from 'vs/base/common/actions';
import { SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ViewPaneContainer, ViewsSubMenu } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IView } from 'vs/workbench/common/views';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export abstract class PaneComposite extends Composite implements IPaneComposite {

	private viewPaneContainer?: ViewPaneContainer;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService protected extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super(id, telemetryService, themeService, storageService);
	}

	override create(parent: HTMLElement): void {
		this.viewPaneContainer = this._register(this.createViewPaneContainer(parent));
		this._register(this.viewPaneContainer.onTitleAreaUpdate(() => this.updateTitleArea()));
		this.viewPaneContainer.create(parent);
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.viewPaneContainer?.setVisible(visible);
	}

	layout(dimension: Dimension): void {
		this.viewPaneContainer?.layout(dimension);
	}

	getOptimalWidth(): number {
		return this.viewPaneContainer?.getOptimalWidth() ?? 0;
	}

	openView<T extends IView>(id: string, focus?: boolean): T | undefined {
		return this.viewPaneContainer?.openView(id, focus) as T;
	}

	getViewPaneContainer(): ViewPaneContainer | undefined {
		return this.viewPaneContainer;
	}

	override getActionsContext(): unknown {
		return this.getViewPaneContainer()?.getActionsContext();
	}

	override getContextMenuActions(): readonly IAction[] {
		return this.viewPaneContainer?.menuActions?.getContextMenuActions() ?? [];
	}

	override getActions(): readonly IAction[] {
		const result = [];
		if (this.viewPaneContainer?.menuActions) {
			result.push(...this.viewPaneContainer.menuActions.getPrimaryActions());
			if (this.viewPaneContainer.isViewMergedWithContainer()) {
				result.push(...this.viewPaneContainer.panes[0].menuActions.getPrimaryActions());
			}
		}
		return result;
	}

	override getSecondaryActions(): readonly IAction[] {
		if (!this.viewPaneContainer?.menuActions) {
			return [];
		}

		const viewPaneActions = this.viewPaneContainer.isViewMergedWithContainer() ? this.viewPaneContainer.panes[0].menuActions.getSecondaryActions() : [];
		let menuActions = this.viewPaneContainer.menuActions.getSecondaryActions();

		const viewsSubmenuActionIndex = menuActions.findIndex(action => action instanceof SubmenuItemAction && action.item.submenu === ViewsSubMenu);
		if (viewsSubmenuActionIndex !== -1) {
			const viewsSubmenuAction = <SubmenuItemAction>menuActions[viewsSubmenuActionIndex];
			if (viewsSubmenuAction.actions.some(({ enabled }) => enabled)) {
				if (menuActions.length === 1 && viewPaneActions.length === 0) {
					menuActions = viewsSubmenuAction.actions.slice();
				} else if (viewsSubmenuActionIndex !== 0) {
					menuActions = [viewsSubmenuAction, ...menuActions.slice(0, viewsSubmenuActionIndex), ...menuActions.slice(viewsSubmenuActionIndex + 1)];
				}
			} else {
				// Remove views submenu if none of the actions are enabled
				menuActions.splice(viewsSubmenuActionIndex, 1);
			}
		}

		if (menuActions.length && viewPaneActions.length) {
			return [
				...menuActions,
				new Separator(),
				...viewPaneActions
			];
		}

		return menuActions.length ? menuActions : viewPaneActions;
	}

	override getActionViewItem(action: IAction): IActionViewItem | undefined {
		return this.viewPaneContainer?.getActionViewItem(action);
	}

	override getTitle(): string {
		return this.viewPaneContainer?.getTitle() ?? '';
	}

	override saveState(): void {
		super.saveState();
	}

	override focus(): void {
		this.viewPaneContainer?.focus();
	}

	protected abstract createViewPaneContainer(parent: HTMLElement): ViewPaneContainer;
}


/**
 * A Pane Composite descriptor is a leightweight descriptor of a Pane Composite in the workbench.
 */
export class PaneCompositeDescriptor extends CompositeDescriptor<PaneComposite> {

	static create<Services extends BrandedService[]>(
		ctor: { new(...services: Services): PaneComposite },
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		requestedIndex?: number,
		iconUrl?: URI
	): PaneCompositeDescriptor {

		return new PaneCompositeDescriptor(ctor as IConstructorSignature0<PaneComposite>, id, name, cssClass, order, requestedIndex, iconUrl);
	}

	private constructor(
		ctor: IConstructorSignature0<PaneComposite>,
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		requestedIndex?: number,
		readonly iconUrl?: URI
	) {
		super(ctor, id, name, cssClass, order, requestedIndex);
	}
}

export const Extensions = {
	Viewlets: 'workbench.contributions.viewlets',
	Panels: 'workbench.contributions.panels',
	Auxiliary: 'workbench.contributions.auxiliary',
};

export class PaneCompositeRegistry extends CompositeRegistry<PaneComposite> {

	/**
	 * Registers a viewlet to the platform.
	 */
	registerPaneComposite(descriptor: PaneCompositeDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Deregisters a viewlet to the platform.
	 */
	deregisterPaneComposite(id: string): void {
		super.deregisterComposite(id);
	}

	/**
	 * Returns the viewlet descriptor for the given id or null if none.
	 */
	getPaneComposite(id: string): PaneCompositeDescriptor {
		return this.getComposite(id) as PaneCompositeDescriptor;
	}

	/**
	 * Returns an array of registered viewlets known to the platform.
	 */
	getPaneComposites(): PaneCompositeDescriptor[] {
		return this.getComposites() as PaneCompositeDescriptor[];
	}
}

Registry.add(Extensions.Viewlets, new PaneCompositeRegistry());
Registry.add(Extensions.Panels, new PaneCompositeRegistry());
Registry.add(Extensions.Auxiliary, new PaneCompositeRegistry());
