/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { Component } from 'vs/workbench/common/component';
import { IQuickInputService } from 'vs/platform/quickInput/common/quickInput';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { Dimension } from 'vs/base/browser/builder';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, ITheme, ICssStyleCollector, IThemeService } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, contrastBorder, buttonHoverBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken } from 'vs/base/common/cancellation';

const $ = dom.$;

export interface ISelectedElement {
	item: object;
	label: string;
	selected: boolean;
}

interface ISelectedElementTemplateData {
	element: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: ISelectedElement;
	toDispose: IDisposable[];
}

class SelectedElementRenderer implements IRenderer<ISelectedElement, ISelectedElementTemplateData> {

	static readonly ID = 'selectedelement';

	get templateId() {
		return SelectedElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISelectedElementTemplateData {
		const data: ISelectedElementTemplateData = Object.create(null);
		data.element = dom.append(container, $('.selected_element'));

		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDispose = [];
		data.toDispose.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => data.context.selected = !data.context.selected));

		dom.append(data.element, data.checkbox);

		data.name = dom.append(data.element, $('span.label'));

		return data;
	}

	renderElement(element: ISelectedElement, index: number, data: ISelectedElementTemplateData): void {
		data.context = element;
		data.name.textContent = element.label;
		data.element.title = data.name.textContent;
		data.checkbox.checked = element.selected;
	}

	disposeTemplate(templateData: ISelectedElementTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class SelectedElementDelegate implements IDelegate<ISelectedElement> {

	getHeight(element: ISelectedElement): number {
		return 22;
	}

	getTemplateId(element: ISelectedElement): string {
		return SelectedElementRenderer.ID;
	}
}

export class QuickInputService extends Component implements IQuickInputService {

	public _serviceBrand: any;

	private static readonly ID = 'workbench.component.quickinput';
	private static readonly MAX_WIDTH = 600;				// Max total width of quick open widget
	// private static readonly MAX_ITEMS_HEIGHT = 20 * 22;	// Max height of item list below input field

	private layoutDimensions: Dimension;
	private container: HTMLElement;
	private list: WorkbenchList<ISelectedElement>;

	private elements: ISelectedElement[] = [];
	private resolve: (value?: object[] | Thenable<object[]>) => void;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickInputService.ID, themeService);
	}

	private create() {
		if (this.container) {
			return;
		}

		const workbench = document.getElementById(this.partService.getWorkbenchElementId());
		this.container = dom.append(workbench, $('.quick-input-widget'));
		this.container.style.display = 'none';

		const listContainer = dom.append(this.container, $('.quick-input-list'));
		const delegate = new SelectedElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, listContainer, delegate, [new SelectedElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<ISelectedElement>;

		const buttonContainer = dom.append(this.container, $('.quick-input-actions'));
		const cancel = dom.append(buttonContainer, $('button'));
		cancel.textContent = 'Cancel'; // TODO
		this.toUnbind.push(dom.addDisposableListener(cancel, dom.EventType.CLICK, e => this.close(false)));
		const ok = dom.append(buttonContainer, $('button'));
		ok.textContent = 'OK'; // TODO
		this.toUnbind.push(dom.addDisposableListener(ok, dom.EventType.CLICK, e => this.close(true)));

		this.toUnbind.push(dom.addDisposableListener(this.container, 'focusout', (e: FocusEvent) => {
			for (let element = <Element>e.relatedTarget; element; element = element.parentElement) {
				if (element === this.container) {
					return;
				}
			}
			this.close(false);
		}));
	}

	private close(ok: boolean) {
		if (ok) {
			this.resolve(this.elements.filter(e => e.selected).map(e => e.item));
		} else {
			this.resolve();
		}
		this.container.style.display = 'none';
	}

	async pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions, token?: CancellationToken): TPromise<T[]> {
		this.create();

		// TODO: Progress indication.
		this.elements = (await picks).map(item => ({
			item,
			label: item.label,
			selected: !!item.selected
		}));
		this.list.splice(0, this.list.length, this.elements);

		this.container.style.display = null;
		this.updateLayout();
		this.list.focusFirst();
		this.list.domFocus();

		return new TPromise<T[]>(resolve => this.resolve = resolve);
	}

	public layout(dimension: Dimension): void {
		this.layoutDimensions = dimension;
		this.updateLayout();
	}

	private updateLayout() {
		if (this.layoutDimensions && this.container) {
			const titlebarOffset = this.partService.getTitleBarOffset();
			this.container.style.top = `${titlebarOffset}px`;

			const style = this.container.style;
			const width = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickInputService.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.list.layout();
		}
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const sideBarBackground = theme.getColor(SIDE_BAR_BACKGROUND);
	const sideBarForeground = theme.getColor(SIDE_BAR_FOREGROUND);
	const contrastBorderColor = theme.getColor(contrastBorder);
	const widgetShadowColor = theme.getColor(widgetShadow);
	collector.addRule(`.quick-input-widget {
		${sideBarBackground ? `background-color: ${sideBarBackground};` : ''}
		${sideBarForeground ? `color: ${sideBarForeground};` : ''}
		${contrastBorderColor ? `border: 1px solid ${contrastBorderColor};` : ''}
		${widgetShadowColor ? `box-shadow: 0 5px 8px ${widgetShadowColor};` : ''}
	}`);

	const buttonBackgroundColor = theme.getColor(buttonBackground);
	const buttonForegroundColor = theme.getColor(buttonForeground);
	collector.addRule(`.quick-input-actions button {
		${buttonBackgroundColor ? `background-color: ${buttonBackgroundColor};` : ''}
		${buttonForegroundColor ? `color: ${buttonForegroundColor};` : ''}
		${contrastBorderColor ? `border: 1px solid ${contrastBorderColor};` : ''}
	}`);

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.quick-input-actions button:hover { background-color: ${buttonHoverBackgroundColor}; }`);
	}
});
