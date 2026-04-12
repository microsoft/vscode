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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas, matchesSomeScheme } from '../../../../base/common/network.js';
import { dirname, isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { BreadcrumbsConfig } from './breadcrumbs.js';
import { IOutlineService } from '../../../services/outline/browser/outline.js';
export class FileElement {
    constructor(uri, kind) {
        this.uri = uri;
        this.kind = kind;
    }
}
export class OutlineElement2 {
    constructor(element, outline) {
        this.element = element;
        this.outline = outline;
    }
}
let BreadcrumbsModel = class BreadcrumbsModel {
    constructor(resource, editor, configurationService, _workspaceService, _outlineService) {
        this.resource = resource;
        this.editor = editor;
        this._workspaceService = _workspaceService;
        this._outlineService = _outlineService;
        this._disposables = new DisposableStore();
        this._currentOutline = new MutableDisposable();
        this._outlineDisposables = new DisposableStore();
        this._onDidUpdate = new Emitter();
        this.onDidUpdate = this._onDidUpdate.event;
        this._cfgFilePath = BreadcrumbsConfig.FilePath.bindTo(configurationService);
        this._cfgSymbolPath = BreadcrumbsConfig.SymbolPath.bindTo(configurationService);
        this._disposables.add(this._cfgFilePath.onDidChange(_ => this._onDidUpdate.fire(this)));
        this._disposables.add(this._cfgSymbolPath.onDidChange(_ => this._onDidUpdate.fire(this)));
        this._workspaceService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspaceFolders, this, this._disposables);
        this._fileInfo = this._initFilePathInfo(resource);
        if (editor) {
            this._bindToEditor(editor);
            this._disposables.add(_outlineService.onDidChange(() => this._bindToEditor(editor)));
            this._disposables.add(editor.onDidChangeControl(() => this._bindToEditor(editor)));
        }
        this._onDidUpdate.fire(this);
    }
    dispose() {
        this._disposables.dispose();
        this._cfgFilePath.dispose();
        this._cfgSymbolPath.dispose();
        this._currentOutline.dispose();
        this._outlineDisposables.dispose();
        this._onDidUpdate.dispose();
    }
    isRelative() {
        return Boolean(this._fileInfo.folder);
    }
    getElements() {
        let result = [];
        // file path elements
        if (this._cfgFilePath.getValue() === 'on') {
            result = result.concat(this._fileInfo.path);
        }
        else if (this._cfgFilePath.getValue() === 'last' && this._fileInfo.path.length > 0) {
            result = result.concat(this._fileInfo.path.slice(-1));
        }
        if (this._cfgSymbolPath.getValue() === 'off') {
            return result;
        }
        if (!this._currentOutline.value) {
            return result;
        }
        const breadcrumbsElements = this._currentOutline.value.config.breadcrumbsDataSource.getBreadcrumbElements();
        for (let i = this._cfgSymbolPath.getValue() === 'last' && breadcrumbsElements.length > 0 ? breadcrumbsElements.length - 1 : 0; i < breadcrumbsElements.length; i++) {
            result.push(new OutlineElement2(breadcrumbsElements[i].element, this._currentOutline.value));
        }
        if (breadcrumbsElements.length === 0 && !this._currentOutline.value.isEmpty) {
            result.push(new OutlineElement2(this._currentOutline.value, this._currentOutline.value));
        }
        return result;
    }
    _initFilePathInfo(uri) {
        if (matchesSomeScheme(uri, Schemas.untitled, Schemas.data)) {
            return {
                folder: undefined,
                path: []
            };
        }
        const info = {
            folder: this._workspaceService.getWorkspaceFolder(uri) ?? undefined,
            path: []
        };
        let uriPrefix = uri;
        while (uriPrefix && uriPrefix.path !== '/') {
            if (info.folder && isEqual(info.folder.uri, uriPrefix)) {
                break;
            }
            info.path.unshift(new FileElement(uriPrefix, info.path.length === 0 ? FileKind.FILE : FileKind.FOLDER));
            const prevPathLength = uriPrefix.path.length;
            uriPrefix = dirname(uriPrefix);
            if (uriPrefix.path.length === prevPathLength) {
                break;
            }
        }
        if (info.folder && this._workspaceService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            info.path.unshift(new FileElement(info.folder.uri, FileKind.ROOT_FOLDER));
        }
        return info;
    }
    _onDidChangeWorkspaceFolders() {
        this._fileInfo = this._initFilePathInfo(this.resource);
        this._onDidUpdate.fire(this);
    }
    _bindToEditor(editor) {
        const newCts = new CancellationTokenSource();
        this._currentOutline.clear();
        this._outlineDisposables.clear();
        this._outlineDisposables.add(toDisposable(() => newCts.dispose(true)));
        this._outlineService.createOutline(editor, 2 /* OutlineTarget.Breadcrumbs */, newCts.token).then(outline => {
            if (newCts.token.isCancellationRequested) {
                // cancelled: dispose new outline and reset
                outline?.dispose();
                outline = undefined;
            }
            this._currentOutline.value = outline;
            this._onDidUpdate.fire(this);
            if (outline) {
                this._outlineDisposables.add(outline.onDidChange(() => this._onDidUpdate.fire(this)));
            }
        }).catch(err => {
            this._onDidUpdate.fire(this);
            onUnexpectedError(err);
        });
    }
};
BreadcrumbsModel = __decorate([
    __param(2, IConfigurationService),
    __param(3, IWorkspaceContextService),
    __param(4, IOutlineService)
], BreadcrumbsModel);
export { BreadcrumbsModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJlYWRjcnVtYnNNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9icmVhZGNydW1ic01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsd0JBQXdCLEVBQW9DLE1BQU0sb0RBQW9ELENBQUM7QUFDaEksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFckQsT0FBTyxFQUFZLGVBQWUsRUFBaUIsTUFBTSw4Q0FBOEMsQ0FBQztBQUV4RyxNQUFNLE9BQU8sV0FBVztJQUN2QixZQUNVLEdBQVEsRUFDUixJQUFjO1FBRGQsUUFBRyxHQUFILEdBQUcsQ0FBSztRQUNSLFNBQUksR0FBSixJQUFJLENBQVU7SUFDcEIsQ0FBQztDQUNMO0FBSUQsTUFBTSxPQUFPLGVBQWU7SUFDM0IsWUFDVSxPQUFvQyxFQUNwQyxPQUEw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