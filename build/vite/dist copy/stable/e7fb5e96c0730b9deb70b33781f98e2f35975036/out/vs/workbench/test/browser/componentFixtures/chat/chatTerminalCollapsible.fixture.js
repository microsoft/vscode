/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ChatTerminalThinkingCollapsibleWrapper } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import '../../../../contrib/chat/browser/widget/media/chat.css';
function createMockContext() {
    return {
        element: new class extends mock() {
        }(),
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
        inlineTextModels: upcastPartial({}),
    };
}
function renderCollapsible(context, commandText, isSandboxWrapped, isComplete) {
    const { container, disposableStore } = context;
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: context.theme,
    });
    container.style.width = '500px';
    container.style.padding = '8px';
    container.classList.add('monaco-workbench');
    const session = dom.$('.interactive-session');
    container.appendChild(session);
    const contentElement = dom.$('.chat-terminal-output-placeholder');
    contentElement.textContent = '(terminal output would appear here)';
    contentElement.style.padding = '8px';
    contentElement.style.color = 'var(--vscode-descriptionForeground)';
    const wrapper = disposableStore.add(instantiationService.createInstance(ChatTerminalThinkingCollapsibleWrapper, commandText, isSandboxWrapped, contentElement, createMockContext(), false, isComplete));
    session.appendChild(wrapper.domNode);
}
export default defineThemedFixtureGroup({ path: 'chat/terminalCollapsible/' }, {
    'Ran - simple command': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'ls -lh', false, true),
    }),
    'Running - simple command': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'ls -lh', false, false),
    }),
    'Ran sandbox - simple command': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'ls -lh', true, true),
    }),
    'Running sandbox - simple command': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'ls -lh', true, false),
    }),
    'Ran - special chars': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'grep -rn "hello" ./src --include="*.ts"', false, true),
    }),
    'Ran sandbox - special chars': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'grep -rn "hello" ./src --include="*.ts"', true, true),
    }),
    'Ran - backticks': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'echo `date` && echo `hostname`', false, true),
    }),
    'Ran sandbox - backticks': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'echo `date` && echo `hostname`', true, true),
    }),
    'Ran sandbox - powershell backticks': defineComponentFixture({
        render: ctx => renderCollapsible(ctx, 'Get-Process | Where-Object {$_.Name -eq `"notepad`"}', true, true),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsQ29sbGFwc2libGUuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0VGVybWluYWxDb2xsYXBzaWJsZS5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRzlFLE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxNQUFNLDhHQUE4RyxDQUFDO0FBQ3RLLE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUVySSxPQUFPLHdEQUF3RCxDQUFDO0FBRWhFLFNBQVMsaUJBQWlCO0lBQ3pCLE9BQU87UUFDTixPQUFPLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUEwQjtTQUFJLEVBQUU7UUFDL0QsWUFBWSxFQUFFLENBQUM7UUFDZixTQUFTLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFDeEMsT0FBTyxFQUFFLEVBQUU7UUFDWCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxTQUFVO1FBQ3RCLG1CQUFtQixFQUFFLENBQUM7UUFDdEIsY0FBYyxFQUFFLENBQUM7UUFDakIsY0FBYyxFQUFFLFNBQVU7UUFDMUIsWUFBWSxFQUFFLGVBQWUsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDO1FBQ2xELHFCQUFxQixFQUFFLEtB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