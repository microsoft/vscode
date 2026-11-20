/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ITableRenderer } from '../../../../base/browser/ui/table/table.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';

export type AutomationCategory = 'all' | 'personal' | 'cloud' | 'repository';
export type AutomationColumn = 'name' | 'schedule' | 'target' | 'lastRun' | 'enabled';

export interface AutomationRow {
	readonly automation: IAutomationDescriptor;
	readonly category: Exclude<AutomationCategory, 'all'>;
	readonly name: string;
	readonly schedule: string;
	readonly target: string;
	readonly lastRun: string;
	readonly lastRunTime: string;
	readonly enabled: string;
	readonly canUpdate: boolean;
}

interface CellTemplate {
	readonly label: HTMLElement;
	readonly disposables: DisposableStore;
}

export class AutomationCellRenderer implements ITableRenderer<AutomationRow, CellTemplate> {
	readonly templateId: string;
	private readonly toggles = new Map<string, Checkbox>();

	constructor(
		private readonly column: AutomationColumn,
		private readonly toggle: (automation: IAutomationDescriptor) => void,
		private readonly hoverService: IHoverService,
	) {
		this.templateId = `automation-${column}`;
	}

	renderTemplate(container: HTMLElement): CellTemplate {
		const label = dom.append(container, dom.$('.automations-modal-cell'));
		label.classList.toggle('toggle-cell', this.column === 'enabled');
		return { label, disposables: new DisposableStore() };
	}

	renderElement(row: AutomationRow, _index: number, template: CellTemplate): void {
		template.disposables.clear();
		dom.clearNode(template.label);
		if (this.column === 'enabled') {
			const label = row.canUpdate
				? localize('automations.modal.toggle', "Enable automation {0}", row.name)
				: localize('automations.modal.readOnly', "Automation {0} cannot be changed. {1}", row.name, row.automation.readOnlyReason ?? localize('automations.modal.providerUnavailable', "Its provider is unavailable."));
			const checkbox = template.disposables.add(new Checkbox(label, row.automation.enabled, defaultCheckboxStyles));
			if (!row.canUpdate) {
				checkbox.disable();
			}
			template.label.appendChild(checkbox.domNode);
			checkbox.domNode.dataset.automationId = row.automation.id;
			this.toggles.set(row.automation.id, checkbox);
			template.disposables.add(toDisposable(() => this.toggles.delete(row.automation.id)));
			template.disposables.add(checkbox.onChange(() => {
				checkbox.checked = row.automation.enabled;
				this.toggle(row.automation);
			}));
		} else {
			template.label.textContent = row[this.column];
			template.disposables.add(this.hoverService.setupDelayedHover(template.label, { content: row[this.column] }));
		}
	}

	disposeElement(_row: AutomationRow, _index: number, template: CellTemplate): void {
		template.disposables.clear();
	}

	disposeTemplate(template: CellTemplate): void {
		template.disposables.dispose();
	}

	getToggle(id: string | undefined): HTMLElement | undefined {
		return id === undefined ? undefined : this.toggles.get(id)?.domNode;
	}
}

interface AutomationColumnDefinition {
	readonly id: AutomationColumn;
	readonly label: string;
	readonly weight: number;
	readonly minimumWidth: number;
	readonly sortOptions: readonly { descending: boolean; text: string }[];
}

export const automationTableColumns: readonly AutomationColumnDefinition[] = [
	{
		id: 'name', label: localize('automations.modal.name', "Name"), weight: 0.3, minimumWidth: 180,
		sortOptions: [
			{ descending: false, text: localize('automations.modal.sort.nameAscending', "Name (A-Z)") },
			{ descending: true, text: localize('automations.modal.sort.nameDescending', "Name (Z-A)") },
		],
	},
	{
		id: 'schedule', label: localize('automations.modal.schedule', "Schedule"), weight: 0.25, minimumWidth: 160,
		sortOptions: [
			{ descending: false, text: localize('automations.modal.sort.scheduleAscending', "Schedule (A-Z)") },
			{ descending: true, text: localize('automations.modal.sort.scheduleDescending', "Schedule (Z-A)") },
		],
	},
	{
		id: 'target', label: localize('automations.modal.target', "Runs on"), weight: 0.2, minimumWidth: 140,
		sortOptions: [
			{ descending: false, text: localize('automations.modal.sort.targetAscending', "Runs on (A-Z)") },
			{ descending: true, text: localize('automations.modal.sort.targetDescending', "Runs on (Z-A)") },
		],
	},
	{
		id: 'lastRun', label: localize('automations.modal.lastRun', "Last run"), weight: 0.2, minimumWidth: 160,
		sortOptions: [
			{ descending: true, text: localize('automations.modal.sort.newest', "Last Run (Newest First)") },
			{ descending: false, text: localize('automations.modal.sort.oldest', "Last Run (Oldest First)") },
		],
	},
	{
		id: 'enabled', label: localize('automations.modal.on', "On"), weight: 0.05, minimumWidth: 48,
		sortOptions: [
			{ descending: true, text: localize('automations.modal.sort.enabled', "Enabled First") },
			{ descending: false, text: localize('automations.modal.sort.disabled', "Disabled First") },
		],
	},
];

export const automationTableSortOptions = automationTableColumns.flatMap(column => column.sortOptions.map(option => ({ column: column.id, ...option })));
