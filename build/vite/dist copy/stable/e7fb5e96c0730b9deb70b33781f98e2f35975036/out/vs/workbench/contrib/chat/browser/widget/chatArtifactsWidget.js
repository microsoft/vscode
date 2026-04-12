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
var ChatArtifactsWidget_1;
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatArtifactsService } from '../../common/tools/chatArtifactsService.js';
import { IChatImageCarouselService } from '../chatImageCarouselService.js';
import { getEditorOverrideForChatResource } from './chatContentParts/chatInlineAnchorWidget.js';
const ARTIFACT_TYPE_ICONS = {
    devServer: Codicon.globe,
    screenshot: Codicon.file,
    plan: Codicon.book,
};
function isGroupNode(element) {
    return 'kind' in element && element.kind === 'group';
}
let ChatArtifactsWidget = class ChatArtifactsWidget extends Disposable {
    static { ChatArtifactsWidget_1 = this; }
    static { this.ELEMENT_HEIGHT = 22; }
    static { this.MAX_ITEMS_SHOWN = 6; }
    constructor(_chatArtifactsService, _instantiationService, _openerService, _configurationService, _fileService, _fileDialogService, _chatImageCarouselService) {
        super();
        this._chatArtifactsService = _chatArtifactsService;
        this._instantiationService = _instantiationService;
        this._openerService = _openerService;
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._fileDialogService = _fileDialogService;
        this._chatImageCarouselService = _chatImageCarouselService;
        this._autorunDisposable = this._register(new MutableDisposable());
        this._isCollapsed = false;
        this._treeStore = this._register(new DisposableStore());
        this.domNode = dom.$('.chat-artifacts-widget');
        this.domNode.style.display = 'none';
    }
    render(sessionResource) {
        this._currentArtifacts = this._chatArtifactsService.getArtifacts(sessionResource);
        dom.clearNode(this.domNode);
        this._treeStore.clear();
        const expandoContainer = dom.$('.chat-artifacts-expand');
        const headerButton = this._treeStore.add(new Button(expandoContainer, { supportIcons: true }));
        headerButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
        const titleSection = dom.$('.chat-artifacts-title-section');
        this._expandIcon = dom.$('.expand-icon.codicon');
        this._expandIcon.classList.add(this._isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down');
        this._expandIcon.setAttribute('aria-hidden', 'true');
        this._titleElement = dom.$('.chat-artifacts-title');
        titleSection.appendChild(this._expandIcon);
        titleSection.appendChild(this._titleElement);
        headerButton.element.appendChild(titleSection);
        // Add clear button container
        const clearButtonContainer = dom.$('.artifacts-clear-button-container');
        this._clearButton = this._treeStore.add(new Button(clearButtonContainer, {
            supportIcons: true,
            ariaLabel: localize('chat.artifacts.clearButton', 'Clear all artifacts'),
        }));
        this._clearButton.element.tabIndex = 0;
        this._clearButton.icon = Codicon.clearAll;
        this._treeStore.add(this._clearButton.onDidClick(() => {
            this._clearAllArtifacts();
        }));
        headerButton.element.appendChild(clearButtonContainer);
        this.domNode.appendChild(expandoContainer);
        const listContainer = dom.$('.chat-artifacts-list');
        listContainer.style.display = this._isCollapsed ? 'none' : 'block';
        this.domNode.appendChild(listContainer);
        this._tree = this._treeStore.add(this._instantiationService.createInstance((WorkbenchObjectTree), 'ChatArtifactsTree', listContainer, new ChatArtifactsTreeDelegate(), [
            new ChatArtifactGroupRenderer(),
            new ChatArtifactLeafRenderer(artifact => this._saveArtifact(artifact)),
        ], {
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: new ChatArtifactsAccessibilityProvider(),
        }));
        this._treeStore.add(this._tree.onDidOpen(e => {
            if (!e.element) {
                return;
            }
            if (isGroupNode(e.element)) {
                if (e.element.onlyShowGroup) {
                    this._openGroupInCarousel(e.element);
                }
            }
            else {
                const artifact = e.element;
                if (artifact.type === 'screenshot' && this._configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
                    this._openScreenshotInCarousel(artifact);
                }
                else if (artifact.uri) {
                    const uri = URI.parse(artifact.uri);
                    const editorOverride = getEditorOverrideForChatResource(uri, this._configurationService);
                    this._openerService.open(uri, {
                        fromUserGesture: true,
                        editorOptions: { override: editorOverride },
                    });
                }
            }
        }));
        this._treeStore.add(headerButton.onDidClick(() => {
            this._isCollapsed = !this._isCollapsed;
            this._expandIcon.classList.toggle('codicon-chevron-down', !this._isCollapsed);
            this._expandIcon.classList.toggle('codicon-chevron-right', this._isCollapsed);
            headerButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
            listContainer.style.display = this._isCollapsed ? 'none' : 'block';
        }));
        this._autorunDisposable.value = autorun((reader) => {
            const artifacts = this._currentArtifacts.artifacts.read(reader);
            const mutable = this._currentArtifacts.mutable.read(reader);
            if (artifacts.length === 0) {
                this.domNode.style.display = 'none';
                return;
            }
            this.domNode.style.display = '';
            this._clearButton.element.style.display = mutable ? '' : 'none';
            this._titleElement.textContent = artifacts.length === 1
                ? localize('chat.artifacts.one', "1 Artifact")
                : localize('chat.artifacts.count', "{0} Artifacts", artifacts.length);
            const treeElements = buildTreeElements(artifacts);
            const visibleCount = countVisibleRows(treeElements);
            const itemsShown = Math.min(visibleCount, ChatArtifactsWidget_1.MAX_ITEMS_SHOWN);
            const treeHeight = itemsShown * ChatArtifactsWidget_1.ELEMENT_HEIGHT;
            this._tree.layout(treeHeight);
            this._tree.getHTMLElement().style.height = `${treeHeight}px`;
            this._tree.setChildren(null, treeElements);
        });
    }
    async _openGroupInCarousel(group) {
        // Open the first artifact in the group — the carousel service will collect
        // all images from the chat widget session automatically.
        const first = group.artifacts[0];
        if (first?.uri) {
            await this._chatImageCarouselService.openCarouselAtResource(URI.parse(first.uri));
        }
    }
    async _openScreenshotInCarousel(clicked) {
        if (clicked.uri) {
            await this._chatImageCarouselService.openCarouselAtResource(URI.parse(clicked.uri));
        }
    }
    _clearAllArtifacts() {
        if (!this._currentArtifacts?.mutable.get()) {
            return;
        }
        this._currentArtifacts.clear();
    }
    async _saveArtifact(artifact) {
        const sourceUri = URI.parse(artifact.uri);
        const defaultFileName = sourceUri.path.split('/').pop() ?? artifact.label;
        const defaultPath = await this._fileDialogService.defaultFilePath();
        const defaultUri = URI.joinPath(defaultPath, defaultFileName);
        const targetUri = await this._fileDialogService.showSaveDialog({
            defaultUri,
            title: localize('chat.artifacts.saveDialog.title', "Save Artifact"),
        });
        if (targetUri) {
            const content = await this._fileService.readFile(sourceUri);
            await this._fileService.writeFile(targetUri, content.value);
        }
    }
    hide() {
        this._autorunDisposable.clear();
        this.domNode.style.display = 'none';
    }
};
ChatArtifactsWidget = ChatArtifactsWidget_1 = __decorate([
    __param(0, IChatArtifactsService),
    __param(1, IInstantiationService),
    __param(2, IOpenerService),
    __param(3, IConfigurationService),
    __param(4, IFileService),
    __param(5, IFileDialogService),
    __param(6, IChatImageCarouselService)
], ChatArtifactsWidget);
export { ChatArtifactsWidget };
// --- Tree infrastructure ---
function buildTreeElements(artifacts) {
    const groups = new Map();
    const ungrouped = [];
    for (const artifact of artifacts) {
        if (artifact.groupName) {
            let group = groups.get(artifact.groupName);
            if (!group) {
                group = { config: { groupName: artifact.groupName, onlyShowGroup: artifact.onlyShowGroup ?? false }, artifacts: [] };
                groups.set(artifact.groupName, group);
            }
            group.artifacts.push(artifact);
        }
        else {
            ungrouped.push(artifact);
        }
    }
    const elements = [];
    for (const [, group] of groups) {
        const groupNode = {
            kind: 'group',
            groupName: group.config.groupName,
            artifacts: group.artifacts,
            onlyShowGroup: group.config.onlyShowGroup,
        };
        if (group.config.onlyShowGroup) {
            // Only show group header, no children
            elements.push({ element: groupNode, collapsible: false, collapsed: false });
        }
        else {
            // Show group with children
            elements.push({
                element: groupNode,
                collapsible: true,
                collapsed: false,
                children: group.artifacts.map(a => ({ element: a })),
            });
        }
    }
    for (const artifact of ungrouped) {
        elements.push({ element: artifact });
    }
    return elements;
}
function countVisibleRows(elements) {
    let count = 0;
    for (const el of elements) {
        count++; // The element itself
        if (el.children && !el.collapsed) {
            count += countVisibleRows([...el.children]);
        }
    }
    return count;
}
class ChatArtifactsTreeDelegate {
    getHeight() {
        return ChatArtifactsWidget.ELEMENT_HEIGHT;
    }
    getTemplateId(element) {
        return isGroupNode(element)
            ? ChatArtifactGroupRenderer.TEMPLATE_ID
            : ChatArtifactLeafRenderer.TEMPLATE_ID;
    }
}
class ChatArtifactsAccessibilityProvider {
    getAriaLabel(element) {
        if (isGroupNode(element)) {
            return localize('chat.artifacts.group.aria', "{0} ({1} items)", element.groupName, element.artifacts.length);
        }
        return element.label;
    }
    getWidgetAriaLabel() {
        return localize('chat.artifacts.widget.aria', "Chat Artifacts");
    }
}
class ChatArtifactGroupRenderer {
    constructor() {
        this.templateId = ChatArtifactGroupRenderer.TEMPLATE_ID;
    }
    static { this.TEMPLATE_ID = 'chatArtifactGroupRenderer'; }
    renderTemplate(container) {
        const row = dom.append(container, dom.$('.chat-artifacts-list-row'));
        const iconElement = dom.append(row, dom.$('.chat-artifacts-list-icon'));
        const labelElement = dom.append(row, dom.$('.chat-artifacts-list-label'));
        return { container: row, iconElement, labelElement };
    }
    renderElement(node, _index, templateData) {
        const group = node.element;
        if (!isGroupNode(group)) {
            return;
        }
        // Pick an icon based on the first artifact's type
        const firstType = group.artifacts[0]?.type;
        const icon = (firstType && ARTIFACT_TYPE_ICONS[firstType]) || Codicon.archive;
        templateData.iconElement.className = 'chat-artifacts-list-icon ' + ThemeIcon.asClassName(icon);
        templateData.labelElement.textContent = `${group.groupName} (${group.artifacts.length})`;
        templateData.container.title = group.groupName;
    }
    disposeTemplate() { }
}
class ChatArtifactLeafRenderer {
    static { this.TEMPLATE_ID = 'chatArtifactLeafRenderer'; }
    constructor(_onSave) {
        this._onSave = _onSave;
        this.templateId = ChatArtifactLeafRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const row = dom.append(container, dom.$('.chat-artifacts-list-row'));
        const iconElement = dom.append(row, dom.$('.chat-artifacts-list-icon'));
        const labelElement = dom.append(row, dom.$('.chat-artifacts-list-label'));
        const saveButton = dom.append(row, dom.$('.chat-artifacts-list-save' + ThemeIcon.asCSSSelector(Codicon.save)));
        saveButton.title = localize('chat.artifacts.save', "Save artifact");
        return { container: row, iconElement, labelElement, saveButton };
    }
    renderElement(node, _index, templateData) {
        const artifact = node.element;
        if (isGroupNode(artifact)) {
            return;
        }
        const icon = (artifact.type && ARTIFACT_TYPE_ICONS[artifact.type]) || Codicon.archive;
        templateData.iconElement.className = 'chat-artifacts-list-icon ' + ThemeIcon.asClassName(icon);
        templateData.labelElement.textContent = artifact.label;
        templateData.container.title = artifact.uri;
        templateData.saveButton.onclick = (e) => {
            e.stopPropagation();
            this._onSave(artifact);
        };
    }
    disposeTemplate() { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFydGlmYWN0c1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdEFydGlmYWN0c1dpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFHekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekcsT0FBTyxFQUFFLE9BQU8sRUFBVyxNQUFNLDBDQUEwQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUQsT0FBTyxFQUFpQyxxQkFBcUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWhHLE1BQU0sbUJBQW1CLEdBQThCO0lBQ3RELFNBQVMsRUFBRSxPQUFPLENBQUMsS0FBSztJQUN4QixVQUFVLEVBQUUsT0FBTyxDQUFDLElBQUk7SUFDeEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO0NBQ2xCLENBQUM7QUFjRixTQUFTLFdBQVcsQ0FBQyxPQUE0QjtJQUNoRCxPQUFPLE1BQU0sSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUM7QUFDdEQsQ0FBQztBQUVNLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTs7YUFZM0IsbUJBQWMsR0FBRyxFQUFFLEFBQUwsQ0FBTTthQUNuQixvQkFBZSxHQUFHLENBQUMsQUFBSixDQUFLO0lBRTVDLFlBQ3dCLHFCQUE2RCxFQUM3RCxxQkFBNkQsRUFDcEUsY0FBK0MsRUFDeEMscUJBQTZELEVBQ3RFLFlBQTJDLEVBQ3JDLGtCQUF1RCxFQUNoRCx5QkFBcUU7UUFFaEcsS0FBSyxFQUFFLENBQUM7UUFSZ0MsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM1QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQ25ELG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUN2QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQ3JELGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQ3BCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDL0IsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUEyQjtRQW5CaEYsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUV0RSxpQkFBWSxHQUFHLEtBQUssQ0FBQztRQUVaLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQWtCbkUsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztJQUNyQyxDQUFDO0lBRUQsTUFBTSxDQUFDLGVBQW9CO1FBQzFCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRWxGLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFeEIsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDekQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9GLFlBQVksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUUvRSxNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3JHLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsYUFBYSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUVwRCxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMzQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM3QyxZQUFZLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUUvQyw2QkFBNkI7UUFDN0IsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRTtZQUN4RSxZQUFZLEVBQUUsSUFBSTtZQUNsQixTQUFTLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLHFCQUFxQixDQUFDO1NBQ3hFLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDO1FBQzFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNyRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osWUFBWSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUV2RCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTNDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNwRCxhQUFhLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNuRSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV4QyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQ3pFLENBQUEsbUJBQXdDLENBQUEsRUFDeEMsbUJBQW1CLEVBQ25CLGFBQWEsRUFDYixJQUFJLHlCQUF5QixFQUFFLEVBQy9CO1lBQ0MsSUFBSSx5QkFBeUIsRUFBRTtZQUMvQixJQUFJLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUN0RSxFQUNEO1lBQ0MsdUJBQXVCLEVBQUUsS0FBSztZQUM5QixxQkFBcUIsRUFBRSxJQUFJLGtDQUFrQyxFQUFFO1NBQy9ELENBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDNUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDaEIsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQzNCLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxZQUFZLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBVSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7b0JBQzVILElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDMUMsQ0FBQztxQkFBTSxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztvQkFDekIsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3BDLE1BQU0sY0FBYyxHQUFHLGdDQUFnQyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztvQkFDekYsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO3dCQUM3QixlQUFlLEVBQUUsSUFBSTt3QkFDckIsYUFBYSxFQUFFLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRTtxQkFDM0MsQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2hELElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzlFLFlBQVksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUMvRSxhQUFhLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQyxNQUFlLEVBQUUsRUFBRTtZQUMzRCxNQUFNLFNBQVMsR0FBNkIsSUFBSSxDQUFDLGlCQUFrQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0YsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFrQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDN0QsSUFBSSxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO2dCQUNwQyxPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBRWhFLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQztnQkFDdEQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxZQUFZLENBQUM7Z0JBQzlDLENBQUMsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUV2RSxNQUFNLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNwRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxxQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUMvRSxNQUFNLFVBQVUsR0FBRyxVQUFVLEdBQUcscUJBQW1CLENBQUMsY0FBYyxDQUFDO1lBQ25FLElBQUksQ0FBQyxLQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQy9CLElBQUksQ0FBQyxLQUFNLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLFVBQVUsSUFBSSxDQUFDO1lBQzlELElBQUksQ0FBQyxLQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxLQUFLLENBQUMsb0JBQW9CLENBQUMsS0FBeUI7UUFDM0QsMkVBQTJFO1FBQzNFLHlEQUF5RDtRQUN6RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLElBQUksS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkYsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMseUJBQXlCLENBQUMsT0FBc0I7UUFDN0QsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDakIsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNyRixDQUFDO0lBQ0YsQ0FBQztJQUVPLGtCQUFrQjtRQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1lBQzVDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQXVCO1FBQ2xELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFDMUUsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDcEUsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFOUQsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDO1lBQzlELFVBQVU7WUFDVixLQUFLLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLGVBQWUsQ0FBQztTQUNuRSxDQUFDLENBQUM7UUFFSCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM1RCxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJO1FBQ0gsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7SUFDckMsQ0FBQzs7QUFwTFcsbUJBQW1CO0lBZ0I3QixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHlCQUF5QixDQUFBO0dBdEJmLG1CQUFtQixDQXFML0I7O0FBRUQsOEJBQThCO0FBRTlCLFNBQVMsaUJBQWlCLENBQUMsU0FBbUM7SUFDN0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQWlHLENBQUM7SUFDeEgsTUFBTSxTQUFTLEdBQW9CLEVBQUUsQ0FBQztJQUV0QyxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ2xDLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hCLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixLQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLGFBQWEsSUFBSSxLQUFLLEVBQUUsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ3JILE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDaEMsQ0FBQzthQUFNLENBQUM7WUFDUCxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxRQUFRLEdBQThDLEVBQUUsQ0FBQztJQUUvRCxLQUFLLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLE1BQU0sU0FBUyxHQUF1QjtZQUNyQyxJQUFJLEVBQUUsT0FBTztZQUNiLFNBQVMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVM7WUFDakMsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQzFCLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLGFBQWE7U0FDekMsQ0FBQztRQUVGLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNoQyxzQ0FBc0M7WUFDdEMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM3RSxDQUFDO2FBQU0sQ0FBQztZQUNQLDJCQUEyQjtZQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDO2dCQUNiLE9BQU8sRUFBRSxTQUFTO2dCQUNsQixXQUFXLEVBQUUsSUFBSTtnQkFDakIsU0FBUyxFQUFFLEtBQUs7Z0JBQ2hCLFFBQVEsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNwRCxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7UUFDbEMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQztBQUNqQixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxRQUFtRDtJQUM1RSxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLE1BQU0sRUFBRSxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQzNCLEtBQUssRUFBRSxDQUFDLENBQUMscUJBQXFCO1FBQzlCLElBQUksRUFBRSxDQUFDLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNsQyxLQUFLLElBQUksZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsTUFBTSx5QkFBeUI7SUFDOUIsU0FBUztRQUNSLE9BQU8sbUJBQW1CLENBQUMsY0FBYyxDQUFDO0lBQzNDLENBQUM7SUFDRCxhQUFhLENBQUMsT0FBNEI7UUFDekMsT0FBTyxXQUFXLENBQUMsT0FBTyxDQUFDO1lBQzFCLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxXQUFXO1lBQ3ZDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxXQUFXLENBQUM7SUFDekMsQ0FBQztDQUNEO0FBRUQsTUFBTSxrQ0FBa0M7SUFDdkMsWUFBWSxDQUFDLE9BQTRCO1FBQ3hDLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDMUIsT0FBTyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlHLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFDdEIsQ0FBQztJQUNELGtCQUFrQjtRQUNqQixPQUFPLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7Q0FDRDtBQVVELE1BQU0seUJBQXlCO0lBQS9CO1FBRVUsZUFBVSxHQUFHLHlCQUF5QixDQUFDLFdBQVcsQ0FBQztJQXdCN0QsQ0FBQzthQXpCZ0IsZ0JBQVcsR0FBRywyQkFBMkIsQUFBOUIsQ0FBK0I7SUFHMUQsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1FBQzFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsQ0FBQztJQUN0RCxDQUFDO0lBRUQsYUFBYSxDQUFDLElBQW9DLEVBQUUsTUFBYyxFQUFFLFlBQW9DO1FBQ3ZHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDM0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE9BQU87UUFDUixDQUFDO1FBRUQsa0RBQWtEO1FBQ2xELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDO1FBQzNDLE1BQU0sSUFBSSxHQUFHLENBQUMsU0FBUyxJQUFJLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQztRQUM5RSxZQUFZLENBQUMsV0FBVyxDQUFDLFNBQVMsR0FBRywyQkFBMkIsR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9GLFlBQVksQ0FBQyxZQUFZLENBQUMsV0FBVyxHQUFHLEdBQUcsS0FBSyxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQ3pGLFlBQVksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDaEQsQ0FBQztJQUVELGVBQWUsS0FBVyxDQUFDOztBQVk1QixNQUFNLHdCQUF3QjthQUNiLGdCQUFXLEdBQUcsMEJBQTBCLEFBQTdCLENBQThCO0lBR3pELFlBQTZCLE9BQTBDO1FBQTFDLFlBQU8sR0FBUCxPQUFPLENBQW1DO1FBRjlELGVBQVUsR0FBRyx3QkFBd0IsQ0FBQyxXQUFXLENBQUM7SUFFZ0IsQ0FBQztJQUU1RSxjQUFjLENBQUMsU0FBc0I7UUFDcEMsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7UUFDeEUsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7UUFDMUUsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQywyQkFBMkIsR0FBRyxTQUFTLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0csVUFBVSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMscUJBQXFCLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDcEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUNsRSxDQUFDO0lBRUQsYUFBYSxDQUFDLElBQW9DLEVBQUUsTUFBYyxFQUFFLFlBQW1DO1FBQ3RHLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDOUIsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMzQixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDO1FBQ3RGLFlBQVksQ0FBQyxXQUFXLENBQUMsU0FBUyxHQUFHLDJCQUEyQixHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0YsWUFBWSxDQUFDLFlBQVksQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUN2RCxZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDO1FBRTVDLFlBQVksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDdkMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEIsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELGVBQWUsS0FBVyxDQUFDIn0=