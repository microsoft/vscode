/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { WorkbenchList, IListService, IWorkbenchListOptions } from 'vs/platform/list/browser/listService';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CellViewModel } from '../viewModel/notebookViewModel';
import { DisposableStore } from 'vs/base/common/lifecycle';


interface IGutterRendererTemplate {
	container: HTMLElement;
	cellContainer: HTMLElement;
	elementDisposables: DisposableStore;
}

export class GutterRenderer implements IListRenderer<CellViewModel, IGutterRendererTemplate> {

	static TEMPLATE_ID = 'notebook_gutter';

	templateId = 'notebook_gutter';

	constructor(
		private _elementHeightUpdateDelegate: (index: number, size: number) => void
	) {
	}

	renderTemplate(container: HTMLElement): IGutterRendererTemplate {
		const cellContainer = DOM.append(container, DOM.$('.cell'));

		return {
			container,
			cellContainer,
			elementDisposables: new DisposableStore()
		};
	}

	renderElement(element: CellViewModel, index: number, templateData: IGutterRendererTemplate, height: number | undefined): void {
		templateData.cellContainer.style.height = `${element.layoutInfo.totalHeight}px`;
		let removedClassNames: string[] = [];
		templateData.cellContainer.classList.forEach(className => {
			if (/^nb\-.*$/.test(className)) {
				removedClassNames.push(className);
			}
		});

		removedClassNames.forEach(className => {
			templateData.cellContainer.classList.remove(className);
		});

		templateData.elementDisposables.add(element.onDidChangeLayout(() => {
			templateData.cellContainer.style.height = `${element.layoutInfo.totalHeight}px`;
			this._elementHeightUpdateDelegate(index, element.layoutInfo.totalHeight);
		}));

		element.getCellDecorations().forEach(options => {
			if (options.gutterClassName) {
				DOM.addClass(templateData.cellContainer, options.gutterClassName);
			}
		});

		templateData.elementDisposables.add(element.onCellDecorationsChanged((e) => {
			e.added.forEach(options => {
				if (options.gutterClassName) {
					DOM.addClass(templateData.cellContainer, options.gutterClassName);
				}
			});

			e.removed.forEach(options => {
				if (options.gutterClassName) {
					DOM.removeClass(templateData.cellContainer, options.gutterClassName);
				}
			});
		}));
	}
	disposeTemplate(templateData: IGutterRendererTemplate): void {
		templateData.cellContainer.style.backgroundColor = `#fff`;

		templateData.elementDisposables.clear();
		return;
	}

	disposeElement(element: CellViewModel, index: number, templateData: IGutterRendererTemplate): void {
		templateData.elementDisposables.clear();
	}
}

export class NotebookGutterDelegate implements IListVirtualDelegate<CellViewModel> {
	getHeight(element: CellViewModel): number {
		return element.layoutInfo.totalHeight;
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return false;
	}

	getTemplateId(element: CellViewModel): string {
		return GutterRenderer.TEMPLATE_ID;
	}
}


export class NotebookGutter extends WorkbenchList<CellViewModel> {
	constructor(
		listUser: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<CellViewModel>,
		renderers: IListRenderer<CellViewModel, IGutterRendererTemplate>[],
		contextKeyService: IContextKeyService,
		options: IWorkbenchListOptions<CellViewModel>,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(listUser, container, delegate, renderers, options, contextKeyService, listService, themeService, configurationService, keybindingService);
	}
}
