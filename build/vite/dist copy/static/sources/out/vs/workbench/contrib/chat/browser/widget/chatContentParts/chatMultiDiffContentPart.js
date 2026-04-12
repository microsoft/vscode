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
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, isObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
const $ = dom.$;
const ELEMENT_HEIGHT = 22;
const MAX_ITEMS_SHOWN = 6;
let ChatMultiDiffContentPart = class ChatMultiDiffContentPart extends Disposable {
    constructor(content, _element, instantiationService, editorService, themeService, contextKeyService) {
        super();
        this.content = content;
        this._element = _element;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.themeService = themeService;
        this.contextKeyService = contextKeyService;
        this.isCollapsed = false;
        this.readOnly = content.readOnly ?? false;
        this.diffData = isObservable(this.content.multiDiffData)
            ? this.content.multiDiffData.map(d => d)
            : constObservable(this.content.multiDiffData);
        const headerDomNode = $('.checkpoint-file-changes-summary-header');
        this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
        this.domNode.tabIndex = 0;
        this.isCollapsed = content?.collapsed ?? false;
        this._register(this.renderHeader(headerDomNode));
        this._register(this.renderFilesList(this.domNode));
    }
    renderHeader(container) {
        const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
        const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
        this._register(autorun(reader => {
            const fileCount = this.diffData.read(reader).resources.length;
            viewListButton.label = fileCount === 1
                ? localize('chatMultiDiff.oneFile', 'Changed 1 file')
                : localize('chatMultiDiff.manyFiles', 'Changed {0} files', fileCount);
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
        if (!this.readOnly) {
            disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
        }
        disposables.add(this.renderContributedButtons(viewListButton.element));
        return toDisposable(() => disposables.dispose());
    }
    renderViewAllFileChangesButton(container) {
        const button = container.appendChild($('.chat-view-changes-icon'));
        button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
        button.title = localize('chatMultiDiff.openAllChanges', 'Open Changes');
        return dom.addDisposableListener(button, 'click', (e) => {
            const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
            const { title, resources } = this.diffData.get();
            const input = this.instantiationService.createInstance(MultiDiffEditorInput, source, title || 'Multi-Diff', resources.map(resource => new MultiDiffEditorItem(resource.originalUri, resource.modifiedUri, resource.goToFileUri)), false);
            const sideBySide = e.altKey;
            this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
            dom.EventHelper.stop(e, true);
        });
    }
    renderContributedButtons(container) {
        const buttonsContainer = container.appendChild($('.chat-multidiff-contributed-buttons'));
        const disposables = new DisposableStore();
        const type = getChatSessionType(this._element.sessionResource);
        const overlay = this.contextKeyService.createOverlay([
            [ChatContextKeys.agentSessionType.key, type]
        ]);
        const nestedInsta = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
        const marshalledUri = {
            ...this._element.sessionResource,
            $mid: 1 /* MarshalledId.Uri */
        };
        disposables.add(nestedInsta.createInstance(MenuWorkbenchToolBar, buttonsContainer, MenuId.ChatMultiDiffContext, {
            menuOptions: {
                arg: marshalledUri,
                shouldForwardArgs: true,
            },
            toolbarOptions: {
                primaryGroup: () => true,
            },
        }));
        return disposables;
    }
    renderFilesList(container) {
        const store = new DisposableStore();
        const listContainer = container.appendChild($('.chat-summary-list'));
        store.add(createFileIconThemableTreeContainerScope(listContainer, this.themeService));
        const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: Event.None }));
        this.list = store.add(this.instantiationService.createInstance((WorkbenchList), 'ChatMultiDiffList', listContainer, new ChatMultiDiffListDelegate(), [this.instantiationService.createInstance(ChatMultiDiffListRenderer, resourceLabels)], {
            identityProvider: {
                getId: (element) => element.uri.toString()
            },
            setRowLineHeight: true,
            horizontalScrolling: false,
            supportDynamicHeights: false,
            mouseSupport: !this.readOnly,
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: {
                getAriaLabel: (element) => element.uri.path,
                getWidgetAriaLabel: () => localize('chatMultiDiffList', "File Changes")
            }
        }));
        this._register(autorun(reader => {
            const { resources } = this.diffData.read(reader);
            const items = [];
            for (const resource of resources) {
                const uri = resource.modifiedUri || resource.originalUri || resource.goToFileUri;
                if (!uri) {
                    continue;
                }
                const item = { uri };
                if (resource.originalUri && resource.modifiedUri) {
                    item.diff = {
                        originalURI: resource.originalUri,
                        modifiedURI: resource.modifiedUri,
                        isFinal: true,
                        quitEarly: false,
                        identical: false,
                        added: resource.added || 0,
                        removed: resource.removed || 0,
                        isBusy: false,
                    };
                }
                items.push(item);
            }
            this.list.splice(0, this.list.length, items);
            const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
            this.list.layout(height);
            listContainer.style.height = `${height}px`;
        }));
        if (!this.readOnly) {
            store.add(this.list.onDidOpen((e) => {
                if (!e.element) {
                    return;
                }
                if (e.element.diff) {
                    this.editorService.openEditor({
                        original: { resource: e.element.diff.originalURI },
                        modified: { resource: e.element.diff.modifiedURI },
                        options: { preserveFocus: true }
                    });
                }
                else {
                    this.editorService.openEditor({
                        resource: e.element.uri,
                        options: { preserveFocus: true }
                    });
                }
            }));
        }
        return store;
    }
    hasSameContent(other) {
        return other.kind === 'multiDiffData' && this.diffData.get().resources.length === (isObservable(other.multiDiffData) ? other.multiDiffData.get().resources.length : other.multiDiffData.resources.length);
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatMultiDiffContentPart = __decorate([
    __param(2, IInstantiationService),
    __param(3, IEditorService),
    __param(4, IThemeService),
    __param(5, IContextKeyService)
], ChatMultiDiffContentPart);
export { ChatMultiDiffContentPart };
class ChatMultiDiffListDelegate {
    getHeight() {
        return 22;
    }
    getTemplateId() {
        return 'chatMultiDiffItem';
    }
}
class ChatMultiDiffListRenderer {
    static { this.TEMPLATE_ID = 'chatMultiDiffItem'; }
    static { this.CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions'; }
    constructor(labels) {
        this.labels = labels;
        this.templateId = ChatMultiDiffListRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
        return {
            label,
            dispose: () => label.dispose()
        };
    }
    renderElement(element, _index, templateData) {
        templateData.label.setFile(element.uri, {
            fileKind: FileKind.FILE,
            title: element.uri.path
        });
        const labelElement = templateData.label.element;
        templateData.changesElement?.remove();
        if (element.diff?.added || element.diff?.removed) {
            const changesSummary = labelElement.appendChild($(`.${ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
            const addedElement = changesSummary.appendChild($('.insertions'));
            addedElement.textContent = `+${element.diff.added}`;
            const removedElement = changesSummary.appendChild($('.deletions'));
            removedElement.textContent = `-${element.diff.removed}`;
            changesSummary.setAttribute('aria-label', localize('chatEditingSession.fileCounts', '{0} lines added, {1} lines removed', element.diff.added, element.diff.removed));
            templateData.changesElement = changesSummary;
        }
    }
    disposeTemplate(templateData) {
        templateData.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE11bHRpRGlmZkNvbnRlbnRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNdWx0aURpZmZDb250ZW50UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXBILE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2xILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcs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