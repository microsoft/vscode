/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, render, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
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

/**
 * Render the inline feedback form. This replaces the widget content while
 * active — no separate overlay or popup.
 */
export function renderFeedbackDialog(props: FeedbackDialogProps, state: FeedbackDialogState): TemplateResult | typeof nothing {
	if (state.submitted) {
		return html`
			<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 14px;gap:8px;flex:1;">
				<span class="codicon codicon-check" style="font-size:20px;color:var(--vscode-charts-green);"></span>
				<span style="font-size:${FONT_SIZE.body};color:var(--vscode-foreground);font-weight:500;text-align:center;">${localize('agentsVoice.feedbackThanks', "Thank you for your feedback!")}</span>
			</div>
		`;
	}

	const submitDisabled = state.isSubmitting;
	let textareaEl: HTMLTextAreaElement | null = null;

	return html`
		<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">
			<div style="display:flex;align-items:center;gap:6px;">
				<span class="codicon codicon-feedback" style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-foreground);"></span>
				<span style="font-size:${FONT_SIZE.body};font-weight:600;color:var(--vscode-foreground);">${localize('agentsVoice.sendFeedback', "Send Feedback")}</span>
			</div>
			<textarea
				rows="3"
				placeholder="${localize('agentsVoice.feedbackPlaceholder', "What could we improve?")}"
				style="
					width:100%;box-sizing:border-box;
					background:var(--vscode-input-background);
					color:var(--vscode-input-foreground);
					border:1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
					border-radius:4px;padding:6px 8px;
					font-family:inherit;font-size:${FONT_SIZE.body};
					resize:vertical;min-height:48px;max-height:120px;
					outline:none;-webkit-app-region:no-drag;
				"
				@focus=${(e: FocusEvent) => { textareaEl = e.target as HTMLTextAreaElement; (e.target as HTMLElement).style.borderColor = 'var(--vscode-focusBorder)'; }}
				@blur=${(e: FocusEvent) => { (e.target as HTMLElement).style.borderColor = 'var(--vscode-input-border, var(--vscode-editorWidget-border))'; }}
				@input=${(e: InputEvent) => { textareaEl = e.target as HTMLTextAreaElement; }}
				?disabled=${submitDisabled}></textarea>
			<span style="font-size:${FONT_SIZE.micro};color:var(--vscode-descriptionForeground);line-height:1.3;">
				${localize('agentsVoice.feedbackConsent', "By submitting, you agree that your session logs and transcript history will be included with your feedback.")}
			</span>
			${state.error ? html`<span style="font-size:${FONT_SIZE.micro};color:var(--vscode-errorForeground);">${state.error}</span>` : nothing}
			<div style="display:flex;gap:6px;justify-content:flex-end;">
				<button
					style="-webkit-app-region:no-drag;background:transparent;border:1px solid var(--vscode-button-secondaryBackground, var(--vscode-editorWidget-border));color:var(--vscode-foreground);font-size:${FONT_SIZE.body};padding:3px 10px;border-radius:3px;cursor:pointer;"
					@click=${props.onCancel}
					?disabled=${submitDisabled}>${localize('agentsVoice.cancel', "Cancel")}</button>
				<button
					style="-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:3px 10px;border-radius:3px;cursor:pointer;font-weight:500;"
					@mouseenter=${(e: MouseEvent) => { if (!submitDisabled) { (e.target as HTMLElement).style.background = 'var(--vscode-button-hoverBackground)'; } }}
					@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.background = 'var(--vscode-button-background)'; }}
					@click=${() => {
			const text = textareaEl?.value.trim() ?? '';
			if (text) { props.onSubmit(text); }
		}}
					?disabled=${submitDisabled}>${state.isSubmitting ? localize('agentsVoice.submitting', "Submitting...") : localize('agentsVoice.submit', "Submit")}</button>
			</div>
		</div>
	`;
}

/**
 * Mount the feedback dialog into a container, returning a controller to
 * update state and unmount.
 */
export class FeedbackDialogController extends Disposable {
	private _state: FeedbackDialogState = { isSubmitting: false, submitted: false };

	constructor(
		private readonly _container: HTMLElement,
		private readonly _onSubmit: (feedbackText: string) => Promise<{ ok: boolean; error?: string }>,
		private readonly _onClose: () => void,
	) {
		super();
		this._render();
	}

	private _render(): void {
		render(renderFeedbackDialog({
			onSubmit: (text) => this._handleSubmit(text),
			onCancel: () => this._onClose(),
		}, this._state), this._container);
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
		render(nothing, this._container);
		super.dispose();
	}
}
