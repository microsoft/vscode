/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsSetUp.css';
import { Button } from '../../base/browser/ui/button/button.js';
import { Dialog, DialogContentsAlignment } from '../../base/browser/ui/dialog/dialog.js';
import { Codicon } from '../../base/common/codicons.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { createWorkbenchDialogOptions } from '../../workbench/browser/parts/dialogs/dialog.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../workbench/services/layout/browser/layoutService.js';
import { RETURN_TO_VSCODE_EDITOR_COMMAND_ID } from '../common/sessionCommands.js';

export function createSessionsSignInDialogOptions(commandService: ICommandService, showReturnToVSCodeEditor: boolean) {
	return {
		forceSignInDialog: true,
		dialogIcon: Codicon.agent,
		dialogTitle: localize('sessions.signIn', "Sign in to use Agents"),
		disableCloseButton: true,
		dialogExtraClasses: ['sessions-welcome-dialog'],
		renderDialogFooter: showReturnToVSCodeEditor ? (footer: HTMLElement) => createDialogAction(
			footer,
			localize('sessions.returnToVSCodeEditor', "Return to VS Code Editor"),
			() => {
				void commandService.executeCommand<void>(RETURN_TO_VSCODE_EDITOR_COMMAND_ID).catch(onUnexpectedError);
			}
		) : undefined,
	};
}

export class SessionsSigningInDialog extends Disposable {

	private readonly dialog: Dialog;
	private isDisposed = false;
	private didCancel = false;

	constructor(
		private readonly onCancel: () => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
	) {
		super();

		this.dialog = this._register(new Dialog(
			layoutService.activeContainer,
			localize('sessions.signingIn', "Signing in…"),
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog', 'sessions-welcome-dialog'],
				detail: localize('sessions.signingIn.detail', "Please complete sign-in in the browser."),
				icon: Codicon.agent,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: 0,
				disableCloseButton: true,
				disableDefaultAction: true,
				renderFooter: footer => {
					const element = footer.appendChild(footer.ownerDocument.createElement('div'));
					element.classList.add('chat-setup-dialog-footer');
					this._register(createDialogAction(
						element,
						localize('sessions.cancelSignIn', "Cancel Sign-In"),
						() => this.cancel()
					));
				},
			}, keybindingService, layoutService, hostService)
		));

		void this.show();
	}

	private async show(): Promise<void> {
		await this.dialog.show();
		if (!this.isDisposed) {
			this.cancel();
		}
	}

	private cancel(): void {
		if (this.didCancel) {
			return;
		}
		this.didCancel = true;
		this.onCancel();
	}

	override dispose(): void {
		this.isDisposed = true;
		super.dispose();
	}
}

function createDialogAction(container: HTMLElement, label: string, run: () => void): IDisposable {
	const disposables = new DisposableStore();
	const action = disposables.add(new Button(container, {}));
	action.element.classList.add('sessions-sign-in-dialog-action');
	action.label = label;
	disposables.add(action.onDidClick(run));
	return disposables;
}
