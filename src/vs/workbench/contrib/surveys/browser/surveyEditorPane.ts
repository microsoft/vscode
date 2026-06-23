/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/surveyEditorPane.css';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
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
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISurveyDefinition, ISurveyQuestion, ISurveyRadioQuestion, ISurveySegmentQuestion, SurveyQuestionType } from './surveyQuestions.js';
import { SurveyEditorInput } from './surveyEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class SurveyEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.survey';

	private container: HTMLElement | undefined;
	private firstInput: HTMLInputElement | undefined;
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
		this.container.setAttribute('role', 'form');
		this.container.setAttribute('aria-label', localize('survey.pane.ariaLabel', "Survey"));
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
		this.firstInput = undefined;
		this.renderNonce++;
		if (this.container) {
			clearNode(this.container);
		}
	}

	private renderForm(container: HTMLElement, survey: ISurveyDefinition): void {
		const form = append(container, $('div.survey-form'));

		// Title with decorative icon
		const title = append(form, $('div.survey-title'));
		const titleIcon = append(title, $('span.survey-title-icon'));
		titleIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.sparkle));
		titleIcon.setAttribute('aria-hidden', 'true');
		const titleText = append(title, $('span'));
		titleText.textContent = survey.title;

		const description = append(form, $('div.survey-description'));
		description.textContent = survey.description;

		// Questions
		for (const question of survey.questions) {
			this.renderQuestion(form, question);
		}

		// Submit button (shared Button widget for consistent theming)
		const submitRow = append(form, $('div.survey-submit-row'));
		const submitButton = this.inputDisposables.add(new Button(submitRow, { ...defaultButtonStyles }));
		submitButton.label = localize('survey.submitFeedback', "Submit feedback");
		submitButton.enabled = false;

		const hintId = `survey-hint-${this.renderNonce}`;
		const hint = append(submitRow, $('div.survey-submit-hint'));
		hint.id = hintId;
		hint.textContent = localize('survey.submitHint', "Answer the required question to submit");
		submitButton.element.setAttribute('aria-describedby', hintId);

		const requiredQuestionIds = survey.questions.filter(q => q.required).map(q => q.id);

		const updateSubmitState = () => {
			const allRequiredAnswered = requiredQuestionIds.every(id => {
				const answer = this.answers.get(id);
				return answer && answer.length > 0;
			});
			submitButton.enabled = allRequiredAnswered;
			hint.style.display = allRequiredAnswered ? 'none' : '';
		};

		this.inputDisposables.add(submitButton.onDidClick(() => {
			submitButton.enabled = false;
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
		label.textContent = question.required
			? question.label
			: localize('survey.questionOptional', "{0} (optional)", question.label);

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
		if (question.required) {
			group.setAttribute('aria-required', 'true');
		}

		for (let i = 0; i < question.options.length; i++) {
			const option = question.options[i];
			const radio = append(group, $('input.survey-segment-input')) as HTMLInputElement;
			radio.type = 'radio';
			radio.name = namePrefix;
			radio.value = option.id;
			radio.id = `survey-seg-${namePrefix}-${i}`;

			if (!this.firstInput) {
				this.firstInput = radio;
			}

			const optionLabel = append(group, $('label.survey-segment-label')) as HTMLLabelElement;
			optionLabel.htmlFor = radio.id;
			optionLabel.textContent = option.label;

			this.inputDisposables.add(addDisposableListener(radio, 'change', () => {
				if (radio.checked) {
					this.answers.set(question.id, [option.id]);
				}
			}));
		}
	}

	private renderListQuestion(parent: HTMLElement, question: ISurveyRadioQuestion, labelId: string, namePrefix: string): void {
		const group = append(parent, $('div.survey-list-group'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-labelledby', labelId);
		if (question.required) {
			group.setAttribute('aria-required', 'true');
		}

		if (question.columns === 2) {
			group.classList.add('columns-2');
		}

		for (let i = 0; i < question.options.length; i++) {
			const option = question.options[i];
			const optionLabel = append(group, $('label.survey-list-option')) as HTMLLabelElement;

			const radio = append(optionLabel, $('input.survey-list-input')) as HTMLInputElement;
			radio.type = 'radio';
			radio.name = namePrefix;
			radio.value = option.id;

			if (!this.firstInput) {
				this.firstInput = radio;
			}

			const text = append(optionLabel, $('span'));
			text.textContent = option.label;

			this.inputDisposables.add(addDisposableListener(radio, 'change', () => {
				if (radio.checked) {
					this.answers.set(question.id, [option.id]);
				}
			}));
		}
	}

	private handleSubmit(container: HTMLElement, survey: ISurveyDefinition): void {
		// Snapshot answers at submit time
		const answersSnapshot: Record<string, string[]> = {};
		for (const [key, value] of this.answers) {
			answersSnapshot[key] = [...value];
		}

		// Build telemetry from question telemetryKey declarations
		let score = -1;
		let primaryBenefit = '';
		let primaryFriction = '';
		let programmingExperience = -1;

		for (const question of survey.questions) {
			if (!question.telemetryKey) {
				continue;
			}
			const answer = answersSnapshot[question.id]?.[0] ?? '';
			if (question.asMeasurement) {
				const index = answer ? question.options.findIndex(o => o.id === answer) : -1;
				switch (question.telemetryKey) {
					case 'score': score = index; break;
					case 'programmingExperience': programmingExperience = index; break;
				}
			} else {
				switch (question.telemetryKey) {
					case 'primaryBenefit': primaryBenefit = answer; break;
					case 'primaryFriction': primaryFriction = answer; break;
				}
			}
		}

		// Get the source from the input (what feature triggered the survey)
		const source = (this.input as SurveyEditorInput)?.source ?? '';

		type SurveySubmitEvent = {
			surveyId: string;
			source: string;
			score: number;
			primaryBenefit: string;
			primaryFriction: string;
			programmingExperience: number;
		};
		type SurveySubmitClassification = {
			surveyId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The survey identifier.' };
			source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature source that triggered the survey (e.g. completions, panel.agent, nps).' };
			score: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Primary score as option index (e.g. PMF disappointment 0-4, NPS 0-10). -1 if not answered.' };
			primaryBenefit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The primary value driver option ID selected by the user, empty if not applicable.' };
			primaryFriction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The primary friction point option ID selected by the user, empty if not applicable.' };
			programmingExperience: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Programming experience bracket as option index (0=<3yr, 1=3-5yr, 2=6-9yr, 3=10-19yr, 4=20+yr). -1 if not answered.' };
			owner: 'digitarald';
			comment: 'Tracks in-product survey submissions. Fields are populated based on the survey definition telemetryKey mappings.';
		};
		this.telemetryService.publicLog2<SurveySubmitEvent, SurveySubmitClassification>('survey/submit', {
			surveyId: survey.id,
			source,
			score,
			primaryBenefit,
			primaryFriction,
			programmingExperience,
		});

		const submittedInput = this.input;
		this.showSuccess(container, submittedInput);
	}

	private showSuccess(container: HTMLElement, submittedInput: EditorInput | undefined): void {
		clearNode(container);

		const success = append(container, $('div.survey-success'));
		success.setAttribute('role', 'status');
		success.setAttribute('aria-live', 'polite');

		const icon = append(success, $('div.survey-success-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.checkAll));
		icon.setAttribute('aria-hidden', 'true');

		const successMessage = localize('survey.success.message', "Response sent");
		const message = append(success, $('div.survey-success-message'));
		message.textContent = successMessage;

		const detail = append(success, $('div.survey-success-detail'));
		detail.textContent = localize('survey.success.detail', "Your answer helps us understand who needs this most. Thank you.");

		// Announce to screen readers and move focus to success container
		status(successMessage);
		success.tabIndex = -1;
		success.focus();

		// Auto-close after 5 seconds (longer than visual to allow screen readers to finish)
		const timeout = setTimeout(() => {
			if (submittedInput) {
				this.editorService.closeEditor({ editor: submittedInput, groupId: this.group.id }).catch(onUnexpectedError);
			}
		}, 5000);

		this.inputDisposables.add({ dispose: () => clearTimeout(timeout) });
	}

	override focus(): void {
		super.focus();
		this.firstInput?.focus();
	}

	override layout(): void {
		// no-op: CSS handles sizing
	}
}
