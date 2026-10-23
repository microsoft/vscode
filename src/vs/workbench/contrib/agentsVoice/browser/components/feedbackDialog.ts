/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { FONT_SIZE } from './tokens.js';

export interface FeedbackDialogProps {
	readonly onSubmit: (feedbackText: string) => void;
	readonly onCancel: () => void;
}

export interface FeedbackDialogState {
	readonly isSubmitting: boolean;
	readonly error?: string;
	readonly submitted: boolean;
}

export interface FeedbackDialogComponent {
	readonly element: HTMLElement;
	update(props: FeedbackDialogProps, state: FeedbackDialogState): void;
}

export function createFeedbackDialog(): FeedbackDialogComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';

	// Success view
	const successView = dom.$('div');
	successView.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 14px;gap:8px;flex:1;';
	const successIcon = dom.$('span.codicon.codicon-check');
	successIcon.style.cssText = 'font-size:20px;color:var(--vscode-charts-green);';
	const successText = dom.$('span');
	successText.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-foreground);font-weight:500;text-align:center;`;
	successText.textContent = localize('agentsVoice.feedbackThanks', "Thank you for your feedback!");
	successView.append(successIcon, successText);

	// Form view
	const formView = dom.$('div');
	formView.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';

	const headerRow = dom.$('div');
	headerRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
	const headerIcon = dom.$('span.codicon.codicon-feedback');
	headerIcon.style.fontSize = FONT_SIZE.iconSm;
	headerIcon.style.color = 'var(--vscode-foreground)';
	const headerText = dom.$('span');
	headerText.style.cssText = `font-size:${FONT_SIZE.body};font-weight:600;color:var(--vscode-foreground);`;
	headerText.textContent = localize('agentsVoice.sendFeedback', "Send Feedback");
	headerRow.append(headerIcon, headerText);

	const textarea = document.createElement('textarea');
	textarea.rows = 3;
	textarea.placeholder = localize('agentsVoice.feedbackPlaceholder', "What could we improve?");
	textarea.style.cssText = `width:100%;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));border-radius:4px;padding:6px 8px;font-family:inherit;font-size:${FONT_SIZE.body};resize:vertical;min-height:48px;max-height:120px;outline:none;-webkit-app-region:no-drag;`;
	textarea.addEventListener('focus', () => { textarea.style.borderColor = 'var(--vscode-focusBorder)'; });
	textarea.addEventListener('blur', () => { textarea.style.borderColor = 'var(--vscode-input-border, var(--vscode-editorWidget-border))'; });

	const consent = dom.$('span');
	consent.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-descriptionForeground);line-height:1.3;`;
	consent.textContent = localize('agentsVoice.feedbackConsent', "By submitting, you agree that your session logs and transcript history will be included with your feedback.");

	const errorEl = dom.$('span');
	errorEl.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-errorForeground);`;

	const buttonRow = dom.$('div');
	buttonRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';

	const cancelBtn = document.createElement('button');
	cancelBtn.style.cssText = `-webkit-app-region:no-drag;background:transparent;border:1px solid var(--vscode-button-secondaryBackground, var(--vscode-editorWidget-border));color:var(--vscode-foreground);font-size:${FONT_SIZE.body};padding:3px 10px;border-radius:3px;cursor:pointer;`;
	cancelBtn.textContent = localize('agentsVoice.cancel', "Cancel");

	const submitBtn = document.createElement('button');
	submitBtn.style.cssText = `-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:3px 10px;border-radius:3px;cursor:pointer;font-weight:500;`;
	submitBtn.addEventListener('mouseenter', () => { if (!submitBtn.disabled) { submitBtn.style.background = 'var(--vscode-button-hoverBackground)'; } });
	submitBtn.addEventListener('mouseleave', () => { submitBtn.style.background = 'var(--vscode-button-background)'; });

	buttonRow.append(cancelBtn, submitBtn);
	formView.append(headerRow, textarea, consent, errorEl, buttonRow);

	container.append(successView, formView);

	return {
		element: container,
		update(props: FeedbackDialogProps, state: FeedbackDialogState) {
			if (state.submitted) {
				successView.style.display = 'flex';
				formView.style.display = 'none';
				return;
			}

			successView.style.display = 'none';
			formView.style.display = 'flex';

			const submitDisabled = state.isSubmitting;
			textarea.disabled = submitDisabled;
			cancelBtn.disabled = submitDisabled;
			cancelBtn.onclick = () => props.onCancel();
			submitBtn.disabled = submitDisabled;
			submitBtn.textContent = state.isSubmitting
				? localize('agentsVoice.submitting', "Submitting...")
				: localize('agentsVoice.submit', "Submit");
			submitBtn.onclick = () => {
				const text = textarea.value.trim();
				if (text) { props.onSubmit(text); }
			};

			if (state.error) {
				errorEl.style.display = '';
				errorEl.textContent = state.error;
			} else {
				errorEl.style.display = 'none';
			}
		}
	};
}

/**
 * Mount the feedback dialog into a container, returning a controller to
 * update state and unmount.
 */
export class FeedbackDialogController extends Disposable {
	private _state: FeedbackDialogState = { isSubmitting: false, submitted: false };
	private readonly _dialog: FeedbackDialogComponent;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _onSubmit: (feedbackText: string) => Promise<{ ok: boolean; error?: string }>,
		private readonly _onClose: () => void,
	) {
		super();
		this._dialog = createFeedbackDialog();
		this._container.append(this._dialog.element);
		this._render();
	}

	private _render(): void {
		this._dialog.update({
			onSubmit: (text) => this._handleSubmit(text),
			onCancel: () => this._onClose(),
		}, this._state);
	}

	private async _handleSubmit(text: string): Promise<void> {
		this._state = { isSubmitting: true, submitted: false };
		this._render();

		const result = await this._onSubmit(text);
		if (result.ok) {
			this._state = { isSubmitting: false, submitted: true };
			this._render();
			this._register(disposableTimeout(() => this._onClose(), 3000));
		} else {
			this._state = { isSubmitting: false, submitted: false, error: result.error ?? localize('agentsVoice.feedbackError', "Failed to submit feedback") };
			this._render();
		}
	}

	override dispose(): void {
		dom.clearNode(this._container);
		super.dispose();
	}
}
