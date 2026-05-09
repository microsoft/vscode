/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

const $ = DOM.$;

export const CUSTOMIZATION_GROUP_HEADER_HEIGHT = 36;
export const CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR = 40;

/**
 * Common shape for a collapsible group header entry used in the
 * MCP-server and plugin list widgets.
 */
export interface ICustomizationGroupHeaderEntry {
	readonly type: 'group-header';
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly count: number;
	readonly isFirst: boolean;
	readonly description: string;
	collapsed: boolean;
}

interface ICustomizationGroupHeaderTemplateData {
	readonly container: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly infoIcon: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/**
 * Shared renderer for collapsible group headers in the AI Customization
 * list widgets (MCP servers, plugins, etc.).
 */
export class CustomizationGroupHeaderRenderer<T extends ICustomizationGroupHeaderEntry> implements IListRenderer<T, ICustomizationGroupHeaderTemplateData> {

	constructor(
		readonly templateId: string,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ICustomizationGroupHeaderTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('ai-customization-group-header');

		const chevron = DOM.append(container, $('.group-chevron'));
		const icon = DOM.append(container, $('.group-icon'));
		const labelGroup = DOM.append(container, $('.group-label-group'));
		const label = DOM.append(labelGroup, $('.group-label'));
		const infoIcon = DOM.append(labelGroup, $('.group-info'));
		infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
		const count = DOM.append(container, $('.group-count'));

		return { container, chevron, icon, label, count, infoIcon, disposables, elementDisposables };
	}

	renderElement(element: T, _index: number, templateData: ICustomizationGroupHeaderTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.chevron.className = 'group-chevron';
		templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));

		templateData.icon.className = 'group-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));

		templateData.label.textContent = element.label;
		templateData.count.textContent = `${element.count}`;

		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.infoIcon, () => ({
			content: element.description,
			appearance: {
				compact: true,
				skipFadeInAnimation: true,
			}
		})));

		templateData.container.classList.toggle('collapsed', element.collapsed);
		templateData.container.classList.toggle('has-previous-group', !element.isFirst);
	}

	disposeTemplate(templateData: ICustomizationGroupHeaderTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}
