/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentFeedbackOverlayWidget } from '../../browser/agentFeedbackEditorOverlay.js';
import { clearAllFeedbackActionId, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from '../../browser/agentFeedbackEditorActions.js';
class FixtureMenuService {
    constructor(_hasAgentFeedbackActions) {
        this._hasAgentFeedbackActions = _hasAgentFeedbackActions;
    }
    createMenu(_id) {
        const navigateActions = [
            toAction({ id: navigationBearingFakeActionId, label: 'Navigation Status', run: () => { } }),
            toAction({ id: navigatePreviousFeedbackActionId, label: 'Previous', class: 'codicon codicon-arrow-up', run: () => { } }),
            toAction({ id: navigateNextFeedbackActionId, label: 'Next', class: 'codicon codicon-arrow-down', run: () => { } }),
        ];
        const submitActions = this._hasAgentFeedbackActions
            ? [
                toAction({ id: submitFeedbackActionId, label: 'Submit', class: 'codicon codicon-send', run: () => { } }),
                toAction({ id: clearAllFeedbackActionId, label: 'Clear', class: 'codicon codicon-clear-all', run: () => { } }),
            ]
            : [];
        return {
            onDidChange: Event.None,
            dispose: () => { },
            getActions: () => submitActions.length > 0
                ? [
                    ['navigate', navigateActions],
                    ['a_submit', submitActions],
                ]
                : [
                    ['navigate', navigateActions],
                ],
        };
    }
    getMenuActions(_id, _contextKeyService, _options) { return []; }
    getMenuContexts() { return new Set(); }
    resetHiddenStates() { }
}
function renderWidget(context, options) {
    const scopedDisposables = context.disposableStore.add(new DisposableStore());
    context.container.classList.add('monaco-workbench');
    context.container.style.width = '420px';
    context.container.style.height = '64px';
    context.container.style.padding = '12px';
    context.container.style.background = 'var(--vscode-editor-background)';
    const instantiationService = createEditorServices(scopedDisposables, {
        colorTheme: context.theme,
        additionalServices: reg => {
            reg.defineInstance(IMenuService, new FixtureMenuService(options.hasAgentFeedbackActions ?? true));
            registerWorkbenchServices(reg);
        },
    });
    const widget = scopedDisposables.add(instantiationService.createInstance(AgentFeedbackOverlayWidget));
    widget.show(options.navigationBearings);
    context.container.appendChild(widget.getDomNode());
}
export default defineThemedFixtureGroup({ path: 'sessions/agentFeedback/' }, {
    ZeroOfZero: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: -1, totalCount: 0 },
            hasAgentFeedbackActions: false,
        }),
    }),
    SingleFeedback: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: 0, totalCount: 1 },
        }),
    }),
    FirstOfThree: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: -1, totalCount: 3 },
        }),
    }),
    ReviewOnlyTwoComments: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: 0, totalCount: 2 },
            hasAgentFeedbackActions: false,
        }),
    }),
    MiddleOfThree: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: 1, totalCount: 3 },
        }),
    }),
    MixedFourComments: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: 2, totalCount: 4 },
            hasAgentFeedbackActions: true,
        }),
    }),
    LastOfThree: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderWidget(context, {
            navigationBearings: { activeIdx: 2, totalCount: 3 },
        }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvck92ZXJsYXlXaWRnZXQuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay90ZXN0L2Jyb3dzZXIvYWdlbnRGZWVkYmFja0VkaXRvck92ZXJsYXlXaWRnZXQuZml4dHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQTZCLFlBQVksRUFBNkMsTUFBTSxtREFBbUQsQ0FBQztBQUN2SixPQUFPLEVBQTJCLG9CQUFvQixFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDck4sT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDRCQUE0QixFQUFFLGdDQUFnQyxFQUFFLDZCQUE2QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFZOU0sTUFBTSxrQkFBa0I7SUFDdkIsWUFBNkIsd0JBQWlDO1FBQWpDLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBUztJQUM5RCxDQUFDO0lBSUQsVUFBVSxDQUFDLEdBQVc7UUFDckIsTUFBTSxlQUFlLEdBQUc7WUFDdkIsUUFBUSxDQUFDLEVBQUUsRUFBRSxFQUFFLDZCQUE2QixFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDM0YsUUFBUSxDQUFDLEVB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