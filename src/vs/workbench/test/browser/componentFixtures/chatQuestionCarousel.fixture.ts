/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselPart, IChatQuestionCarouselOptions } from '../../../contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatContentPartRenderContext } from '../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IChatRequestViewModel } from '../../../contrib/chat/common/model/chatViewModel.js';
import '../../../contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css';

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
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		codeBlockModelCollection: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};
}

function createOptions(): IChatQuestionCarouselOptions {
	return {
		onSubmit: () => { },
		shouldAutoFocus: false,
	};
}

function renderCarousel(context: ComponentFixtureContext, carousel: IChatQuestionCarousel): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		additionalServices: (reg) => {
			reg.define(IMarkdownRendererService, MarkdownRendererService);
		},
	});

	const part = disposableStore.add(
		instantiationService.createInstance(
			ChatQuestionCarouselPart,
			carousel,
			createMockContext(),
			createOptions(),
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

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({
	SingleTextQuestion: defineComponentFixture({
		render: (context) => renderCarousel(context, createCarousel([textQuestion])),
	}),

	SingleSelectQuestion: defineComponentFixture({
		render: (context) => renderCarousel(context, createCarousel([singleSelectQuestion])),
	}),

	MultiSelectQuestion: defineComponentFixture({
		render: (context) => renderCarousel(context, createCarousel([multiSelectQuestion])),
	}),

	MultipleQuestions: defineComponentFixture({
		render: (context) => renderCarousel(context, createCarousel([
			textQuestion,
			singleSelectQuestion,
			multiSelectQuestion,
		])),
	}),

	NoSkip: defineComponentFixture({
		render: (context) => renderCarousel(context, createCarousel([singleSelectQuestion], false)),
	}),

	SubmittedSummary: defineComponentFixture({
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
		render: (context) => {
			const carousel = createCarousel([textQuestion, singleSelectQuestion]);
			carousel.isUsed = true;
			carousel.data = {};
			renderCarousel(context, carousel);
		},
	}),
});
