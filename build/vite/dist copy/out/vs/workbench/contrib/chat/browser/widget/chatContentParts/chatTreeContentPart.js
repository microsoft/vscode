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
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { FileKind, FileType } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { ResourcePool } from './chatCollections.js';
const $ = dom.$;
let ChatTreeContentPart = class ChatTreeContentPart extends Disposable {
    constructor(data, treePool, openerService) {
        super();
        this.openerService = openerService;
        const ref = this._register(treePool.get());
        this.tree = ref.object;
        this.onDidFocus = this.tree.onDidFocus;
        this._register(this.tree.onDidOpen((e) => {
            if (e.element && !('children' in e.element)) {
                this.openerService.open(e.element.uri);
            }
        }));
        this._register(this.tree.onContextMenu((e) => {
            e.browserEvent.preventDefault();
            e.browserEvent.stopPropagation();
        }));
        this.tree.setInput(data).then(() => {
            if (!ref.isStale()) {
                this.tree.layout();
            }
        });
        this.domNode = this.tree.getHTMLElement().parentElement;
    }
    domFocus() {
        this.tree.domFocus();
    }
    hasSameContent(other) {
        // No other change allowed for this content type
        return other.kind === 'treeData';
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatTreeContentPart = __decorate([
    __param(2, IOpenerService)
], ChatTreeContentPart);
export { ChatTreeContentPart };
let TreePool = class TreePool extends Disposable {
    get inUse() {
        return this._pool.inUse;
    }
    constructor(_onDidChangeVisibility, instantiationService, configService, themeService) {
        super();
        this._onDidChangeVisibility = _onDidChangeVisibility;
        this.instantiationService = instantiationService;
        this.configService = configService;
        this.themeService = themeService;
        this._pool = this._register(new ResourcePool(() => this.treeFactory()));
    }
    treeFactory() {
        const store = new DisposableStore();
        const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));
        const container = $('.interactive-response-progress-tree');
        store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
        const tree = this.instantiationService.createInstance((WorkbenchCompressibleAsyncDataTree), 'ChatListRenderer', container, new ChatListTreeDelegate(), new ChatListTreeCompressionDelegate(), [new ChatListTreeRenderer(resourceLabels, this.configService.getValue('explorer.decorations'))], new ChatListTreeDataSource(), {
            collapseByDefault: () => false,
            expandOnlyOnTwistieClick: () => false,
            identityProvider: {
                getId: (e) => e.uri.toString()
            },
            accessibilityProvider: {
                getAriaLabel: (element) => element.label,
                getWidgetAriaLabel: () => localize('treeAriaLabel', "File Tree")
            },
            alwaysConsumeMouseWheel: false
        });
        return {
            tree,
            dispose: () => store.dispose()
        };
    }
    get() {
        const wrapper = this._pool.get();
        let stale = false;
        return {
            object: wrapper.tree,
            isStale: () => stale,
            dispose: () => {
                stale = true;
                this._pool.release(wrapper);
            }
        };
    }
    clear() {
        this._pool.clear();
    }
};
TreePool = __decorate([
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, IThemeService)
], TreePool);
export { TreePool };
class ChatListTreeDelegate {
    static { this.ITEM_HEIGHT = 22; }
    getHeight(element) {
        return ChatListTreeDelegate.ITEM_HEIGHT;
    }
    getTemplateId(element) {
        return 'chatListTreeTemplate';
    }
}
class ChatListTreeCompressionDelegate {
    isIncompressible(element) {
        return !element.children;
    }
}
class ChatListTreeRenderer {
    constructor(labels, decorations) {
        this.labels = labels;
        this.decorations = decorations;
        this.templateId = 'chatListTreeTemplate';
    }
    renderCompressedElements(element, index, templateData) {
        templateData.label.element.style.display = 'flex';
        const label = element.element.elements.map((e) => e.label);
        templateData.label.setResource({ resource: element.element.elements[0].uri, name: label }, {
            title: element.element.elements[0].label,
            fileKind: element.children ? FileKind.FOLDER : FileKind.FILE,
            extraClasses: ['explorer-item'],
            fileDecorations: this.decorations
        });
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
        return { templateDisposables, label };
    }
    renderElement(element, index, templateData) {
        templateData.label.element.style.display = 'flex';
        if (!element.children.length && element.element.type !== FileType.Directory) {
            templateData.label.setFile(element.element.uri, {
                fileKind: FileKind.FILE,
                hidePath: true,
                fileDecorations: this.decorations,
            });
        }
        else {
            templateData.label.setResource({ resource: element.element.uri, name: element.element.label }, {
                title: element.element.label,
                fileKind: FileKind.FOLDER,
                fileDecorations: this.decorations
            });
        }
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
}
class ChatListTreeDataSource {
    hasChildren(element) {
        return !!element.children;
    }
    async getChildren(element) {
        return element.children ?? [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRyZWVDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VHJlZUNvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFPN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3hGLE9BQU8sRUFBa0IsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHdDQUF3QyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFJM0csT0FBTyxFQUF3QixZQUFZLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUcxRSxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRVQsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBT2xELFlBQ0MsSUFBdUMsRUFDdkMsUUFBa0IsRUFD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