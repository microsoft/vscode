/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowListItem } from './workflowListRenderer.js';

export interface WorkflowOutlineItem extends WorkflowListItem {
	readonly step?: number;
}

interface WorkflowOutlineTemplate {
	readonly row: HTMLElement;
	readonly store: DisposableStore;
}

export class WorkflowOutlineRenderer implements IListRenderer<WorkflowOutlineItem, WorkflowOutlineTemplate> {
	readonly templateId = 'workflow-outline';

	constructor(
		private readonly isReadOnly: () => boolean,
		private readonly checkpointCount: () => number,
		private readonly move: (id: string, offset: number) => void,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): WorkflowOutlineTemplate {
		return { row: dom.append(container, dom.$('.workflow-outline-row')), store: new DisposableStore() };
	}

	renderElement(item: WorkflowOutlineItem, _index: number, template: WorkflowOutlineTemplate): void {
		template.store.clear();
		dom.clearNode(template.row);
		template.row.dataset.checkpointId = item.id;
		template.row.classList.toggle('root', item.step === undefined);
		template.row.classList.toggle('last', item.step === this.checkpointCount());
		const marker = dom.append(template.row, dom.$('span.workflow-outline-marker', { 'aria-hidden': 'true' }));
		if (item.step === undefined) {
			marker.appendChild(renderIcon(Codicon.listTree));
		} else {
			marker.textContent = String(item.step);
		}
		const label = dom.append(template.row, dom.$('span.workflow-outline-label'));
		const moveActions: { action: Action; offset: number }[] = [];
		const moveLabel = (offset: number) => offset < 0 ? localize('workflow.outlineMoveUp', "Move {0} Up", item.label) : localize('workflow.outlineMoveDown', "Move {0} Down", item.label);
		const update = () => {
			label.textContent = item.label;
			template.row.parentElement?.setAttribute('aria-label', item.label);
			for (const { action, offset } of moveActions) {
				action.label = moveLabel(offset);
				action.tooltip = moveLabel(offset);
			}
		};
		update();
		if (item.onDidChange) {
			template.store.add(item.onDidChange(update));
		}
		template.store.add(this.hoverService.setupDelayedHover(label, () => ({ content: item.description ? `${item.label}\n${item.description}` : item.label })));
		if (item.step !== undefined && !this.isReadOnly()) {
			const actions = dom.append(template.row, dom.$('.workflow-outline-actions'));
			const toolbar = template.store.add(this.instantiationService.createInstance(WorkbenchToolBar, dom.append(actions, dom.$('.workflow-outline-toolbar')), {
				ariaLabel: localize('workflow.outlineActions', "Checkpoint actions"),
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
			}));
			for (const [offset, icon, id] of [
				[-1, Codicon.chevronUp, 'workflow.checkpoint.moveUp'],
				[1, Codicon.chevronDown, 'workflow.checkpoint.moveDown'],
			] as const) {
				const action = template.store.add(new Action(id, moveLabel(offset), ThemeIcon.asClassName(icon),
					offset < 0 ? item.step > 1 : item.step < this.checkpointCount(), async () => this.move(item.id, offset)));
				moveActions.push({ action, offset });
			}
			toolbar.setActions(moveActions.map(({ action }) => action));
			const gripper = dom.append(actions, renderIcon(Codicon.gripper));
			gripper.classList.add('workflow-outline-gripper');
			gripper.setAttribute('aria-hidden', 'true');
		}
	}

	disposeElement(_item: WorkflowOutlineItem, _index: number, template: WorkflowOutlineTemplate): void {
		template.store.clear();
	}

	disposeTemplate(template: WorkflowOutlineTemplate): void {
		template.store.dispose();
	}
}
