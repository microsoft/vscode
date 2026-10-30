/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselPart, IChatQuestionCarouselOptions } from '../../../../contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { IChatRequestViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatQuestionCarouselData } from '../../../../contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ITerminalChatService } from '../../../../contrib/terminal/browser/terminal.js';
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css';

function createCarousel(questions: IChatQuestion[], allowSkip: boolean = true): IChatQuestionCarousel {
	return {
		questions,
		allowSkip,
		kind: 'questionCarousel',
	};
}

function createMockContext(): IChatContentPartRenderContext {
	return {
		element: new class extends mock<IChatRequestViewModel>() { }(),
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};
}

function createOptions(overrides: Partial<IChatQuestionCarouselOptions> = {}): IChatQuestionCarouselOptions {
	return {
		...overrides,
		onSubmit: () => { },
		shouldAutoFocus: false,
	};
}

function renderCarousel(context: ComponentFixtureContext, carousel: IChatQuestionCarousel, standalone: boolean = false, options: Partial<IChatQuestionCarouselOptions> = {}, afterRender?: (part: ChatQuestionCarouselPart) => void): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}());
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.definePartialInstance(ITerminalChatService, {
				getTerminalInstanceByExecutionId: () => undefined,
			});
		},
	});

	const part = disposableStore.add(
		instantiationService.createInstance(
			ChatQuestionCarouselPart,
			carousel,
			standalone ? undefined : createMockContext(),
			createOptions(options),
		)
	);

	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	// The CSS uses `.interactive-session .interactive-input-part > .chat-question-carousel-widget-container`
	// for most layout rules, so we need those wrapper elements.
	const inputPart = dom.$('.interactive-input-part');
	const widgetContainer = dom.$('.chat-question-carousel-widget-container');
	inputPart.appendChild(widgetContainer);
	container.appendChild(inputPart);

	widgetContainer.appendChild(part.domNode);
	afterRender?.(part);
}

async function renderLayoutCarousel(
	context: ComponentFixtureContext,
	carousel: IChatQuestionCarousel,
	expectedLayout: (header: HTMLElement, input: HTMLElement, availableHeight: number) => boolean,
	afterRender?: (part: ChatQuestionCarouselPart) => void,
): Promise<void> {
	renderCarousel(context, carousel, false, {}, afterRender);
	const card = context.container.querySelector<HTMLElement>('.chat-question-carousel-container')!;
	const header = card.querySelector<HTMLElement>('.chat-question-header-row')!;
	const input = card.querySelector<HTMLElement>('.chat-question-input-container')!;
	const footer = card.querySelector<HTMLElement>('.chat-question-footer-row')!;
	const validation = card.querySelector<HTMLElement>('.chat-question-validation-message')!;
	let previousLayout = '';
	await waitForFixtureCondition(() => {
		const availableHeight = Math.min(420, dom.getWindow(card).innerHeight * 0.45) - footer.offsetHeight - validation.offsetHeight;
		const layout = [card.clientHeight, header.clientHeight, header.scrollHeight, header.scrollTop, input.clientHeight, input.scrollHeight, input.scrollTop, footer.offsetHeight, validation.offsetHeight].join(',');
		const stable = layout === previousLayout;
		previousLayout = layout;
		return stable && header.style.maxHeight !== '' && input.style.maxHeight !== '' &&
			footer.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom &&
			expectedLayout(header, input, availableHeight);
	}, 'Question carousel did not reach the expected height allocation');
}

function hasEqualScrollableSections(header: HTMLElement, input: HTMLElement, availableHeight: number): boolean {
	return Math.abs(header.clientHeight - availableHeight / 2) <= 1 &&
		Math.abs(input.clientHeight - availableHeight / 2) <= 1 &&
		header.scrollHeight > header.clientHeight && input.scrollHeight > input.clientHeight;
}

// ============================================================================
// Sample questions
// ============================================================================

const textQuestion: IChatQuestion = {
	id: 'project-name',
	type: 'text',
	title: 'Project name',
	message: 'What is the name of your project?',
	defaultValue: 'my-project',
};

const singleSelectQuestion: IChatQuestion = {
	id: 'language',
	type: 'singleSelect',
	title: 'Language',
	message: 'Which language do you want to use?',
	options: [
		{ id: 'ts', label: 'TypeScript - Strongly typed JavaScript', value: 'typescript' },
		{ id: 'js', label: 'JavaScript - Dynamic scripting language', value: 'javascript' },
		{ id: 'py', label: 'Python - General purpose language', value: 'python' },
		{ id: 'rs', label: 'Rust - Systems programming', value: 'rust' },
	],
	defaultValue: 'ts',
};

const multiSelectQuestion: IChatQuestion = {
	id: 'features',
	type: 'multiSelect',
	title: 'Features',
	message: 'Which features should be enabled?',
	options: [
		{ id: 'lint', label: 'Linting', value: 'linting' },
		{ id: 'fmt', label: 'Formatting', value: 'formatting' },
		{ id: 'test', label: 'Testing', value: 'testing' },
		{ id: 'ci', label: 'CI/CD Pipeline', value: 'ci' },
	],
	defaultValue: ['lint', 'fmt'],
};

const markdownLinksQuestion: IChatQuestion = {
	id: 'review-results',
	type: 'text',
	title: 'Review results',
	message: new MarkdownString('**Review the [VS Code documentation](https://code.visualstudio.com/docs) before continuing.**'),
	detailedMessage: new MarkdownString([
		'### [Related resources](https://code.visualstudio.com/docs)',
		'',
		'Read the [extension guide](https://code.visualstudio.com/api/get-started/your-first-extension) for more information.',
		'',
		'- **[VS Code repository](https://github.com/microsoft/vscode)**',
		'- [Extension API](https://code.visualstudio.com/api)',
	].join('\n')),
};

const harnessSwitchQuestions: IChatQuestion[] = [{
	id: 'reason',
	type: 'singleSelect',
	title: 'Why did you switch harnesses?',
	options: [
		{ id: 'preferLocal', label: 'I prefer the Local experience', value: 'preferLocal' },
		{ id: 'missingFeature', label: 'A feature I need was unavailable', value: 'missingFeature' },
		{ id: 'performance', label: 'Copilot was too slow', value: 'performance' },
		{ id: 'reliability', label: 'Copilot did not work as expected', value: 'reliability' },
		{ id: 'other', label: 'Something else', value: 'other' },
	],
	allowFreeformInput: false,
	required: true,
}];

function createHarnessSwitchCarousel(): ChatQuestionCarouselData {
	return new ChatQuestionCarouselData(harnessSwitchQuestions, true, 'fixture.harnessSwitchSurvey');
}

const harnessSwitchCarouselOptions: Partial<IChatQuestionCarouselOptions> = {
	dismissLabel: 'Dismiss Survey',
	submissionAcknowledgement: {
		message: 'Thanks, your feedback has been recorded.',
		description: new MarkdownString('Have specific feedback? [Share it on GitHub](https://github.com/microsoft/vscode/issues).'),
		dismissLabel: 'Dismiss Feedback Acknowledgement',
		onDidDismiss: () => { },
	},
};

const deploymentDescription = [
	'Review the requirements before choosing a deployment strategy. The application serves several regions and must remain available during the rollout.',
	'This release updates the database, background workers, and public API. Old and new clients must continue working while the release is in progress.',
	'Monitor error rates, latency, and resource usage before increasing traffic. A rollback must preserve customer data and active requests.',
	'Choose the approach that gives the team the best balance of safety and delivery speed.',
].join('\n\n');

function createDeploymentCarousel(optionCount: number, description: string | undefined = deploymentDescription, describeFirstOption = false): ChatQuestionCarouselData {
	const labels = [
		describeFirstOption ? 'Canary rollout - Recommended' : 'Canary rollout',
		'Blue-green deployment',
		'Rolling update',
		'Manual approval',
		'Scheduled release',
		'Feature-flag rollout',
		'Regional rollout',
		'Shadow deployment',
		'Recreate deployment',
		'Staged rollout',
		'Gradual traffic shift',
		'Maintenance window',
	];
	return new ChatQuestionCarouselData([{
		id: 'strategy',
		type: 'singleSelect',
		title: 'How should we deploy this release?',
		description,
		options: labels.slice(0, optionCount).map((label, index) => ({ id: `strategy-${index}`, label, value: `strategy-${index}` })),
		allowFreeformInput: false,
	}, {
		id: 'reviewer',
		type: 'text',
		title: 'Who should review the release?',
	}], true);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	SingleTextQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([textQuestion])),
	}),

	SingleSelectQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([singleSelectQuestion])),
	}),

	MultiSelectQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([multiSelectQuestion])),
	}),

	MultipleQuestions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([
			textQuestion,
			singleSelectQuestion,
			multiSelectQuestion,
		])),
	}),

	EqualHeightOverflow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['Long question details and answers each occupy half the available content height, with the navigation footer below them.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(12), hasEqualScrollableSections),
	}),

	CarouselMessageOverflow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => {
			const carousel = createDeploymentCarousel(12, '');
			carousel.message = new MarkdownString(deploymentDescription);
			return renderLayoutCarousel(context, carousel, hasEqualScrollableSections);
		},
	}),

	AnswersFitWithin55Percent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['All four answers are visible without scrolling. They use slightly more than half of the content height, leaving the long details independently scrollable.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(4, deploymentDescription, true), (header, input, availableHeight) =>
			header.scrollHeight > header.clientHeight &&
			input.clientHeight > availableHeight / 2 && input.clientHeight <= availableHeight * 0.55 + 1 &&
			input.scrollHeight === input.clientHeight),
	}),

	AnswersExceed55Percent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['The added fifth answer would not fit within 55 percent, so both long sections share the content height equally and the answers scroll.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(5, deploymentDescription, true), (header, input, availableHeight) =>
			input.scrollHeight > availableHeight * 0.55 && hasEqualScrollableSections(header, input, availableHeight)),
	}),

	AnswersBorrowUnusedHeight: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['The short question header leaves most of the card available to the seven fully visible answers.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(7, ''), (header, input, availableHeight) =>
			header.clientHeight < availableHeight / 2 && header.scrollHeight === header.clientHeight &&
			input.clientHeight > availableHeight / 2 && input.scrollHeight === input.clientHeight),
	}),

	DetailsBorrowUnusedHeight: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['The two short answers leave more than half of the content height available to the question details.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(2), (header, input, availableHeight) =>
			header.clientHeight > availableHeight / 2 && input.clientHeight < availableHeight / 2 &&
			input.scrollHeight === input.clientHeight),
	}),

	CompactQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(2, ''), (header, input, availableHeight) =>
			header.scrollHeight === header.clientHeight && input.scrollHeight === input.clientHeight &&
			header.clientHeight + input.clientHeight < availableHeight),
	}),

	CollapsedQuestions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => {
			const carousel = createDeploymentCarousel(12);
			carousel.draftCollapsed = true;
			return renderLayoutCarousel(context, carousel, (header, input) => header.clientHeight > 0 && input.clientHeight === 0);
		},
	}),

	ValidationError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderLayoutCarousel(context, createCarousel([{
			id: 'owner',
			type: 'text',
			title: 'Who owns this release?',
			description: deploymentDescription,
			detailedMessage: new MarkdownString('Provide a release owner before continuing.'),
			required: true,
		}], false), (header, input) =>
			header.clientHeight > 0 && input.clientHeight > 0 &&
			context.container.querySelector<HTMLElement>('.chat-question-validation-message')!.offsetHeight > 0,
			part => {
				const submit = part.domNode.querySelector<HTMLElement>('.chat-question-submit-button');
				if (!submit) {
					throw new Error('Expected a Submit button');
				}
				submit.click();
			}),
	}),

	CompletedConversation: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			const carousel = createCarousel(Array.from({ length: 10 }, (_, index) => ({
				id: `review-${index}`,
				type: 'text',
				title: `Release checklist item ${index + 1}`,
			})));
			carousel.answerPresentation = 'conversation';
			carousel.isUsed = true;
			carousel.data = Object.fromEntries(carousel.questions.map(question => [question.id, 'Reviewed and approved']));
			renderCarousel(context, carousel);
		},
	}),

	ExpandedCompletedConversation: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: async context => {
			const carousel = createDeploymentCarousel(12, '');
			carousel.questions.splice(1);
			carousel.answerPresentation = 'conversation';
			carousel.isUsed = true;
			carousel.data = { strategy: { selectedValue: 'strategy-0' } };
			renderCarousel(context, carousel, false, {}, part => {
				const answer = part.domNode.querySelector<HTMLElement>('.chat-question-answer-collapsible .monaco-button');
				if (!answer) {
					throw new Error('Expected an expandable answer');
				}
				answer.click();
			});
			await waitForFixtureCondition(() => {
				const card = context.container.querySelector<HTMLElement>('.chat-question-carousel-container')!;
				const options = card.querySelectorAll('.chat-question-summary-option');
				return options.length === 12 && card.clientHeight > Math.min(420, dom.getWindow(card).innerHeight * 0.45);
			}, 'Completed answer options must expand beyond the interactive height limit');
		},
	}),

	HarnessSwitchSurveyReason: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderCarousel(context, createHarnessSwitchCarousel(), true, harnessSwitchCarouselOptions),
	}),

	HarnessSwitchSurveySubmitted: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderCarousel(context, createHarnessSwitchCarousel(), true, harnessSwitchCarouselOptions, part => {
			const option = part.domNode.querySelector<HTMLElement>('.chat-question-list-item');
			if (!option) {
				throw new Error('Expected the harness switch survey reason option.');
			}
			option.click();
		}),
	}),

	NoSkip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([singleSelectQuestion], false)),
	}),

	MarkdownLinks: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Links use theme-provided colors. In high-contrast themes, all links in the carousel message, bold question title, detailed heading, paragraph, and list are underlined. Normal themes retain their existing link styling.'],
		render: (context) => {
			const carousel = createCarousel([markdownLinksQuestion]);
			carousel.message = new MarkdownString('See **[question guidance](https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode)**.');
			renderCarousel(context, carousel);
		},
	}),

	SubmittedSummary: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => {
			const carousel = createCarousel([textQuestion, singleSelectQuestion, multiSelectQuestion]);
			carousel.isUsed = true;
			carousel.data = {
				'project-name': 'my-app',
				'language': { selectedValue: 'typescript', freeformValue: undefined },
				'features': { selectedValues: ['linting', 'formatting'], freeformValue: undefined },
			};
			renderCarousel(context, carousel);
		},
	}),

	SkippedSummary: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => {
			const carousel = createCarousel([textQuestion, singleSelectQuestion]);
			carousel.isUsed = true;
			carousel.data = {};
			renderCarousel(context, carousel);
		},
	}),
});
