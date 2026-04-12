/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ResourcePool } from './chatCollections.js';
let ChatCheckpointFileChangesSummaryContentPart = class ChatCheckpointFileChangesSummaryContentPart extends Disposable {
    constructor(content, context, hoverService, chatService, editorService, instantiationService) {
        super();
        this.content = content;
        this.hoverService = hoverService;
        this.chatService = chatService;
        this.editorService = editorService;
        this.instantiationService = instantiationService;
        this.ELEMENT_HEIGHT = 22;
        this.MAX_ITEMS_SHOWN = 6;
        this.diffsBetweenRequests = new Map();
        this.isCollapsed = true;
        this.fileChangesDiffsObservable = this.computeFileChangesDiffs(content);
        const headerDomNode = $('.checkpoint-file-changes-summary-header');
        this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
        this.domNode.tabIndex = 0;
        this._register(this.renderHeader(headerDomNode));
        this._register(this.renderFilesList(this.domNode));
    }
    computeFileChangesDiffs({ requestId, sessionResource }) {
        return this.chatService.chatModels
            .map(models => Iterable.find(models, m => isEqual(m.sessionResource, sessionResource)))
            .map(model => model?.editingSession?.getDiffsForFilesInRequest(requestId))
            .map((diffs, r) => diffs?.read(r) || Iterable.empty());
    }
    getCachedEntryDiffBetweenRequests(editSession, uri, startRequestId, stopRequestId) {
        const key = `${uri}\0${startRequestId}\0${stopRequestId}`;
        let observable = this.diffsBetweenRequests.get(key);
        if (!observable) {
            observable = editSession.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
            this.diffsBetweenRequests.set(key, observable);
        }
        return observable;
    }
    renderHeader(container) {
        const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
        const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
        this._register(autorun(r => {
            const diffs = this.fileChangesDiffsObservable.read(r);
            viewListButton.label = diffs.length === 1 ? `Changed 1 file` : `Changed ${diffs.length} files`;
        }));
        const setExpansionState = () => {
            viewListButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
            this.domNode.classList.toggle('chat-file-changes-collapsed', this.isCollapsed);
        };
        setExpansionState();
        const disposables = new DisposableStore();
        disposables.add(viewListButton);
        disposables.add(viewListButton.onDidClick(() => {
            this.isCollapsed = !this.isCollapsed;
            setExpansionState();
        }));
        disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
        return toDisposable(() => disposables.dispose());
    }
    renderViewAllFileChangesButton(container) {
        const button = container.appendChild($('.chat-view-changes-icon'));
        const hoverDisposable = this.hoverService.setupDelayedHover(button, () => ({
            content: localize2('chat.viewFileChangesSummary', 'View All File Changes')
        }));
        button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        return combinedDisposable(hoverDisposable, dom.addDisposableListener(button, 'click', (e) => {
            const resources = this.fileChangesDiffsObservable.get().map(diff => ({
                originalUri: diff.originalURI,
                modifiedUri: diff.modifiedURI
            }));
            const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
            const input = this.instantiationService.createInstance(MultiDiffEditorInput, source, 'Checkpoint File Changes', resources.map(resource => {
                return new MultiDiffEditorItem(resource.originalUri, resource.modifiedUri, undefined);
            }), false);
            this.editorService.openEditor(input);
            dom.EventHelper.stop(e, true);
        }));
    }
    renderFilesList(container) {
        const store = new DisposableStore();
        this.list = store.add(this.instantiationService.createInstance(CollapsibleChangesSummaryListPool)).get();
        const listNode = this.list.getHTMLElement();
        container.appendChild(listNode.parentElement);
        store.add(this.list.onDidOpen((item) => {
            const diff = item.element;
            if (!diff) {
                return;
            }
            const input = {
                original: { resource: diff.originalURI },
                modified: { resource: diff.modifiedURI },
                options: { preserveFocus: true }
            };
            this.editorService.openEditor(input);
        }));
        store.add(this.list.onContextMenu(e => {
            dom.EventHelper.stop(e.browserEvent, true);
        }));
        store.add(autorun((r) => {
            const diffs = this.fileChangesDiffsObservable.read(r);
            const itemsShown = Math.min(diffs.length, this.MAX_ITEMS_SHOWN);
            const height = itemsShown * this.ELEMENT_HEIGHT;
            this.list.layout(height);
            listNode.style.height = height + 'px';
            this.list.splice(0, this.list.length, diffs);
        }));
        return store;
    }
    hasSameContent(other, followingContent, element) {
        return other.kind === 'changesSummary' && other.requestId === this.content.requestId;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatCheckpointFileChangesSummaryContentPart = __decorate([
    __param(2, IHoverService),
    __param(3, IChatService),
    __param(4, IEditorService),
    __param(5, IInstantiationService)
], ChatCheckpointFileChangesSummaryContentPart);
export { ChatCheckpointFileChangesSummaryContentPart };
let CollapsibleChangesSummaryListPool = class CollapsibleChangesSummaryListPool extends Disposable {
    constructor(instantiationService, themeService) {
        super();
        this.instantiationService = instantiationService;
        this.themeService = themeService;
        this._resourcePool = this._register(new ResourcePool(() => this.listFactory()));
    }
    listFactory() {
        const container = $('.chat-summary-list');
        const store = new DisposableStore();
        store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
        const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
        const list = store.add(this.instantiationService.createInstance((WorkbenchList), 'ChatListRenderer', container, new CollapsibleChangesSummaryListDelegate(), [this.instantiationService.createInstance(CollapsibleChangesSummaryListRenderer, resourceLabels)], {
            alwaysConsumeMouseWheel: false
        }));
        return {
            list: list,
            dispose: () => {
                store.dispose();
            }
        };
    }
    get() {
        return this._resourcePool.get().list;
    }
};
CollapsibleChangesSummaryListPool = __decorate([
    __param(0, IInstantiationService),
    __param(1, IThemeService)
], CollapsibleChangesSummaryListPool);
class CollapsibleChangesSummaryListDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
        return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
    }
}
class CollapsibleChangesSummaryListRenderer {
    static { this.TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer'; }
    static { this.CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions'; }
    constructor(labels) {
        this.labels = labels;
        this.templateId = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
        return { label, dispose: () => label.dispose() };
    }
    renderElement(data, index, templateData) {
        const label = templateData.label;
        label.setFile(data.modifiedURI, {
            fileKind: FileKind.FILE,
            title: data.modifiedURI.path
        });
        const labelElement = label.element;
        templateData.changesElement?.remove();
        if (!data.identical && !data.isBusy) {
            const changesSummary = labelElement.appendChild($(`.${CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
            const added = changesSummary.appendChild($(`.insertions`));
            added.textContent = `+${data.added}`;
            const removed = changesSummary.appendChild($(`.deletions`));
            removed.textContent = `-${data.removed}`;
            templateData.changesElement = changesSummary;
        }
    }
    disposeTemplate(templateData) {
        templateData.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENoYW5nZXNTdW1tYXJ5UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxPQUFPLEVBQWUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxF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