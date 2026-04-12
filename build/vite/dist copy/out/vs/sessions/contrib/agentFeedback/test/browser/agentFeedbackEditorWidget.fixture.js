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
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { AgentFeedbackEditorWidget } from '../../browser/agentFeedbackEditorWidgetContribution.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from '../../../../../workbench/test/browser/componentFixtures/sessions/mockCodeReviewService.js';
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
function createRange(startLineNumber, endLineNumber = startLineNumber) {
    return {
        startLineNumber,
        startColumn: 1,
        endLineNumber,
        endColumn: 1,
    };
}
function createFeedbackComment(id, text, startLineNumber, endLineNumber = startLineNumber, suggestion) {
    return {
        id: `agentFeedback:${id}`,
        sourceId: id,
        source: "agentFeedback" /* SessionEditorCommentSource.AgentFeedback */,
        sessionResource,
        resourceUri: fileResource,
        range: createRange(startLineNumber, endLineNumber),
        text,
        suggestion,
        canConvertToAgentFeedback: false,
    };
}
function createReviewComment(id, text, startLineNumber, endLineNumber = startLineNumber, suggestion) {
    const range = {
        startLineNumber,
        startColumn: 1,
        endLineNumber,
        endColumn: 1,
    };
    return {
        id: `codeReview:${id}`,
        sourceId: id,
        source: "codeReview" /* SessionEditorCommentSource.CodeReview */,
        text,
        resourceUri: fileResource,
        range,
        sessionResource,
        suggestion,
        severity: 'warning',
        canConvertToAgentFeedback: true,
    };
}
function createPRReviewComment(id, text, startLineNumber, endLineNumber = startLineNumber) {
    return {
        id: `prReview:${id}`,
        sourceId: id,
        source: "prReview" /* SessionEditorCommentSource.PRReview */,
        text,
        resourceUri: fileResource,
        range: createRange(startLineNumber, endLineNumber),
        sessionResource,
        canConvertToAgentFeedback: true,
    };
}
function createMockAgentFeedbackService() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeFeedback = Event.None;
            this.onDidChangeNavigation = Event.None;
        }
        addFeedback() {
            throw new Error('Not implemented for fixture');
        }
        removeFeedback() { }
        getFeedback() {
            return [];
        }
        getMostRecentSessionForResource() {
            return undefined;
        }
        async revealFeedback() { }
        getNextFeedback() {
            return undefined;
        }
        getNavigationBearing() {
            return { activeIdx: -1, totalCount: 0 };
        }
        getNextNavigableItem() {
            return undefined;
        }
        setNavigationAnchor() { }
        clearFeedback() { }
        async addFeedbackAndSubmit() { }
    }();
}
function ensureTokenColorMap() {
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
function renderWidget(context, options) {
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
    const editorOptions = {
        contributions: [],
    };
    const editor = scopedDisposables.add(instantiationService.createInstance(CodeEditorWidget, context.container, {
        automaticLayout: true,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 20,
    }, editorOptions));
    editor.setModel(model);
    const widget = scopedDisposables.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, options.commentItems, sessionResource));
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
const reviewSuggestion = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL3Rlc3QvYnJvd3Nlci9hZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDakksT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0scUVBQXFFLENBQUM7QUFFakksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDakYsT0FBTyxFQUFrQixxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDM00sT0FBTyxFQUFFLGtCQUFrQixFQUF5QixNQUFNLGtEQUFrRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJGQUEyRixDQUFDO0FBR3hJLE1BQU0sZUFBZSxHQUFHLEdBQUcs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