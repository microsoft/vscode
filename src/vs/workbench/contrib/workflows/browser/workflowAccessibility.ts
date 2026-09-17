/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

const workflowFocused = new RawContextKey<boolean>('workflowFocused', false);

interface WorkflowAccessibleSurface {
	readonly container: HTMLElement;
	readonly content: () => string;
}

export interface IWorkflowAccessibilityService {
	readonly _serviceBrand: undefined;
	readonly active: WorkflowAccessibleSurface | undefined;
	register(container: HTMLElement, content: () => string): IDisposable;
}

export const IWorkflowAccessibilityService = createDecorator<IWorkflowAccessibilityService>('workflowAccessibilityService');

export class WorkflowAccessibilityService implements IWorkflowAccessibilityService {
	declare readonly _serviceBrand: undefined;
	active: WorkflowAccessibleSurface | undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) { }

	register(container: HTMLElement, content: () => string): IDisposable {
		const store = new DisposableStore();
		const scope = store.add(this.contextKeyService.createScoped(container));
		const focused = workflowFocused.bindTo(scope);
		const tracker = store.add(dom.trackFocus(container));
		const surface = { container, content };
		let hinted = false;
		store.add(tracker.onDidFocus(() => {
			focused.set(true);
			this.active = surface;
			if (!hinted && this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue(AccessibilityVerbositySettingId.Workflows)) {
				hinted = true;
				const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
				status(keybinding ? localize('workflow.accessibleHint', "Press {0} for workflow accessibility help.", keybinding) : localize('workflow.accessibleHintCommand', "Run Open Accessibility Help for workflow keyboard instructions."));
			}
		}));
		store.add(tracker.onDidBlur(() => focused.set(false)));
		store.add(toDisposable(() => {
			if (this.active === surface) {
				this.active = undefined;
			}
		}));
		return store;
	}
}

export class WorkflowAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'workflows';
	readonly when = workflowFocused;

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const surface = accessor.get(IWorkflowAccessibilityService).active;
		if (!surface) {
			return undefined;
		}
		const focused = dom.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Workflows,
			{ type: this.type },
			() => this.type === AccessibleViewType.View ? surface.content() : [
				localize('workflow.help.overview', "Workflows are ordered checkpoint assignments. Choosing or editing a template never starts work. Start Workflow is a separate explicit action. Your selected Work until checkpoint is an assignment boundary, not an additional tool permission."),
				localize('workflow.help.inputs', "Choose a workflow without configuring inputs or a stopping point first. New selections initially stop after the first checkpoint. The checkpoint list asks for missing values only when a checkpoint needs them. Use Tab to reach each field, then Continue to use those values for this run without changing its stopping point. Repository information is inferred from the owning session when available. Values already used by a checkpoint cannot be changed."),
				localize('workflow.help.navigation', "Use Tab and Shift+Tab to move between actions. Use Up and Down Arrow in checkpoint and template lists. Enter or Space expands a completed checkpoint's proof. Selecting an unfinished checkpoint proposes a stopping point without starting work. Escape closes a picker or returns to the checkpoint list on a narrow editor; the Back to Checkpoints action also returns to that list."),
				localize('workflow.help.sidebar', "In the Agents window, the workflow toggle to the right of the session header toolbar opens the checkpoint sidebar beside the chat, or below it in a narrow view. The sidebar does not cover messages and stays open when you return to the chat or reveal a checkpoint's first turn. Toggle it again, use Close Workflow Sidebar, or press Escape in the sidebar to close it and return focus. Escape first cancels an unconfirmed stopping-point change when its slider has focus."),
				localize('workflow.help.progress', "Completed checkpoints expand independently into proof links only. The Show First Chat Turn action sits before the expansion chevron and returns to the checkpoint's original turn without resuming work. GitHub proof icons describe the state captured at that checkpoint, not its current live state. View Proof opens accepted structured proof in a read-only document."),
				localize('workflow.help.startCondition', "Accessible View includes previously checked before-start evidence separately from checkpoint completion. These historical observations never authorize more work; conditions are checked again before work starts."),
				localize('workflow.help.linked', "When available, open a checkpoint's More Actions menu for New Linked Workflow. It prepares an independent draft; start it explicitly and adjust its stopping point in its own checkpoint list."),
				localize('workflow.help.stop', "The horizontal Agent stopping point line is a vertical slider. Drag it, use its hover or focus move toolbar, or use Arrow keys, Home, and End. It cannot move above completed checkpoints. Tab reaches each toolbar; Left and Right Arrow move between its actions. Enter or Apply confirms the proposal; Escape or Cancel discards it."),
				localize('workflow.help.stopNow', "Right-click the stopping line or press Shift+F10 to choose Stop Workflow. This interrupts current work and automatic wake-ups, preserving proof and the confirmed stopping point. Continue appears only when interrupted or blocked work remains within that stopping point. Changing the line does not restart an interrupted workflow; choose Continue explicitly after resolving the interruption."),
				localize('workflow.help.authoring', "The workflow editor changes the real JSONC document. Save and Revert use its ordinary file lifecycle. Drag checkpoints from their right-hand handle, use the adjacent hover or focus move toolbar, or press Alt+Up and Alt+Down to reorder while preserving input dependencies. Right-click a checkpoint or press Shift+F10 to open its context menu and remove it. Activate a title to select its text and rename it in place; Enter applies, and Escape or clicking away cancels. Instructions apply to this workflow only. Customize for This Workflow makes a local contract before editing proof, inputs, or conditions. Technical versions remain in the JSONC document rather than the picker or form."),
				localize('workflow.help.groups', "After completion can name an existing or planned session group. Naming a group does not create or move anything until the checkpoint completes."),
				localize('workflow.help.view', "Use {0} to read the current workflow as plain text.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n'),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : surface.container.focus(),
			AccessibilityVerbositySettingId.Workflows,
		);
	}
}
