/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ITestMessageStackTrace } from 'vs/workbench/contrib/testing/common/testTypes';

const stackItemDelegate: IListVirtualDelegate<void> = {
	getHeight: () => 22,
	getTemplateId: () => 's',
};

export class TestResultStackWidget extends Disposable {
	private readonly list: WorkbenchList<ITestMessageStackTrace>;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		this.list = this._register(instantiationService.createInstance(
			WorkbenchList,
			'TestResultStackWidget',
			container,
			stackItemDelegate,
			[instantiationService.createInstance(StackRenderer)],
			{
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('testStackTrace', 'Test stack trace'),
					getAriaLabel: (e: ITestMessageStackTrace) => e.position && e.uri ? localize({
						comment: ['{0} is an extension-defined label, then line number and filename'],
						key: 'stackTraceLabel',
					}, '{0}, line {1} in {2}', e.label, e.position.lineNumber, labelService.getUriLabel(e.uri)) : e.label,
				}
			}
		) as WorkbenchList<ITestMessageStackTrace>);
	}

	public update(stack: ITestMessageStackTrace[]) {
		this.list.splice(0, this.list.length, stack);
	}

	public layout(height?: number, width?: number) {
		this.list.layout(height, width);
	}
}

interface ITemplateData {
	container: HTMLElement;
}

class StackRenderer implements IListRenderer<ITestMessageStackTrace, ITemplateData> {
	public readonly templateId = 's';

	renderTemplate(container: HTMLElement): ITemplateData {
		return { container };
	}

	renderElement(element: ITestMessageStackTrace, index: number, templateData: ITemplateData, height: number | undefined): void {
		templateData.container.innerText = element.label;
	}

	disposeTemplate(_templateData: ITemplateData): void {
		// no-op
	}
}

