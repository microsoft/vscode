/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { getWorkflowCheckpointCaption, getWorkflowProgressDescription } from '../../../../platform/workflow/common/workflowProgress.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionWorkflowService } from './sessionWorkflowService.js';

export class WorkflowActionViewItem extends ActionViewItem {
	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionContext private readonly sessionContext: ISessionContext,
		@ISessionWorkflowService private readonly workflowService: ISessionWorkflowService,
	) {
		super(undefined, action, { ...options, icon: false, label: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('session-workflow-action');
		this._register(autorun(reader => {
			const session = this.sessionContext.session.read(reader);
			const progress = session?.workflow?.read(reader);
			const expanded = !!session && isEqual(this.workflowService.visibleSession.read(reader), session.resource);
			container.classList.toggle('expanded', expanded);
			this.updateTooltip();
			if (this.label) {
				const caption = progress
					? getWorkflowCheckpointCaption(progress) ?? progress.label
					: localize('workflow.show', "Show Workflow");
				this.label.textContent = caption;
				this.label.setAttribute('aria-label', progress
					? expanded
						? localize('workflow.hideCheckpointDescription', "Hide workflow sidebar. {0}. {1}", caption, getWorkflowProgressDescription(progress))
						: localize('workflow.showCheckpointDescription', "Show workflow sidebar. {0}. {1}", caption, getWorkflowProgressDescription(progress))
					: this.getTooltip());
				this.label.setAttribute('aria-expanded', String(expanded));
				this.label.setAttribute('aria-pressed', String(expanded));
			}
		}));
	}

	protected override getTooltip(): string {
		const session = this.sessionContext.session.get();
		const progress = session?.workflow?.get();
		const action = session && isEqual(this.workflowService.visibleSession.get(), session.resource)
			? localize('workflow.hideSidebar', "Hide Workflow Sidebar")
			: localize('workflow.showSidebar', "Show Workflow Sidebar");
		return progress ? localize('workflow.toggleTooltip', "{0}: {1}", action, getWorkflowProgressDescription(progress)) : action;
	}
}
