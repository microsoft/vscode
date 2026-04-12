/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatQuestionCarouselPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css';
function createCarousel(questions, allowSkip = true) {
    return {
        questions,
        allowSkip,
        kind: 'questionCarousel',
    };
}
function createMockContext() {
    return {
        element: new class extends mock() {
        }(),
        inlineTextModels: upcastPartial({}),
        elementIndex: 0,
        container: document.createElement('div'),
        content: [],
        contentIndex: 0,
        editorPool: undefined,
        codeBlockStartIndex: 0,
        treeStartIndex: 0,
        diffEditorPool: undefined,
        currentWidth: observableValue('currentWidth', 400),
        onDidChangeVisibility: Event.None,
    };
}
function createOptions() {
    return {
        onSubmit: () => { },
        shouldAutoFocus: false,
    };
}
function renderCarousel(context, carousel) {
    const { container, disposableStore } = context;
    const instantiationService = createEditorServices(disposableStore, {
        additionalServices: (reg) => {
            reg.define(IMarkdownRendererService, MarkdownRendererService);
        },
    });
    const part = disposableStore.add(instantiationService.createInstance(ChatQuestionCarouselPart, carousel, createMockContext(), createOptions()));
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
const textQuestion = {
    id: 'project-name',
    type: 'text',
    title: 'Project name',
    message: 'What is the name of your project?',
    defaultValue: 'my-project',
};
const singleSelectQuestion = {
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
const multiSelectQuestion = {
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
    NoSkip: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderCarousel(context, createCarousel([singleSelectQuestion], false)),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXN0aW9uQ2Fyb3VzZWwuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0UXVlc3Rpb25DYXJvdXNlbC5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFakksT0FBTyxFQUFFLHdCQUF3QixFQUFnQyxNQUFNLHNGQUFzRixDQUFDO0FBRTlKLE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNySSxPQUFPLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFM0UsT0FBTyx5RkFBeUYsQ0FBQztBQUVqRyxTQUFTLGNBQWMsQ0FBQyxTQUEwQixFQUFFLFlBQXFCLElBQUk7SUFDNUUsT0FBTztRQUNOLFNBQVM7UUFDVCxTQUFTO1FBQ1QsSUFBSSxFQUFFLGtCQUFrQjtLQUN4QixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsaUJBQWlCO0lBQ3pCLE9BQU87UUFDTixPQUFPLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUF5QjtTQUFJLEVBQUU7UUFDOUQsZ0JBQWdCLEVBQUUsYUFBYSxDQUE0QixFQUFFLENBQUM7UUFDOUQsWUFBWSxFQUFFLENBQUM7UUFDZixTQUFTLEVBQUUsUUFBUSxDQUFDLGFBQWEs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