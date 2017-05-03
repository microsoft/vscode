/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
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

	public getId(tree: ITree, element: any): string {
		if (!element) {
			return null;
		}

		const model = this.modelProvider.getModel();
		return model === element ? '__root__' : model.dataSource.getId(element);
	}

	public hasChildren(tree: ITree, element: any): boolean {
		const model = this.modelProvider.getModel();
		return model && model === element && model.entries.length > 0;
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		const model = this.modelProvider.getModel();
		return TPromise.as(model === element ? model.entries : []);
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

export class AccessibilityProvider implements IAccessibilityProvider {
	constructor(private modelProvider: IModelProvider) { }

	public getAriaLabel(tree: ITree, element: any): string {
		const model = this.modelProvider.getModel();

		return model.accessibilityProvider && model.accessibilityProvider.getAriaLabel(element);
	}
}

export class Filter implements IFilter {

	constructor(private modelProvider: IModelProvider) { }

	public isVisible(tree: ITree, element: any): boolean {
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

	public updateStyles(styles: IQuickOpenStyles): void {
		this.styles = styles;
	}

	public getHeight(tree: ITree, element: any): number {
		const model = this.modelProvider.getModel();
		return model.renderer.getHeight(element);
	}

	public getTemplateId(tree: ITree, element: any): string {
		const model = this.modelProvider.getModel();
		return model.renderer.getTemplateId(element);
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		const model = this.modelProvider.getModel();
		return model.renderer.renderTemplate(templateId, container, this.styles);
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		const model = this.modelProvider.getModel();
		model.renderer.renderElement(element, templateId, templateData, this.styles);
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		const model = this.modelProvider.getModel();
		model.renderer.disposeTemplate(templateId, templateData);
	}
}