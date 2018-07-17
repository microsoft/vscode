/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TreeViewsViewletPanel, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { renderViewTree, twistiePixels } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { IAccessibilityProvider, ITree, IRenderer, IDataSource } from 'vs/base/parts/tree/browser/tree';

export class LoadedScriptsView extends TreeViewsViewletPanel {

	private treeContainer: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('loadedScriptsSection', "Loaded Scripts Section") }, keybindingService, contextMenuService, configurationService);
	}

	protected renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-loaded-scripts');
		this.treeContainer = renderViewTree(container);

		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new LoadedScriptsDataSource(),
			renderer: this.instantiationService.createInstance(LoadedScriptsRenderer),
			accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'loadedScriptsAriaLabel' }, "Debug Loaded Scripts"),
				twistiePixels
			});
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}
}

// A good example of data source, renderers, action providers and accessibilty providers can be found in the callStackView.ts

class LoadedScriptsDataSource implements IDataSource {

	getId(tree: ITree, element: any): string {
		throw new Error('Method not implemented.');
	}

	hasChildren(tree: ITree, element: any): boolean {
		throw new Error('Method not implemented.');
	}

	getChildren(tree: ITree, element: any): TPromise<any> {
		throw new Error('Method not implemented.');
	}

	getParent(tree: ITree, element: any): TPromise<any> {
		throw new Error('Method not implemented.');
	}
}

class LoadedScriptsRenderer implements IRenderer {

	getHeight(tree: ITree, element: any): number {
		throw new Error('Method not implemented.');
	}

	getTemplateId(tree: ITree, element: any): string {
		throw new Error('Method not implemented.');
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		throw new Error('Method not implemented.');
	}

	renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		throw new Error('Method not implemented.');
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		throw new Error('Method not implemented.');
	}
}

class LoadedSciptsAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		return nls.localize('implement me', "implement me");
	}
}
