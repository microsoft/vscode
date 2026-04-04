/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Color } from '../../../../../base/common/color.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { AgentFeedbackEditorWidget } from '../../browser/agentFeedbackEditorWidgetContribution.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ICodeReviewService, ICodeReviewSuggestion } from '../../../codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from '../../../../../workbench/test/browser/componentFixtures/sessions/mockCodeReviewService.js';
import { ISessionEditorComment, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';

const sessionResource = URI.parse('vscode-agent-session://fixture/session-1');
const fileResource = URI.parse('inmemory://model/agent-feedback-widget.ts');

const sampleCode = [
	'function alpha() {',
	'\tconst first = 1;',
	'\treturn first;',
	'}',
	'',
	'function beta() {',
	'\tconst second = 2;',
	'\tconst third = second + 1;',
	'\treturn third;',
	'}',
	'',
	'function gamma() {',
	'\tconst done = true;',
	'\treturn done;',
	'}',
].join('\n');

interface IFixtureOptions {
	readonly expanded?: boolean;
	readonly focusedCommentId?: string;
	readonly hidden?: boolean;
	readonly commentItems: readonly ISessionEditorComment[];
}

function createRange(startLineNumber: number, endLineNumber: number = startLineNumber): IRange {
	return {
		startLineNumber,
		startColumn: 1,
		endLineNumber,
		endColumn: 1,
	};
}

function createFeedbackComment(id: string, text: string, startLineNumber: number, endLineNumber: number = startLineNumber, suggestion?: ICodeReviewSuggestion): ISessionEditorComment {
	return {
		id: `agentFeedback:${id}`,
		sourceId: id,
		source: SessionEditorCommentSource.AgentFeedback,
		sessionResource,
		resourceUri: fileResource,
		range: createRange(startLineNumber, endLineNumber),
		text,
		suggestion,
		canConvertToAgentFeedback: false,
	};
}

function createReviewComment(id: string, text: string, startLineNumber: number, endLineNumber: number = startLineNumber, suggestion?: ICodeReviewSuggestion): ISessionEditorComment {
	const range: IRange = {
		startLineNumber,
		startColumn: 1,
		endLineNumber,
		endColumn: 1,
	};

	return {
		id: `codeReview:${id}`,
		sourceId: id,
		source: SessionEditorCommentSource.CodeReview,
		text,
		resourceUri: fileResource,
		range,
		sessionResource,
		suggestion,
		severity: 'warning',
		canConvertToAgentFeedback: true,
	};
}

function createPRReviewComment(id: string, text: string, startLineNumber: number, endLineNumber: number = startLineNumber): ISessionEditorComment {
	return {
		id: `prReview:${id}`,
		sourceId: id,
		source: SessionEditorCommentSource.PRReview,
		text,
		resourceUri: fileResource,
		range: createRange(startLineNumber, endLineNumber),
		sessionResource,
		canConvertToAgentFeedback: true,
	};
}

function createMockAgentFeedbackService(): IAgentFeedbackService {
	return new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeNavigation = Event.None;

		override addFeedback(): IAgentFeedback {
			throw new Error('Not implemented for fixture');
		}

		override removeFeedback(): void { }

		override getFeedback(): readonly IAgentFeedback[] {
			return [];
		}

		override getMostRecentSessionForResource(): URI | undefined {
			return undefined;
		}

		override async revealFeedback(): Promise<void> { }

		override getNextFeedback(): IAgentFeedback | undefined {
			return undefined;
		}

		override getNavigationBearing() {
			return { activeIdx: -1, totalCount: 0 };
		}

		override getNextNavigableItem() {
			return undefined;
		}

		override setNavigationAnchor(): void { }

		override clearFeedback(): void { }

		override async addFeedbackAndSubmit(): Promise<void> { }
	}();
}

function ensureTokenColorMap(): void {
	if (TokenizationRegistry.getColorMap()?.length) {
		return;
	}

	const colorMap = [
		Color.fromHex('#000000'),
		Color.fromHex('#d4d4d4'),
		Color.fromHex('#9cdcfe'),
		Color.fromHex('#ce9178'),
		Color.fromHex('#b5cea8'),
		Color.fromHex('#4fc1ff'),
		Color.fromHex('#c586c0'),
		Color.fromHex('#569cd6'),
		Color.fromHex('#dcdcaa'),
		Color.fromHex('#f44747'),
	];

	TokenizationRegistry.setColorMap(colorMap);
}

function renderWidget(context: ComponentFixtureContext, options: IFixtureOptions): void {
	const scopedDisposables = context.disposableStore.add(new DisposableStore());
	context.container.style.width = '760px';
	context.container.style.height = '420px';
	context.container.style.border = '1px solid var(--vscode-editorWidget-border)';
	context.container.style.background = 'var(--vscode-editor-background)';

	ensureTokenColorMap();

	const agentFeedbackService = createMockAgentFeedbackService();
	const codeReviewService = createMockCodeReviewService();
	const instantiationService = createEditorServices(scopedDisposables, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(ICodeReviewService, codeReviewService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
		},
	});
	const model = scopedDisposables.add(createTextModel(instantiationService, sampleCode, fileResource, 'typescript'));

	const editorOptions: ICodeEditorWidgetOptions = {
		contributions: [],
	};

	const editor = scopedDisposables.add(instantiationService.createInstance(
		CodeEditorWidget,
		context.container,
		{
			automaticLayout: true,
			lineNumbers: 'on',
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			fontSize: 13,
			lineHeight: 20,
		},
		editorOptions
	));

	editor.setModel(model);

	const widget = scopedDisposables.add(instantiationService.createInstance(
		AgentFeedbackEditorWidget,
		editor,
		options.commentItems,
		sessionResource,
	));

	widget.layout(options.commentItems[0].range.startLineNumber);

	if (options.expanded) {
		widget.expand();
	}

	if (options.focusedCommentId) {
		widget.focusFeedback(options.focusedCommentId);
	}

	if (options.hidden) {
		const domNode = widget.getDomNode();
		domNode.style.transition = 'none';
		domNode.style.animation = 'none';
		widget.toggle(false);
	}
}

const singleFeedback = [
	createFeedbackComment('f-1', 'Prefer a clearer variable name on this line.', 2),
];

const groupedFeedback = [
	createFeedbackComment('f-1', 'Prefer a clearer variable name on this line.', 2),
	createFeedbackComment('f-2', 'This return statement can be simplified.', 3),
	createFeedbackComment('f-3', 'Consider documenting why this branch is needed.', 6, 8),
];

const reviewOnly = [
	createReviewComment('r-1', 'Handle the null case before returning here.', 7),
	createReviewComment('r-2', 'This branch needs a stronger explanation.', 8),
];

const mixedComments = [
	createFeedbackComment('f-1', 'Prefer a clearer variable name on this line.', 2),
	createReviewComment('r-1', 'This should be extracted into a helper.', 3),
	createFeedbackComment('f-2', 'Consider renaming this for readability.', 4),
];

const reviewSuggestion: ICodeReviewSuggestion = {
	edits: [
		{ range: createRange(8), oldText: '\tconst third = second + 1;', newText: '\tconst third = second + computeOffset();' },
	],
};

const suggestionMix = [
	createReviewComment('r-3', 'Prefer using the helper so the intent is explicit.', 8, 8, reviewSuggestion),
	createFeedbackComment('f-3', 'Keep the helper name aligned with the domain concept.', 9),
];

const prReviewOnly = [
	createPRReviewComment('pr-1', 'This variable should be renamed to match our naming conventions.', 2),
	createPRReviewComment('pr-2', 'Please add error handling for the edge case when second is zero.', 7, 8),
];

const allSourcesMixed = [
	createFeedbackComment('f-1', 'Prefer a clearer variable name on this line.', 2),
	createPRReviewComment('pr-1', 'Our style guide says to use descriptive names here.', 3),
	createReviewComment('r-1', 'This should be extracted into a helper.', 6),
	createPRReviewComment('pr-2', 'This logic duplicates what we have in utils.ts — consider reusing.', 8, 9),
];

export default defineThemedFixtureGroup({ path: 'sessions/agentFeedback/' }, {
	CollapsedSingleComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: singleFeedback,
		}),
	}),

	ExpandedSingleComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: singleFeedback,
			expanded: true,
		}),
	}),

	CollapsedMultiComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: groupedFeedback,
		}),
	}),

	ExpandedMultiComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: groupedFeedback,
			expanded: true,
		}),
	}),

	ExpandedFocusedFeedback: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: groupedFeedback,
			expanded: true,
			focusedCommentId: 'agentFeedback:f-2',
		}),
	}),

	ExpandedReviewOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: reviewOnly,
			expanded: true,
		}),
	}),

	ExpandedMixedComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: mixedComments,
			expanded: true,
		}),
	}),

	ExpandedFocusedReviewComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: mixedComments,
			expanded: true,
			focusedCommentId: 'codeReview:r-1',
		}),
	}),

	ExpandedReviewSuggestion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: suggestionMix,
			expanded: true,
		}),
	}),

	ExpandedPRReviewOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: prReviewOnly,
			expanded: true,
		}),
	}),

	ExpandedAllSourcesMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: allSourcesMixed,
			expanded: true,
		}),
	}),

	ExpandedFocusedPRReview: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: allSourcesMixed,
			expanded: true,
			focusedCommentId: 'prReview:pr-2',
		}),
	}),

	HiddenWidget: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			commentItems: mixedComments,
			hidden: true,
		}),
	}),
});
