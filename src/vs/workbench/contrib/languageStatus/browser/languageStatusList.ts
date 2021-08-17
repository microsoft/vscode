/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/languageStatus';
import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { NOTIFICATIONS_BACKGROUND, NOTIFICATIONS_BORDER } from 'vs/workbench/common/theme';
import { ILanguageStatus } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Link } from 'vs/platform/opener/browser/link';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DisposableStore } from 'vs/base/common/lifecycle';

class LanguageStatusTemplate {

	readonly firstLine: HTMLDivElement;
	readonly secondLine: HTMLDivElement;

	constructor(
		readonly container: HTMLElement,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		container.classList.add('status-element');
		this.firstLine = document.createElement('div');
		this.secondLine = document.createElement('div');
		this.secondLine.classList.add('detail');

		container.appendChild(this.firstLine);
		container.appendChild(this.secondLine);
	}

	dispose() {

	}

	set(element: ILanguageStatus): void {
		// message
		// source
		dom.clearNode(this.firstLine);
		for (let node of parseLinkedText(element.message).nodes) {
			if (typeof node === 'string') {
				const parts = renderLabelWithIcons(node);
				dom.append(this.firstLine, ...parts);
			} else {
				dom.append(this.firstLine, new Link(node, undefined, this._openerService).el);
			}
		}

		dom.reset(this.secondLine, element.source);
	}
}

class Renderer implements IListRenderer<ILanguageStatus, LanguageStatusTemplate>, IListVirtualDelegate<ILanguageStatus> {

	static templateId: string = 'languageStatus';

	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) { }

	// delegate

	getHeight(element: ILanguageStatus): number {
		return 56;
	}
	getTemplateId(element: ILanguageStatus): string {
		return Renderer.templateId;
	}

	// renderer

	templateId: string = Renderer.templateId;

	renderTemplate(container: HTMLElement): LanguageStatusTemplate {
		return this._instantiationService.createInstance(LanguageStatusTemplate, container);
	}
	renderElement(element: ILanguageStatus, index: number, templateData: LanguageStatusTemplate, height: number | undefined): void {
		templateData.set(element);
	}
	disposeTemplate(templateData: LanguageStatusTemplate): void {
		templateData.dispose();
	}

}

export class LanguageStatusDetailsWidget {

	private readonly _disposables = new DisposableStore();

	private readonly _container: HTMLDivElement;
	private readonly _list: WorkbenchList<ILanguageStatus>;

	constructor(
		status: ILanguageStatus[],
		parent: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		parent.style.setProperty('--code-widget-shadow', themeService.getColorTheme().getColor(widgetShadow, true)?.toString() ?? 'inherit');
		parent.style.setProperty('--code-notifications-border', themeService.getColorTheme().getColor(NOTIFICATIONS_BORDER, true)?.toString() ?? 'inherit');
		parent.classList.add('language-status');

		this._container = document.createElement('div');
		this._container.classList.add('list-container');
		parent.appendChild(this._container);

		const renderer = _instantiationService.createInstance(Renderer);
		this._list = <WorkbenchList<ILanguageStatus>>this._instantiationService.createInstance(
			WorkbenchList,
			'LanguageStatusList',
			this._container,
			renderer,
			[renderer],
			{
				// ...this.options,
				setRowLineHeight: false,
				horizontalScrolling: false,
				overrideStyles: {
					listBackground: NOTIFICATIONS_BACKGROUND,
					// listInactiveSelectionBackground: NOTIFICATIONS_BACKGROUND,
					// listActiveSelectionBackground: NOTIFICATIONS_BACKGROUND,
				},
				accessibilityProvider: {
					getAriaLabel(element: ILanguageStatus): string {
						return element.message;
					},
					getWidgetAriaLabel(): string {
						return localize('language status', "Language Status List");
					},
					getRole(): string {
						return 'dialog'; // https://github.com/microsoft/vscode/issues/82728
					}
				}
			}
		);

		// no selections
		this._disposables.add(this._list.onDidChangeSelection(e => {
			if (e.indexes.length > 0) {
				this._list.setSelection([]);
			}
		}));

		this._list.splice(0, this._list.length, status);
		this.layout();
	}

	dispose(): void {
		this._list.dispose();
	}

	layout() {
		const width = Math.max(200, this._layoutService.dimension.width * 0.6);
		this._container.style.width = `${width}px`;
		this._list.layout();
	}
}
