/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFunction } from 'vs/base/common/types';
import { ITree, IRenderer, IFilter, IDataSource, IAccessibilityProvider } from 'vs/base/parts/tree/browser/tree';
import { IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { IQuickOpenStyles } from 'vs/base/parts/quickopen/browser/quickOpenWidget';

export interface IModelProvider {
	getModel<T>(): IModel<T>;
}

export class DataSource implements IDataSource {

	private modelProvider: IModelProvider;

	constructor(model: IModel<any>);
	constructor(modelProvider: IModelProvider);
	constructor(arg: any) {
		this.modelProvider = isFunction(arg.getModel) ? arg : { getModel: () => arg };
	}

	getId(tree: ITree, element: any): string {
		if (!element) {
			return null;
		}

		const model = this.modelProvider.getModel();
		return model === element ? '__root__' : model.dataSource.getId(element);
	}

	hasChildren(tree: ITree, element: any): boolean {
		const model = this.modelProvider.getModel();
		return model && model === element && model.entries.length > 0;
	}

	getChildren(tree: ITree, element: any): Promise<any[]> {
		const model = this.modelProvider.getModel();
		return Promise.resolve(model === element ? model.entries : []);
	}

	getParent(tree: ITree, element: any): Promise<any> {
		return Promise.resolve(null);
	}
}

export class AccessibilityProvider implements IAccessibilityProvider {
	constructor(private modelProvider: IModelProvider) { }

	getAriaLabel(tree: ITree, element: any): string {
		const model = this.modelProvider.getModel();

		return model.accessibilityProvider && model.accessibilityProvider.getAriaLabel(element);
	}

	getPosInSet(tree: ITree, element: any): string {
		const model = this.modelProvider.getModel();
		let i = 0;
		if (model.filter) {
			for (const entry of model.entries) {
				if (model.filter.isVisible(entry)) {
					i++;
				}
				if (entry === element) {
					break;
				}
			}
		} else {
			i = model.entries.indexOf(element) + 1;
		}
		return String(i);
	}

	getSetSize(): string {
		const model = this.modelProvider.getModel();
		let n = 0;
		if (model.filter) {
			for (const entry of model.entries) {
				if (model.filter.isVisible(entry)) {
					n++;
				}
			}
		} else {
			n = model.entries.length;
		}
		return String(n);
	}
}

export class Filter implements IFilter {

	constructor(private modelProvider: IModelProvider) { }

	isVisible(tree: ITree, element: any): boolean {
		const model = this.modelProvider.getModel();

		if (!model.filter) {
			return true;
		}

		return model.filter.isVisible(element);
	}
}

export class Renderer implements IRenderer {
	private styles: IQuickOpenStyles;

	constructor(private modelProvider: IModelProvider, styles: IQuickOpenStyles) {
		this.styles = styles;
	}

	updateStyles(styles: IQuickOpenStyles): void {
		this.styles = styles;
	}

	getHeight(tree: ITree, element: any): number {
		const model = this.modelProvider.getModel();
		return model.renderer.getHeight(element);
	}

	getTemplateId(tree: ITree, element: any): string {
		const model = this.modelProvider.getModel();
		return model.renderer.getTemplateId(element);
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		const model = this.modelProvider.getModel();
		return model.renderer.renderTemplate(templateId, container, this.styles);
	}

	renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		const model = this.modelProvider.getModel();
		model.renderer.renderElement(element, templateId, templateData, this.styles);
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		const model = this.modelProvider.getModel();
		model.renderer.disposeTemplate(templateId, templateData);
	}
}
