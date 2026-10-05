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
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
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
