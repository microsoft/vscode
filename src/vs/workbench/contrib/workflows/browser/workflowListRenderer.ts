/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export interface WorkflowListItem {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly onDidChange?: Event<void>;
}

interface WorkflowListTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly description: HTMLElement;
	readonly store: DisposableStore;
}

export class WorkflowListRenderer<T extends WorkflowListItem> implements IListRenderer<T, WorkflowListTemplate> {
	readonly templateId = 'workflow-item';

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): WorkflowListTemplate {
		const row = dom.append(container, dom.$('.workflow-list-row'));
		return { container, label: dom.append(row, dom.$('.workflow-ellipsis')), description: dom.append(row, dom.$('.workflow-secondary.workflow-ellipsis')), store: new DisposableStore() };
	}

	renderElement(element: T, _index: number, template: WorkflowListTemplate): void {
		template.store.clear();
		const hovers = template.store.add(new DisposableStore());
		const render = () => {
			hovers.clear();
			template.label.textContent = element.label;
			template.description.textContent = element.description ?? '';
			hovers.add(this.hoverService.setupDelayedHover(template.label, { content: element.label }));
			if (element.description) {
				hovers.add(this.hoverService.setupDelayedHover(template.description, { content: element.description }));
			}
		};
		if (element.onDidChange) {
			template.store.add(element.onDidChange(() => {
				render();
				template.container.setAttribute('aria-label', element.label);
			}));
		}
		render();
	}

	disposeElement(_element: T, _index: number, template: WorkflowListTemplate): void {
		template.store.clear();
	}

	disposeTemplate(template: WorkflowListTemplate): void {
		template.store.dispose();
	}
}
