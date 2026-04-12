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
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { getReplView } from './repl.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../../editor/common/core/position.js';
export class ReplAccessibleView {
    constructor() {
        this.priority = 70;
        this.name = 'debugConsole';
        this.when = ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view');
        this.type = "view" /* AccessibleViewType.View */;
    }
    getProvider(accessor) {
        const viewsService = accessor.get(IViewsService);
        const accessibleViewService = accessor.get(IAccessibleViewService);
        const replView = getReplView(viewsService);
        if (!replView) {
            return undefined;
        }
        const focusedElement = replView.getFocusedElement();
        return new ReplOutputAccessibleViewProvider(replView, focusedElement, accessibleViewService);
    }
}
let ReplOutputAccessibleViewProvider = class ReplOutputAccessibleViewProvider extends Disposable {
    constructor(_replView, _focusedElement, _accessibleViewService) {
        super();
        this._replView = _replView;
        this._focusedElement = _focusedElement;
        this._accessibleViewService = _accessibleViewService;
        this.id = "repl" /* AccessibleViewProviderId.Repl */;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidResolveChildren = this._register(new Emitter());
        this.onDidResolveChildren = this._onDidResolveChildren.event;
        this.verbositySettingKey = "accessibility.verbosity.debug" /* AccessibilityVerbositySettingId.Debug */;
        this.options = {
            type: "view" /* AccessibleViewType.View */
        };
        this._elementPositionMap = new Map();
        this._treeHadFocus = false;
        this._treeHadFocus = !!_focusedElement;
    }
    provideContent() {
        const debugSession = this._replView.getDebugSession();
        if (!debugSession) {
            return 'No debug session available.';
        }
        const elements = debugSession.getReplElements();
        if (!elements.length) {
            return 'No output in the debug console.';
        }
        if (!this._content) {
            this._updateContent(elements);
        }
        // Content is loaded asynchronously, so we need to check if it's available or fallback to the elements that are already available.
        return this._content ?? elements.map(e => e.toString(true)).join('\n');
    }
    onClose() {
        this._content = undefined;
        this._elementPositionMap.clear();
        if (this._treeHadFocus) {
            return this._replView.focusTree();
        }
        this._replView.getReplInput().focus();
    }
    onOpen() {
        // Children are resolved async, so we need to update the content when they are resolved.
        this._register(this.onDidResolveChildren(() => {
            this._onDidChangeContent.fire();
            queueMicrotask(() => {
                if (this._focusedElement) {
                    const position = this._elementPositionMap.get(this._focusedElement.getId());
                    if (position) {
                        this._accessibleViewService.setPosition(position, true);
                    }
                }
            });
        }));
    }
    async _updateContent(elements) {
        const dataSource = this._replView.getReplDataSource();
        if (!dataSource) {
            return;
        }
        let line = 1;
        const content = [];
        for (const e of elements) {
            content.push(e.toString().replace(/\n/g, ''));
            this._elementPositionMap.set(e.getId(), new Position(line, 1));
            line++;
            if (dataSource.hasChildren(e)) {
                const childContent = [];
                const children = await dataSource.getChildren(e);
                for (const child of children) {
                    const id = child.getId();
                    if (!this._elementPositionMap.has(id)) {
                        // don't overwrite parent position
                        this._elementPositionMap.set(id, new Position(line, 1));
                    }
                    childContent.push('  ' + child.toString());
                    line++;
                }
                content.push(childContent.join('\n'));
            }
        }
        this._content = content.join('\n');
        this._onDidResolveChildren.fire();
    }
};
ReplOutputAccessibleViewProvider = __decorate([
    __param(2, IAccessibleViewService)
], ReplOutputAccessibleViewProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEFjY2Vzc2libGVWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9yZXBsQWNjZXNzaWJsZVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFnRixzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBS3BMLE9BQU8sRUFBRSxXQUFXLEVBQVEsTUFBTSxXQUFXLENBQUM7QUFDOUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV0RSxNQUFNLE9BQU8sa0JBQWtCO0lBQS9CO1FBQ0MsYUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNkLFNBQUksR0FBRyxjQUFjLENBQUM7UUFDdEIsU0FBSSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFDekUsU0FBSSx3Q0FBK0M7SUFZcEQsQ0FBQztJQVhBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsUUFBUSxFQUFFLENB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