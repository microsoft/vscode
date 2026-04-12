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
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { editorHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
const $ = dom.$;
function isFeedbackFileElement(element) {
    return element.type === 'file';
}
// --- Tree Delegate ---
class FeedbackTreeDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(element) {
        return isFeedbackFileElement(element)
            ? FeedbackFileRenderer.TEMPLATE_ID
            : FeedbackCommentRenderer.TEMPLATE_ID;
    }
}
class FeedbackFileRenderer {
    static { this.TEMPLATE_ID = 'feedbackFile'; }
    constructor(_labels, _agentFeedbackService, _sessionResource) {
        this._labels = _labels;
        this._agentFeedbackService = _agentFeedbackService;
        this._sessionResource = _sessionResource;
        this.templateId = FeedbackFileRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const label = templateDisposables.add(this._labels.create(container, { supportHighlights: true, supportIcons: true }));
        const actionBarContainer = $('div.agent-feedback-hover-action-bar');
        label.element.appendChild(actionBarContainer);
        const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
        return { label, actionBar, templateDisposables };
    }
    renderElement(node, _index, templateData) {
        const element = node.element;
        templateData.label.element.style.display = 'flex';
        const name = basename(element.uri.path);
        templateData.label.setResource({ resource: element.uri, name }, { fileKind: FileKind.FILE });
        templateData.actionBar.clear();
        if (this._agentFeedbackService) {
            const service = this._agentFeedbackService;
            const sessionResource = this._sessionResource;
            templateData.actionBar.push(new Action('agentFeedback.removeFileComments', localize('agentFeedbackHover.removeAll', "Remove All"), ThemeIcon.asClassName(Codicon.close), true, () => {
                for (const item of element.items) {
                    service.removeFeedback(sessionResource, item.id);
                }
            }), { icon: true, label: false });
        }
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
}
class FeedbackCommentRenderer {
    static { this.TEMPLATE_ID = 'feedbackComment'; }
    constructor(_agentFeedbackService, _sessionResource, _hoverService, _languageService) {
        this._agentFeedbackService = _agentFeedbackService;
        this._sessionResource = _sessionResource;
        this._hoverService = _hoverService;
        this._languageService = _languageService;
        this.templateId = FeedbackCommentRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const row = dom.append(container, $('div.agent-feedback-hover-comment-row'));
        const textElement = dom.append(row, $('div.agent-feedback-hover-comment-text'));
        const actionBarContainer = dom.append(row, $('div.agent-feedback-hover-action-bar'));
        const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
        const hoverDisposable = templateDisposables.add(new MutableDisposable());
        const templateData = { textElement, row, actionBar, templateDisposables, hoverDisposable, element: undefined };
        if (this._agentFeedbackService) {
            const service = this._agentFeedbackService;
            const sessionResource = this._sessionResource;
            templateDisposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, (e) => {
                const data = templateData.element;
                if (data) {
                    e.preventDefault();
                    e.stopPropagation();
                    service.revealFeedback(sessionResource, data.id);
                }
            }));
        }
        return templateData;
    }
    renderElement(node, _index, templateData) {
        const element = node.element;
        templateData.textElement.textContent = element.text;
        templateData.element = element;
        // In read-only mode, set up a rich markdown hover with comment + code snippet
        if (!this._agentFeedbackService) {
            templateData.hoverDisposable.value = this._hoverService.setupDelayedHover(templateData.row, () => this._buildCommentHover(element), { groupId: 'agent-feedback-comment' });
        }
        templateData.actionBar.clear();
        if (this._agentFeedbackService) {
            const service = this._agentFeedbackService;
            const sessionResource = this._sessionResource;
            templateData.actionBar.push(new Action('agentFeedback.removeComment', localize('agentFeedbackHover.remove', "Remove"), ThemeIcon.asClassName(Codicon.close), true, () => {
                service.removeFeedback(sessionResource, element.id);
            }), { icon: true, label: false });
        }
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    _buildCommentHover(element) {
        const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        markdown.appendText(element.text);
        if (element.codeSelection) {
            const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(element.resourceUri);
            markdown.appendMarkdown('\n\n');
            markdown.appendCodeblock(languageId ?? '', element.codeSelection);
        }
        if (element.diffHunks) {
            markdown.appendMarkdown('\n\n');
            markdown.appendCodeblock('diff', element.diffHunks);
        }
        return {
            content: markdown,
            style: 1 /* HoverStyle.Pointer */,
            position: {
                hoverPosition: 1 /* HoverPosition.RIGHT */,
            },
        };
    }
}
// --- Hover ---
/**
 * Creates the custom hover content for the "N comments" attachment.
 * Uses a WorkbenchObjectTree to render files as parent nodes and comments as children,
 * with per-row action bars for removal.
 */
let AgentFeedbackHover = class AgentFeedbackHover extends Disposable {
    constructor(_element, _attachment, _canDelete, _hoverService, _instantiationService, _agentFeedbackService, _languageService) {
        super();
        this._element = _element;
        this._attachment = _attachment;
        this._canDelete = _canDelete;
        this._hoverService = _hoverService;
        this._instantiationService = _instantiationService;
        this._agentFeedbackService = _agentFeedbackService;
        this._languageService = _languageService;
        // Show on hover (delayed)
        this._store.add(this._hoverService.setupDelayedHover(this._element, () => this._store.add(this._buildHoverContent()), { groupId: 'chat-attachments' }));
        // Show immediately on click
        this._store.add(dom.addDisposableListener(this._element, dom.EventType.CLICK, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._showHoverNow();
        }));
    }
    _showHoverNow() {
        const opts = this._buildHoverContent();
        this._register(opts);
        this._hoverService.showInstantHover({
            ...opts,
            target: this._element,
        });
    }
    _buildHoverContent() {
        const disposables = new DisposableStore();
        const hoverElement = $('div.agent-feedback-hover');
        // Tree container
        const treeContainer = dom.append(hoverElement, $('.results.show-file-icons.file-icon-themable-tree.agent-feedback-hover-tree'));
        // Resource labels (shared across all file renderers)
        const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
        // Build tree data
        const { children, commentElements } = this._buildTreeData();
        // Create tree
        const tree = disposables.add(this._instantiationService.createInstance((WorkbenchObjectTree), 'AgentFeedbackHoverTree', treeContainer, new FeedbackTreeDelegate(), [
            new FeedbackFileRenderer(resourceLabels, this._canDelete ? this._agentFeedbackService : undefined, this._attachment.sessionResource),
            new FeedbackCommentRenderer(this._canDelete ? this._agentFeedbackService : undefined, this._attachment.sessionResource, this._hoverService, this._languageService),
        ], {
            defaultIndent: 0,
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: {
                getAriaLabel: (element) => {
                    if (isFeedbackFileElement(element)) {
                        return basename(element.uri.path);
                    }
                    return element.text;
                },
                getWidgetAriaLabel: () => localize('agentFeedbackHover.tree', "Feedback Comments"),
            },
            identityProvider: {
                getId: (element) => {
                    if (isFeedbackFileElement(element)) {
                        return `file:${element.uri.toString()}`;
                    }
                    return `comment:${element.id}`;
                }
            },
            overrideStyles: {
                listFocusBackground: undefined,
                listInactiveFocusBackground: undefined,
                listActiveSelectionBackground: undefined,
                listFocusAndSelectionBackground: undefined,
                listInactiveSelectionBackground: undefined,
                listBackground: editorHoverBackground,
                listFocusForeground: undefined,
                treeStickyScrollBackground: editorHoverBackground,
            }
        }));
        // Set tree data
        tree.setChildren(null, children);
        // Layout tree: clamp to reasonable height
        const ROW_HEIGHT = 22;
        const MAX_ROWS = 8;
        const totalRows = commentElements.length + children.length;
        const treeHeight = Math.min(totalRows * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT);
        tree.layout(treeHeight, 200);
        treeContainer.style.height = `${treeHeight}px`;
        return {
            content: hoverElement,
            style: 1 /* HoverStyle.Pointer */,
            persistence: { hideOnHover: false },
            position: { hoverPosition: 3 /* HoverPosition.ABOVE */ },
            trapFocus: true,
            appearance: { compact: true },
            additionalClasses: ['agent-feedback-hover-container'],
            dispose: () => disposables.dispose(),
        };
    }
    _buildTreeData() {
        // Group feedback items by file
        const byFile = new Map();
        for (const item of this._attachment.feedbackItems) {
            const key = item.resourceUri.toString();
            let group = byFile.get(key);
            if (!group) {
                group = { uri: item.resourceUri, comments: [] };
                byFile.set(key, group);
            }
            group.comments.push({
                type: 'comment',
                id: item.id,
                text: item.text,
                resourceUri: item.resourceUri,
                codeSelection: item.codeSelection,
                diffHunks: item.diffHunks,
            });
        }
        const children = [];
        const allComments = [];
        for (const [, group] of byFile) {
            const fileElement = {
                type: 'file',
                uri: group.uri,
                items: group.comments,
            };
            allComments.push(...group.comments);
            children.push({
                element: fileElement,
                collapsible: true,
                collapsed: false,
                children: group.comments.map(comment => ({
                    element: comment,
                    collapsible: false,
                })),
            });
        }
        return { children, commentElements: allComments };
    }
};
AgentFeedbackHover = __decorate([
    __param(3, IHoverService),
    __param(4, IInstantiationService),
    __param(5, IAgentFeedbackService),
    __param(6, ILanguageService)
], AgentFeedbackHover);
export { AgentFeedbackHover };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0hvdmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0hvdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBSy9FLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQWtCLGNBQWMsRUFBRSxNQUFNLHlDQUF5QyxD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