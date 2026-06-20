/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/surveyEditorPane.css';
import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISurveyDefinition, ISurveyQuestion, ISurveyRadioQuestion, ISurveySegmentQuestion, SurveyQuestionType } from './surveyQuestions.js';
import { SurveyEditorInput } from './surveyEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class SurveyEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.survey';

	private container: HTMLElement | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());
	private answers: Map<string, string[]> = new Map();
	private renderNonce = 0;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(SurveyEditorPane.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('div.survey-editor-pane'));
	}

	override async setInput(
		input: SurveyEditorInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken,
	): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this.container) {
			return;
		}

		this.resetState();
		this.renderForm(this.container, input.survey);
	}

	override clearInput(): void {
		this.resetState();
		super.clearInput();
	}

	private resetState(): void {
		this.inputDisposables.clear();
		this.answers.clear();
		this.renderNonce++;
		if (this.container) {
			clearNode(this.container);
		}
	}

	private renderForm(container: HTMLElement, survey: ISurveyDefinition): void {
		const form = append(container, $('div.survey-form'));

		// Title with icon
		const title = append(form, $('div.survey-title'));
		const titleIcon = append(title, $('span.survey-title-icon'));
		titleIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.sparkle));
		const titleText = append(title, $('span'));
		titleText.textContent = survey.title;

		const description = append(form, $('div.survey-description'));
		description.textContent = survey.description;

		// Questions
		for (const question of survey.questions) {
			this.renderQuestion(form, question);
		}

		// Submit button
		const submitRow = append(form, $('div.survey-submit-row'));
		const submitButton = append(submitRow, $('button.survey-submit-button')) as HTMLButtonElement;
		submitButton.textContent = localize('survey.submitFeedback', "Submit feedback");
		submitButton.type = 'button';
		submitButton.disabled = true;

		const updateSubmitState = () => {
			submitButton.disabled = this.answers.size < survey.questions.length
				|| [...this.answers.values()].some(v => v.length === 0);
		};

		this.inputDisposables.add(addDisposableListener(submitButton, 'click', () => {
			submitButton.disabled = true;
			this.handleSubmit(container, survey);
		}));

		this.inputDisposables.add(addDisposableListener(form, 'change', () => {
			updateSubmitState();
		}));
	}

	private renderQuestion(parent: HTMLElement, question: ISurveyQuestion): void {
		const questionEl = append(parent, $('div.survey-question'));

		const labelId = `survey-q-${this.renderNonce}-${question.id}`;
		const label = append(questionEl, $('div.survey-question-label'));
		label.id = labelId;
		label.textContent = question.label;

		const namePrefix = `${this.renderNonce}-${question.id}`;

		switch (question.type) {
			case SurveyQuestionType.Segment:
				this.renderSegmentQuestion(questionEl, question, labelId, namePrefix);
				break;
			case SurveyQuestionType.Radio:
				this.renderListQuestion(questionEl, question, labelId, namePrefix);
				break;
		}
	}

	private renderSegmentQuestion(parent: HTMLElement, question: ISurveySegmentQuestion, labelId: string, namePrefix: string): void {
		const group = append(parent, $('div.survey-segment-group'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-labelledby', labelId);

		for (const option of question.options) {
			const radio = append(group, $('input.survey-segment-input')) as HTMLInputElement;
			radio.type = 'radio';
			radio.name = namePrefix;
			radio.value = option;
			radio.id = `survey-seg-${namePrefix}-${option.replace(/\s+/g, '-').toLowerCase()}`;

			const optionLabel = append(group, $('label.survey-segment-label')) as HTMLLabelElement;
			optionLabel.htmlFor = radio.id;
			optionLabel.textContent = option;

			this.inputDisposables.add(addDisposableListener(radio, 'change', () => {
				if (radio.checked) {
					this.answers.set(question.id, [option]);
				}
			}));
		}
	}

	private renderListQuestion(parent: HTMLElement, question: ISurveyRadioQuestion, labelId: string, namePrefix: string): void {
		const group = append(parent, $('div.survey-list-group'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-labelledby', labelId);

		if (question.columns === 2) {
			group.classList.add('columns-2');
		}

		for (const option of question.options) {
			const optionLabel = append(group, $('label.survey-list-option')) as HTMLLabelElement;

			const radio = append(optionLabel, $('input.survey-list-input')) as HTMLInputElement;
			radio.type = 'radio';
			radio.name = namePrefix;
			radio.value = option;

			const text = append(optionLabel, $('span'));
			text.textContent = option;

			this.inputDisposables.add(addDisposableListener(radio, 'change', () => {
				if (radio.checked) {
					this.answers.set(question.id, [option]);
				}
			}));
		}
	}

	private handleSubmit(container: HTMLElement, survey: ISurveyDefinition): void {
		// Snapshot answers
		const answersSnapshot: Record<string, string[]> = {};
		for (const [key, value] of this.answers) {
			answersSnapshot[key] = [...value];
		}

		type SurveySubmitEvent = {
			surveyId: string;
			answers: string;
		};
		type SurveySubmitClassification = {
			surveyId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The survey identifier.' };
			answers: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'JSON-encoded survey answers (all values are string arrays).' };
			owner: 'digitarald';
			comment: 'Tracks in-product survey submissions for product-market fit analysis.';
		};
		this.telemetryService.publicLog2<SurveySubmitEvent, SurveySubmitClassification>('survey/submit', {
			surveyId: survey.id,
			answers: JSON.stringify(answersSnapshot),
		});

		const submittedInput = this.input;
		this.showSuccess(container, submittedInput);
	}

	private showSuccess(container: HTMLElement, submittedInput: EditorInput | undefined): void {
		clearNode(container);

		const success = append(container, $('div.survey-success'));

		const icon = append(success, $('div.survey-success-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.checkAll));

		const message = append(success, $('div.survey-success-message'));
		message.textContent = localize('survey.success.message', "Response sent");

		const detail = append(success, $('div.survey-success-detail'));
		detail.textContent = localize('survey.success.detail', "Your answer helps us understand who needs this most. Thank you.");

		// Auto-close after 3 seconds
		const timeout = setTimeout(() => {
			if (submittedInput) {
				this.editorService.closeEditor({ editor: submittedInput, groupId: this.group.id });
			}
		}, 3000);

		this.inputDisposables.add({ dispose: () => clearTimeout(timeout) });
	}

	override layout(): void {
		// no-op: CSS handles sizing
	}
}
