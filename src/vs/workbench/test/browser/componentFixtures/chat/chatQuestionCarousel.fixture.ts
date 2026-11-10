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
import '../../../../contrib/sessions/browser/parts/media/sessionsGridContent.css';
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

function renderCarousel(context: ComponentFixtureContext, carousel: IChatQuestionCarousel, standalone: boolean = false, options: Partial<IChatQuestionCarouselOptions> = {}, afterRender?: (part: ChatQuestionCarouselPart) => void, host: HTMLElement = context.container): void {
	const { disposableStore } = context;

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

	host.style.width = '400px';
	host.style.padding = '8px';
	host.classList.add('interactive-session');

	// The CSS uses `.interactive-session .interactive-input-part > .chat-question-carousel-widget-container`
	// for most layout rules, so we need those wrapper elements.
	const inputPart = dom.$('.interactive-input-part');
	const widgetContainer = dom.$('.chat-question-carousel-widget-container');
	inputPart.appendChild(widgetContainer);
	host.appendChild(inputPart);

	widgetContainer.appendChild(part.domNode);
	afterRender?.(part);
}

function renderAgentSessionsCarousel(context: ComponentFixtureContext, carousel: IChatQuestionCarousel): void {
	context.container.classList.add('monaco-workbench');
	const sessionsSurface = dom.append(context.container, dom.$('.sessions-chat-surface'));
	const content = dom.append(sessionsSurface, dom.$('.content'));
	renderCarousel(context, carousel, false, {}, undefined, content);
}

interface ICarouselLayout {
	readonly card: HTMLElement;
	readonly title: HTMLElement;
	readonly body: HTMLElement;
	readonly content: HTMLElement;
	readonly answers: HTMLElement;
	readonly maxHeight: number;
}

async function renderLayoutCarousel(
	context: ComponentFixtureContext,
	carousel: IChatQuestionCarousel,
	expectedLayout: (layout: ICarouselLayout) => boolean,
	afterRender?: (part: ChatQuestionCarouselPart) => void,
): Promise<void> {
	renderCarousel(context, carousel, false, {}, afterRender);
	const card = context.container.querySelector<HTMLElement>('.chat-question-carousel-container')!;
	const title = card.querySelector<HTMLElement>('.chat-question-title-row')!;
	const body = card.querySelector<HTMLElement>('.chat-question-body-scrollable')!;
	const content = body.querySelector<HTMLElement>('.chat-question-input-container')!;
	const answers = content.querySelector<HTMLElement>('.chat-question-answers')!;
	const footer = card.querySelector<HTMLElement>('.chat-question-footer-row')!;
	const validation = card.querySelector<HTMLElement>('.chat-question-validation-message')!;
	let previousLayout = '';
	await waitForFixtureCondition(() => {
		const layoutState = {
			card, title, body, content, answers,
			maxHeight: Math.min(420, dom.getWindow(card).innerHeight * 0.45),
		};
		const layout = [card.clientHeight, title.clientHeight, body.clientHeight, content.clientHeight, content.scrollHeight, content.scrollTop, footer.offsetHeight, validation.offsetHeight].join(',');
		const stable = layout === previousLayout;
		previousLayout = layout;
		const bodyLaidOut = body.clientHeight > 0 || card.classList.contains('chat-question-carousel-collapsed');
		return stable && bodyLaidOut &&
			footer.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom &&
			expectedLayout(layoutState);
	}, 'Question carousel did not reach the expected height allocation');
}

function hasOverflowingBody({ card, content, maxHeight }: ICarouselLayout): boolean {
	return card.offsetHeight >= maxHeight - 1 && content.scrollHeight > content.clientHeight;
}

function hasFullyVisibleBody({ content }: ICarouselLayout): boolean {
	return content.scrollHeight === content.clientHeight;
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

// Boolean schema fields from MCP elicitation and the agent host are emitted as a required true/false single select.
const booleanOptions: IChatQuestion['options'] = [
	{ id: 'true', label: 'True', value: 'true' },
	{ id: 'false', label: 'False', value: 'false' },
];

const deleteBranchesQuestion: IChatQuestion = {
	id: 'delete-branches',
	type: 'singleSelect',
	title: 'Delete these 14 branches?',
	options: booleanOptions,
	allowFreeformInput: false,
	required: true,
};

const experimentGateQuestion: IChatQuestion = {
	id: 'experiment-gate',
	type: 'singleSelect',
	title: 'Gate the new layout behind an experiment?',
	description: 'Users in the control group keep the current layout until the experiment concludes.',
	options: booleanOptions,
	allowFreeformInput: false,
	required: true,
};

const rolloutQuestion: IChatQuestion = {
	id: 'rollout',
	type: 'singleSelect',
	title: 'Rollout strategy',
	options: [
		{ id: 'canary', label: 'Canary rollout', value: 'canary' },
		{ id: 'staged', label: 'Staged rollout', value: 'staged' },
		{ id: 'all', label: 'Everyone at once', value: 'all' },
	],
	allowFreeformInput: false,
};

const telemetryQuestion: IChatQuestion = {
	id: 'telemetry',
	type: 'multiSelect',
	title: 'Telemetry to collect',
	options: [
		{ id: 'exposure', label: 'Exposure events', value: 'exposure' },
		{ id: 'interaction', label: 'Interaction events', value: 'interaction' },
		{ id: 'performance', label: 'Performance timings', value: 'performance' },
	],
	allowFreeformInput: false,
};

const longContextMessage = [
	'I found several merged feature branches and a few stale ones that have not been touched in months. Before I continue, I want to make sure the cleanup is safe for the whole team.',
	'The change touches the release pipeline, the nightly build configuration, and the shared tooling scripts. Each of these is consumed by other repositories, so a mistake here could block unrelated work until it is reverted.',
	'Here is what the proposed change would do:',
	[
		'- Rename `build/lib/release.ts` to `build/lib/publish.ts` and update every import of `releaseVersion()`',
		'- Replace the `--legacy-publish` flag in `scripts/nightly.sh` with the new `--channel` option',
		'- Remove the deprecated `product.json#quality` fallback used by `getProductQuality()`',
		'- Regenerate the lockfile so `pnpm-lock.yaml` matches the updated workspace manifests',
	].join('\n'),
	'None of these steps can be undone automatically once the changes are pushed. If you are unsure, I can open a draft pull request first so the team can review it before anything is merged.',
].join('\n\n');

const longContextQuestion: IChatQuestion = {
	id: 'proceed',
	type: 'singleSelect',
	title: 'Proceed?',
	options: [
		{ id: 'apply', label: 'Apply the changes directly to the main branch and push them right away', value: 'apply' },
		{ id: 'draft', label: 'Open a draft pull request so the whole team can review the changes first', value: 'draft' },
		{ id: 'split', label: 'Split the work into smaller pull requests, one for each affected area', value: 'split' },
		{ id: 'cancel', label: 'Do not make any changes and keep the repository exactly as it is today', value: 'cancel' },
	],
	allowFreeformInput: true,
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

function createDeploymentCarousel(optionCount: number, description: string | undefined = deploymentDescription): ChatQuestionCarouselData {
	const labels = [
		'Canary rollout',
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

	AgentSessionsSingleSelectQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkModern', 'light2026', 'darkPlus', 'lightPlus', 'visualStudioDark', 'visualStudioLight', 'darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The custom answer editor is a single, uniform input surface without an inset panel-colored editor area or gutters.'],
		virtualTime: { enabled: false },
		render: context => renderAgentSessionsCarousel(context, createCarousel([singleSelectQuestion])),
	}),

	MultiSelectQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([multiSelectQuestion])),
	}),

	BooleanQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => {
			const carousel = createCarousel([deleteBranchesQuestion]);
			carousel.message = new MarkdownString([
				'These branches have already been merged into `main`:',
				'',
				'- `connor/fix-terminal-links`',
				'- `connor/chat-carousel-fixtures`',
				'- `alex/update-codicons`',
			].join('\n'));
			renderCarousel(context, carousel);
		},
	}),

	MultiStepWithBoolean: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([
			experimentGateQuestion,
			rolloutQuestion,
			telemetryQuestion,
		])),
	}),

	LongContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			const carousel = createCarousel([longContextQuestion]);
			carousel.message = new MarkdownString(longContextMessage);
			renderCarousel(context, carousel);
		},
	}),

	MultipleQuestions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderCarousel(context, createCarousel([
			textQuestion,
			singleSelectQuestion,
			multiSelectQuestion,
		])),
	}),

	LongBodyOverflow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['The pinned title is followed by a single scrolling body containing the long question details and all answers, with the navigation footer below it.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(12), hasOverflowingBody),
	}),

	CarouselMessageOverflow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => {
			const carousel = createDeploymentCarousel(12, '');
			carousel.message = new MarkdownString(deploymentDescription);
			return renderLayoutCarousel(context, carousel, hasOverflowingBody);
		},
	}),

	AnswersBorrowUnusedHeight: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['With no question details, the card is available to the seven fully visible answers without scrolling.'],
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(7, ''), layout =>
			hasFullyVisibleBody(layout) && layout.answers.offsetHeight > layout.maxHeight / 2),
	}),

	CompactQuestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderLayoutCarousel(context, createDeploymentCarousel(2, ''), layout =>
			hasFullyVisibleBody(layout) && layout.card.offsetHeight < layout.maxHeight),
	}),

	CollapsedQuestions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => {
			const carousel = createDeploymentCarousel(12);
			carousel.draftCollapsed = true;
			return renderLayoutCarousel(context, carousel, ({ title, content }) => title.clientHeight > 0 && content.clientHeight === 0);
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
		}], false), ({ title, content }) =>
			title.clientHeight > 0 && content.clientHeight > 0 &&
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
