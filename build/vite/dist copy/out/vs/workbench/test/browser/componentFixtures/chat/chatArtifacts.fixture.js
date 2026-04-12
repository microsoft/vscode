/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ChatArtifactsWidget } from '../../../../contrib/chat/browser/widget/chatArtifactsWidget.js';
import { IChatImageCarouselService } from '../../../../contrib/chat/browser/chatImageCarouselService.js';
import { IChatArtifactsService } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import '../../../../contrib/chat/browser/widget/media/chat.css';
function createMockArtifacts(artifacts) {
    const obs = observableValue('artifacts', artifacts);
    const mutable = observableValue('mutable', true);
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.artifacts = obs;
            this.mutable = mutable;
        }
        set(a) { obs.set(a, undefined); }
        clear() { obs.set([], undefined); }
        migrate() { }
    }();
}
function createMockArtifactsService(artifacts) {
    const instance = createMockArtifacts(artifacts);
    return new class extends mock() {
        getArtifacts() { return instance; }
    }();
}
function renderArtifactsWidget(context, artifacts) {
    const { container, disposableStore } = context;
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: context.theme,
        additionalServices: (reg) => {
            reg.define(IListService, ListService);
            reg.defineInstance(IContextViewService, new class extends mock() {
            }());
            reg.defineInstance(IChatArtifactsService, createMockArtifactsService(artifacts));
            reg.defineInstance(IChatImageCarouselService, new class extends mock() {
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                    this.onDidRunOperation = Event.None;
                }
            }());
            reg.defineInstance(IFileDialogService, new class extends mock() {
            }());
        },
    });
    const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
    widget.render(URI.parse('chat-session:test-session'));
    container.style.width = '400px';
    container.style.padding = '8px';
    container.appendChild(widget.domNode);
}
function renderInChatInputPart(context, artifacts) {
    const { container, disposableStore } = context;
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: context.theme,
        additionalServices: (reg) => {
            reg.define(IListService, ListService);
            reg.defineInstance(IContextViewService, new class extends mock() {
            }());
            reg.defineInstance(IChatArtifactsService, createMockArtifactsService(artifacts));
            reg.defineInstance(IChatImageCarouselService, new class extends mock() {
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                    this.onDidRunOperation = Event.None;
                }
            }());
            reg.defineInstance(IFileDialogService, new class extends mock() {
            }());
        },
    });
    container.style.width = '500px';
    container.classList.add('monaco-workbench');
    const session = dom.$('.interactive-session');
    container.appendChild(session);
    const inputPart = dom.h('.interactive-input-part', [
        dom.h('.chat-artifacts-widget-container@artifactsContainer'),
        dom.h('.interactive-input-and-side-toolbar', [
            dom.h('.chat-input-container', [
                dom.h('.chat-editor-container@editorContainer'),
            ]),
        ]),
    ]);
    session.appendChild(inputPart.root);
    inputPart.editorContainer.style.height = '44px';
    const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
    widget.render(URI.parse('chat-session:test-session'));
    inputPart.artifactsContainer.appendChild(widget.domNode);
}
function renderArtifactsWidgetExpanded(context, artifacts) {
    renderArtifactsWidget(context, artifacts);
    // Click the header button to expand the widget
    const expandButton = context.container.querySelector('.chat-artifacts-expand .monaco-button');
    expandButton?.click();
}
// ============================================================================
// Sample artifacts
// ============================================================================
const singleArtifact = [
    { label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
];
const multipleArtifacts = [
    { label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
    { label: 'Screenshot of login page', uri: 'file:///tmp/screenshot.png', type: 'screenshot' },
    { label: 'Implementation Plan', uri: 'file:///tmp/plan.md', type: 'plan' },
];
const manyArtifacts = [
    { label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
    { label: 'Screenshot 1', uri: 'file:///tmp/s1.png', type: 'screenshot' },
    { label: 'Screenshot 2', uri: 'file:///tmp/s2.png', type: 'screenshot' },
    { label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' },
    { label: 'API Docs', uri: 'http://localhost:3000/docs', type: undefined },
];
// ============================================================================
// Fixtures
// ============================================================================
export default defineThemedFixtureGroup({ path: 'chat/artifacts/' }, {
    SingleArtifact: defineComponentFixture({
        render: context => renderArtifactsWidget(context, singleArtifact),
    }),
    MultipleArtifacts: defineComponentFixture({
        render: context => renderArtifactsWidget(context, multipleArtifacts),
    }),
    ManyArtifacts: defineComponentFixture({
        render: context => renderArtifactsWidget(context, manyArtifacts),
    }),
    InChatInputSingle: defineComponentFixture({
        render: context => renderInChatInputPart(context, singleArtifact),
    }),
    InChatInputMultiple: defineComponentFixture({
        render: context => renderInChatInputPart(context, multipleArtifacts),
    }),
    MultipleArtifactsExpanded: defineComponentFixture({
        render: context => renderArtifactsWidgetExpanded(context, multipleArtifacts),
    }),
    ManyArtifactsExpanded: defineComponentFixture({
        render: context => renderArtifactsWidgetExpanded(context, manyArtifacts),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFydGlmYWN0cy5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9jaGF0L2NoYXRBcnRpZmFjdHMuZml4dHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNyRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN6RyxPQUFPLEVBQWlDLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDckksT0FBTyxFQUEyQixvQkFBb0IsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXJJLE9BQU8sd0RBQXdELENBQUM7QUFFaEUsU0FBUyxtQkFBbUIsQ0FBQyxTQUEwQjtJQUN0RCxNQUFNLEdBQUcsR0FB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