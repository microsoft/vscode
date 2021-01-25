/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IView } from 'vs/workbench/common/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Composite } from 'vs/workbench/browser/composite';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ViewPaneContainer } from './parts/views/viewPaneContainer';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IAction, IActionViewItem, Separator } from 'vs/base/common/actions';

export class PaneComposite extends Composite implements IPaneComposite {

	constructor(
		id: string,
		protected readonly viewPaneContainer: ViewPaneContainer,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService protected extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super(id, telemetryService, themeService, storageService);
		this._register(this.viewPaneContainer.onTitleAreaUpdate(() => this.updateTitleArea()));
	}

	create(parent: HTMLElement): void {
		this.viewPaneContainer.create(parent);
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.viewPaneContainer.setVisible(visible);
	}

	layout(dimension: Dimension): void {
		this.viewPaneContainer.layout(dimension);
	}

	getOptimalWidth(): number {
		return this.viewPaneContainer.getOptimalWidth();
	}

	openView<T extends IView>(id: string, focus?: boolean): T | undefined {
		return this.viewPaneContainer.openView(id, focus) as T;
	}

	getViewPaneContainer(): ViewPaneContainer {
		return this.viewPaneContainer;
	}

	getActionsContext(): unknown {
		return this.getViewPaneContainer().getActionsContext();
	}

	getContextMenuActions(): ReadonlyArray<IAction> {
		const result = [];
		result.push(...this.viewPaneContainer.getContextMenuActions2());

		const otherActions = this.viewPaneContainer.getContextMenuActions();

		if (otherActions.length) {
			result.push(new Separator());
			result.push(...otherActions);
		}

		return result;
	}

	getActions(): ReadonlyArray<IAction> {
		const result = [];
		result.push(...this.viewPaneContainer.getActions2());
		result.push(...this.viewPaneContainer.getActions());
		return result;
	}

	getSecondaryActions(): ReadonlyArray<IAction> {
		const menuActions = this.viewPaneContainer.getSecondaryActions2();
		const viewPaneContainerActions = this.viewPaneContainer.getSecondaryActions();
		if (menuActions.length && viewPaneContainerActions.length) {
			return [
				...menuActions,
				new Separator(),
				...viewPaneContainerActions
			];
		}
		return menuActions.length ? menuActions : viewPaneContainerActions;
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		return this.viewPaneContainer.getActionViewItem(action);
	}

	getTitle(): string {
		return this.viewPaneContainer.getTitle();
	}

	saveState(): void {
		super.saveState();
	}

	focus(): void {
		this.viewPaneContainer.focus();
	}
}
