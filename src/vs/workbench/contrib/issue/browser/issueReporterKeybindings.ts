/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IssueReporterEditorInput } from './issueReporterEditorInput.js';
import { IssueReporterEditorPane, IssueReporterOpenContext } from './issueReporterEditorPane.js';
import { IssueReporterOverlay } from './issueReporterOverlay.js';export const ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID = 'workbench.action.issueReporter.captureScreenshot';
export const ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID = 'workbench.action.issueReporter.toggleRecording';

/**
 * Watches the editor service and keeps the `issueReporterOpen` context key in
 * sync. Used to scope the issue reporter keybindings so they fire from any
 * editor (not just when the issue reporter is focused) but only when an issue
 * reporter editor is actually open somewhere.
 */
class IssueReporterOpenStateContribution extends Disposable {

	static readonly ID = 'workbench.contrib.issueReporterOpenState';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const ctx = IssueReporterOpenContext.bindTo(contextKeyService);
		const update = () => ctx.set(this.editorService.editors.some(e => e instanceof IssueReporterEditorInput));
		this._register(this.editorService.onDidEditorsChange(update));
		update();
	}
}

registerWorkbenchContribution2(IssueReporterOpenStateContribution.ID, IssueReporterOpenStateContribution, WorkbenchPhase.AfterRestored);

function withWizard(fn: (pane: IssueReporterEditorPane, wizard: IssueReporterOverlay) => void): void {
	// Look up any live issue reporter pane regardless of whether its tab is the
	// active editor in its group. visibleEditorPanes only exposes the active
	// pane per group, so we can't rely on it when the user has switched to
	// another tab in the same group.
	const pane = IssueReporterEditorPane.getAnyLiveInstance();
	const wizard = pane?.getWizard();
	if (pane && wizard) {
		fn(pane, wizard);
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: IssueReporterOpenContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	handler: () => withWizard((_pane, wizard) => wizard.triggerCaptureScreenshot()),
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: IssueReporterOpenContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
	handler: () => withWizard((_pane, wizard) => wizard.triggerToggleRecording()),
});
