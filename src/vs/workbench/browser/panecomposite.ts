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
import { IAction, IActionViewItem } from 'vs/base/common/actions';

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

	create(parent: HTMLElement): void {
		this.viewPaneContainer = this._register(this.createViewPaneContainer(parent));
		this._register(this.viewPaneContainer.onTitleAreaUpdate(() => this.updateTitleArea()));
		this.viewPaneContainer.create(parent);
	}

	setVisible(visible: boolean): void {
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

	getActionsContext(): unknown {
		return this.getViewPaneContainer()?.getActionsContext();
	}

	getContextMenuActions(): ReadonlyArray<IAction> {
		return this.viewPaneContainer?.getContextMenuActions() ?? [];
	}

	getActions(): ReadonlyArray<IAction> {
		return this.viewPaneContainer?.getActions() ?? [];
	}

	getSecondaryActions(): ReadonlyArray<IAction> {
		return this.viewPaneContainer?.getSecondaryActions() ?? [];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		return this.viewPaneContainer?.getActionViewItem(action);
	}

	getTitle(): string {
		return this.viewPaneContainer?.getTitle() ?? '';
	}

	saveState(): void {
		super.saveState();
	}

	focus(): void {
		this.viewPaneContainer?.focus();
	}

	protected abstract createViewPaneContainer(parent: HTMLElement): ViewPaneContainer;
}
