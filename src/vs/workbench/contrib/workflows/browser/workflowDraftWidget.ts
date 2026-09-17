/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IWorkflowAccessibilityService } from './workflowAccessibility.js';
import { WorkflowSelection } from './workflowUIService.js';

import './media/workflows.css';

export interface WorkflowDraftWidgetOptions {
	readonly onPick: (anchor: HTMLElement) => void;
}

export class WorkflowDraftWidget extends Disposable {
	readonly domNode: HTMLElement;
	private readonly selected: Button;
	private readonly label: HTMLElement;
	private error: string | undefined;
	private workflowsEnabled = true;

	constructor(
		container: HTMLElement,
		private selection: WorkflowSelection | undefined,
		options: WorkflowDraftWidgetOptions,
		@IHoverService hoverService: IHoverService,
		@IWorkflowAccessibilityService accessibilityService: IWorkflowAccessibilityService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('.monaco-workflow-draft', { role: 'group', 'aria-label': localize('workflow.pickerAria', "Workflow") }));
		this._register(accessibilityService.register(this.domNode, () => {
			return this.error ?? (this.selection
				? localize('workflow.draftAccessible', "{0}. Selected only; Start Workflow explicitly starts the run. Open the picker and choose No Workflow to clear the selection without changing your conversation. Change the stopping point in the checkpoint list after starting.", this.selection.snapshot.label)
				: localize('workflow.emptyDraftAccessible', "Choose a workflow from the action list, grouped by Workspace, User, Built-in, and Extensions. Use arrow keys to navigate, Enter to select, and Escape to return to the picker. Selection does not start work."));
		}));
		this.selected = this._register(new Button(this.domNode, { secondary: true, title: false }));
		this.selected.element.classList.add('action-label', 'workflow-draft-picker');
		this.selected.element.setAttribute('aria-haspopup', 'listbox');
		this.selected.element.setAttribute('aria-expanded', 'false');
		this.label = dom.append(this.selected.element, dom.$('span.workflow-draft-label'));
		const chevron = this.selected.element.appendChild(renderIcon(Codicon.chevronDown));
		chevron.setAttribute('aria-hidden', 'true');
		chevron.classList.add('workflow-draft-chevron');
		this._register(this.selected.onDidClick(() => options.onPick(this.selected.element)));
		this._register(hoverService.setupDelayedHover(this.selected.element, () => ({
			content: this.error ?? (!this.workflowsEnabled ? localize('workflow.draftDisabled', "Workflows are unavailable. Choose No Workflow in the picker to send a regular message.") : this.selection
				? localize('workflow.draftHint', "{0}. Change or remove this workflow. The stopping point and any missing inputs can be set in the checkpoint list after starting.", this.selection.snapshot.label)
				: localize('workflow.emptyDraftHint', "Choose a workflow for this session")),
		})));
		this.update(selection);
	}

	update(selection: WorkflowSelection | undefined, error?: string, enabled = true): void {
		this.selection = selection;
		this.error = error;
		this.workflowsEnabled = enabled;
		this.selected.enabled = enabled || !!selection || !!error;
		this.label.textContent = error ? localize('workflow.restoreFailed', "Workflow could not be restored") : selection?.snapshot.label ?? localize('workflow.pickerLabel', "Workflow");
		this.selected.element.setAttribute('aria-label', error ?? (selection ? localize('workflow.selectedPickerAria', "Workflow: {0}", selection.snapshot.label) : localize('workflow.choose', "Choose a Workflow")));
		this.domNode.classList.toggle('empty', !selection && !error);
		this.domNode.classList.toggle('workflow-error', !!error);
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}
}
