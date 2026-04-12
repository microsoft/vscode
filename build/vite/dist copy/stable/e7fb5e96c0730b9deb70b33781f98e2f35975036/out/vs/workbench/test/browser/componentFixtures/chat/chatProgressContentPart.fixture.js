/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatProgressContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatProgressContentPart.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import '../../../../contrib/chat/browser/widget/media/chat.css';
function createMockContext(opts) {
    const element = new class extends mock() {
        constructor() {
            super(...arguments);
            this.isComplete = opts?.isComplete ?? false;
        }
    }();
    return {
        element,
        inlineTextModels: upcastPartial({}),
        elementIndex: 0,
        container: document.createElement('div'),
        content: opts?.hasFollowingContent ? [{ kind: 'progressMessage', content: new MarkdownString('test') }] : [],
        contentIndex: 0,
        editorPool: undefined,
        codeBlockStartIndex: 0,
        treeStartIndex: 0,
        diffEditorPool: undefined,
        currentWidth: observableValue('currentWidth', 400),
        onDidChangeVisibility: Event.None,
    };
}
function createProgressMessage(text) {
    return {
        kind: 'progressMessage',
        content: new MarkdownString(text),
    };
}
function renderProgressPart(context, message, renderContext, opts) {
    const { container, disposableStore } = context;
    const mockAnchorService = new class extends mock() {
        register() { return { dispose() { } }; }
    }();
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: context.theme,
        additionalServices: (reg) => {
            reg.define(IMarkdownRendererService, MarkdownRendererService);
            reg.defineInstance(IChatMarkdownAnchorService, mockAnchorService);
        },
    });
    const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
    const part = disposableStore.add(instantiationService.createInstance(ChatProgressContentPart, message, markdownRenderer, renderContext, opts?.forceShowSpinner, opts?.forceShowMessage, opts?.icon, undefined, // toolInvocation
    opts?.shimmer));
    // .interactive-session provides CSS custom properties (--vscode-chat-font-size-body-s, etc.)
    // .interactive-item-container .progress-container is the selector for layout styles
    container.style.width = '400px';
    container.style.padding = '8px';
    container.classList.add('interactive-session');
    const itemContainer = dom.$('.interactive-item-container');
    itemContainer.appendChild(part.domNode);
    container.appendChild(itemContainer);
}
export default defineThemedFixtureGroup({ path: 'chat/' }, {
    WithSpinner: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (ctx) => renderProgressPart(ctx, createProgressMessage('Searching workspace for relevant files...'), createMockContext({ isComplete: false }), { forceShowSpinner: true, forceShowMessage: true, shimmer: false }),
    }),
    Completed: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (ctx) => renderProgressPart(ctx, createProgressMessage('Found 12 relevant files'), createMockContext({ isComplete: true }), { forceShowSpinner: false, forceShowMessage: true }),
    }),
    WithCustomIcon: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (ctx) => renderProgressPart(ctx, createProgressMessage('Running tests...'), createMockContext({ isComplete: false }), { forceShowSpinner: true, forceShowMessage: true, icon: Codicon.beaker }),
    }),
    WithInlineCode: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (ctx) => renderProgressPart(ctx, createProgressMessage('Reading `src/vs/workbench/contrib/chat/browser/chatWidget.ts`'), createMockContext({ isComplete: false }), { forceShowSpinner: true, forceShowMessage: true, shimmer: false }),
    }),
    LongMessage: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (ctx) => renderProgressPart(ctx, createProgressMessage('Searching across multiple workspace folders for TypeScript files matching the pattern you described, including test files and configuration'), createMockContext({ isComplete: false }), { forceShowSpinner: true, forceShowMessage: true, shimmer: false }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFByb2dyZXNzQ29udGVudFBhcnQuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDakksT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDOUgsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFckgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUZBQXVGLENBQUM7QUFHbkksT0FBTyxFQUEyQixvQkFBb0IsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXJJLE9BQU8sd0RBQXdELENBQUM7QUFFaEUsU0FBUyxpQkFBaUIsQ0FBQyxJQUE4RDtJQUN4RixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQTBCO1FBQTVDOztZQUNELGVBQVUsR0FBRyxJQUFJLEVB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