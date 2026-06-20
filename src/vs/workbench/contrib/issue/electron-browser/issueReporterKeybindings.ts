/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IssueReporterEditorPane, IssueReporterOpenContext } from './issueReporterEditorPane.js';
import { IssueReporterOverlay } from '../browser/issueReporterOverlay.js';

export const ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID = 'workbench.action.issueReporter.captureScreenshot';
export const ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID = 'workbench.action.issueReporter.toggleRecording';

/**
 * Watches the editor service to keep the `issueReporterOpen` context key in
 * sync, and installs a capture-phase key listener on every window so the issue
 * reporter shortcuts beat overlays/widgets that swallow key events (e.g. the
 * keybinding-recording widget inside the Keyboard Shortcuts editor or any
 * focused input that calls `stopPropagation()`). The capture-phase listener
 * only intercepts when the issue reporter is actually open, otherwise default
 * behavior (Save As, etc.) is preserved.
 */
class IssueReporterOpenStateContribution extends Disposable {

	static readonly ID = 'workbench.contrib.issueReporterOpenState';

	private issueReporterOpen = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		const ctx = IssueReporterOpenContext.bindTo(contextKeyService);
		const update = () => {
			this.issueReporterOpen = this.editorService.editors.some(e => e instanceof IssueReporterEditorInput);
			ctx.set(this.issueReporterOpen);
		};
		this._register(this.editorService.onDidEditorsChange(update));
		update();

		this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_DOWN, e => this.dispatchCapturePhase(e), true /* capture */));
		}, { window: mainWindow, disposables: this._store }));
	}

	private dispatchCapturePhase(e: KeyboardEvent): void {
		if (!this.issueReporterOpen) {
			return;
		}
		const evt = new StandardKeyboardEvent(e);
		const primaryMod = isMacintosh ? evt.metaKey : evt.ctrlKey;
		const otherMod = isMacintosh ? evt.ctrlKey : evt.metaKey;
		if (!primaryMod || !evt.shiftKey || evt.altKey || otherMod) {
			return;
		}
		let commandId: string | undefined;
		if (evt.keyCode === KeyCode.KeyS) {
			commandId = ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID;
		} else if (evt.keyCode === KeyCode.KeyR) {
			commandId = ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID;
		}
		if (!commandId) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		void this.commandService.executeCommand(commandId);
	}
}

registerWorkbenchContribution2(IssueReporterOpenStateContribution.ID, IssueReporterOpenStateContribution, WorkbenchPhase.AfterRestored);

function withWizard(fn: (pane: IssueReporterEditorPane, wizard: IssueReporterOverlay) => void): void {
	// Look up any live issue reporter pane regardless of whether its tab is the
	// active editor in its group. visibleEditorPanes only exposes the active
	// pane per group, so we can't rely on it when the user has switched to
	// another tab to set up a screenshot.
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
