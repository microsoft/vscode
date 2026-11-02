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
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IssueReporterController, IssueReporterOpenContext } from './issueReporterController.js';
import { IssueReporterOverlay } from '../browser/issueReporterOverlay.js';

export const ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID = 'workbench.action.issueReporter.captureScreenshot';
export const ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID = 'workbench.action.issueReporter.toggleRecording';

/** Keeps capture shortcuts active in either host, including source controls that consume keyboard events. */
export class IssueReporterOpenStateContribution extends Disposable {

	static readonly ID = 'workbench.contrib.issueReporterOpenState';

	private issueReporterOpen = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		const ctx = IssueReporterOpenContext.bindTo(contextKeyService);
		const update = () => {
			this.issueReporterOpen = !!IssueReporterController.getAnyLiveInstance() || this.editorService.editors.some(e => e instanceof IssueReporterEditorInput);
			ctx.set(this.issueReporterOpen);
		};
		this._register(this.editorService.onDidEditorsChange(update));
		this._register(IssueReporterController.onDidChangeInstances(update));
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
		const target = evt.target ?? mainWindow.document.body;
		const resolved = this.keybindingService.softDispatch(evt, target);
		if (resolved.kind !== ResultKind.KbFound || (resolved.commandId !== ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID && resolved.commandId !== ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (this.keybindingService.inChordMode) {
			this.keybindingService.dispatchEvent(evt, target);
		} else {
			void this.commandService.executeCommand(resolved.commandId);
		}
	}
}

registerWorkbenchContribution2(IssueReporterOpenStateContribution.ID, IssueReporterOpenStateContribution, WorkbenchPhase.AfterRestored);

function withWizard(fn: (wizard: IssueReporterOverlay) => void): void {
	const wizard = IssueReporterController.getAnyLiveInstance()?.getWizard();
	if (wizard) {
		fn(wizard);
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: IssueReporterOpenContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	handler: () => withWizard(wizard => wizard.triggerCaptureScreenshot()),
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: IssueReporterOpenContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
	handler: () => withWizard(wizard => wizard.triggerToggleRecording()),
});
