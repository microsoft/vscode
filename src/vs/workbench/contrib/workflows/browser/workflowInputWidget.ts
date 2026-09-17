/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { uppercaseFirstLetter } from '../../../../base/common/strings.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { WorkflowRunViewModel } from '../common/workflowRunViewModel.js';

/** Collects only the current checkpoint's missing values. Drafts belong to the run view model. */
export class WorkflowInputWidget extends Disposable {
	readonly focusTargets = new Map<string, { focus(): void }>();

	constructor(
		container: HTMLElement,
		viewModel: WorkflowRunViewModel,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		const run = viewModel.run.get();
		const request = run.inputRequest;
		if (!request) {
			throw new Error('WorkflowInputWidget requires a checkpoint input request');
		}
		const enabled = run.status === 'blocked' && !viewModel.busy.get();
		const form = dom.append(container, dom.$('.workflow-checkpoint-inputs', { role: 'group', 'aria-label': localize('workflow.checkpointInputs', "Inputs for {0}", run.snapshot.checkpoints[run.checkpointIndex].label) }));
		for (const key of request.keys) {
			const schema = run.snapshot.inputSchema?.properties?.[key];
			const field = dom.append(form, dom.$('.workflow-input-field'));
			const label = dom.append(field, dom.$('label'));
			label.textContent = schema?.title ?? uppercaseFirstLetter(key);
			if (schema?.description) {
				this._register(hoverService.setupDelayedHover(label, { content: schema.description }));
			}
			const draft = viewModel.inputDrafts.get()[key];
			const values = schema?.enum ?? (schema?.type === 'boolean' ? [true, false] : undefined);
			const focusKey = `input-${request.checkpointId}-${key}`;
			if (values) {
				const selectContainer = dom.append(field, dom.$('.workflow-input-select'));
				const textValues = values.map(value => schema?.type === 'string' ? String(value) : JSON.stringify(value));
				const select = this._register(new SelectBox([
					{ text: localize('workflow.selectInput', "Select…"), isDisabled: true },
					...textValues.map(text => ({ text })),
				], draft === undefined ? 0 : textValues.indexOf(draft) + 1, contextViewService, defaultSelectBoxStyles, {
					ariaLabel: label.textContent,
					ariaDescription: localize('workflow.requiredInput', "Required for this checkpoint."),
				}));
				select.render(selectContainer);
				select.setEnabled(enabled);
				selectContainer.dataset.workflowFocus = focusKey;
				this.focusTargets.set(focusKey, select);
				this._register(dom.addDisposableListener(label, 'click', () => select.focus()));
				this._register(select.onDidSelect(event => {
					if (event.index > 0) {
						viewModel.setInputValue(key, textValues[event.index - 1]);
					}
				}));
			} else {
				const input = this._register(new InputBox(field, contextViewService, {
					inputBoxStyles: defaultInputBoxStyles,
					ariaLabel: label.textContent,
					flexibleHeight: schema?.type === 'object' || schema?.type === 'array',
					flexibleMaxHeight: 160,
					placeholder: schema?.type === 'object' || schema?.type === 'array' ? localize('workflow.jsonInput', "JSON value") : undefined,
				}));
				input.inputElement.id = generateUuid();
				label.setAttribute('for', input.inputElement.id);
				input.value = draft ?? '';
				input.inputElement.dataset.workflowFocus = focusKey;
				input.inputElement.setAttribute('aria-required', 'true');
				this.focusTargets.set(focusKey, input.inputElement);
				input.inputElement.readOnly = !enabled;
				this._register(input.onDidChange(value => viewModel.setInputValue(key, value)));
				this._register(dom.addDisposableListener(input.inputElement, 'keydown', (event: KeyboardEvent) => {
					if (event.key === 'Enter' && !event.isComposing && !event.shiftKey && schema?.type !== 'object' && schema?.type !== 'array' && enabled) {
						event.preventDefault();
						void viewModel.provideInputs();
					}
				}));
			}
		}
		const submit = this._register(new Button(form, { ...defaultButtonStyles, title: false }));
		submit.label = localize('workflow.submitInputs', "Continue");
		submit.enabled = enabled;
		submit.element.dataset.workflowFocus = 'submit-inputs';
		this.focusTargets.set('submit-inputs', submit.element);
		this._register(hoverService.setupDelayedHover(submit.element, { content: localize('workflow.submitInputsHint', "Use these values for this run and continue within the confirmed stopping point.") }));
		this._register(submit.onDidClick(() => viewModel.provideInputs()));
	}
}
