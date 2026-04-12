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
import { Lazy } from '../../../base/common/lazy.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import * as process from '../../../base/common/process.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostEditorTabs } from './extHostEditorTabs.js';
import { IExtHostExtensionService } from './extHostExtensionService.js';
import { CustomEditorTabInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TextDiffTabInput, TextTabInput } from './extHostTypes.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { AbstractVariableResolverService } from '../../services/configurationResolver/common/variableResolver.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
export const IExtHostVariableResolverProvider = createDecorator('IExtHostVariableResolverProvider');
class ExtHostVariableResolverService extends AbstractVariableResolverService {
    constructor(extensionService, workspaceService, editorService, editorTabs, configProvider, context, homeDir) {
        function getActiveUri() {
            if (editorService) {
                const activeEditor = editorService.activeEditor();
                if (activeEditor) {
                    return activeEditor.document.uri;
                }
                const activeTab = editorTabs.tabGroups.all.find(group => group.isActive)?.activeTab;
                if (activeTab !== undefined) {
                    // Resolve a resource from the tab
                    if (activeTab.input instanceof TextDiffTabInput || activeTab.input instanceof NotebookDiffEditorTabInput) {
                        return activeTab.input.modified;
                    }
                    else if (activeTab.input instanceof TextTabInput || activeTab.input instanceof NotebookEditorTabInput || activeTab.input instanceof CustomEditorTabInput) {
                        return activeTab.input.uri;
                    }
                }
            }
            return undefined;
        }
        super({
            getFolderUri: (folderName) => {
                const found = context.folders.filter(f => f.name === folderName);
                if (found && found.length > 0) {
                    return found[0].uri;
                }
                return undefined;
            },
            getWorkspaceFolderCount: () => {
                return context.folders.length;
            },
            getConfigurationValue: (folderUri, section) => {
                return configProvider.getConfiguration(undefined, folderUri).get(section);
            },
            getAppRoot: () => {
                return process.cwd();
            },
            getExecPath: () => {
                return process.env['VSCODE_EXEC_PATH'];
            },
            getFilePath: () => {
                const activeUri = getActiveUri();
                if (activeUri) {
                    return path.normalize(activeUri.fsPath);
                }
                return undefined;
            },
            getWorkspaceFolderPathForFile: () => {
                if (workspaceService) {
                    const activeUri = getActiveUri();
                    if (activeUri) {
                        const ws = workspaceService.getWorkspaceFolder(activeUri);
                        if (ws) {
                            return path.normalize(ws.uri.fsPath);
                        }
                    }
                }
                return undefined;
            },
            getSelectedText: () => {
                if (editorService) {
                    const activeEditor = editorService.activeEditor();
                    if (activeEditor && !activeEditor.selection.isEmpty) {
                        return activeEditor.document.getText(activeEditor.selection);
                    }
                }
                return undefined;
            },
            getLineNumber: () => {
                if (editorService) {
                    const activeEditor = editorService.activeEditor();
                    if (activeEditor) {
                        return String(activeEditor.selection.end.line + 1);
                    }
                }
                return undefined;
            },
            getColumnNumber: () => {
                if (editorService) {
                    const activeEditor = editorService.activeEditor();
                    if (activeEditor) {
                        return String(activeEditor.selection.end.character + 1);
                    }
                }
                return undefined;
            },
            getExtension: (id) => {
                return extensionService.getExtension(id);
            },
        }, undefined, homeDir ? Promise.resolve(homeDir) : undefined, Promise.resolve(process.env));
    }
}
let ExtHostVariableResolverProviderService = class ExtHostVariableResolverProviderService extends Disposable {
    constructor(extensionService, workspaceService, editorService, configurationService, editorTabs) {
        super();
        this.extensionService = extensionService;
        this.workspaceService = workspaceService;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.editorTabs = editorTabs;
        this._resolver = new Lazy(async () => {
            const configProvider = await this.configurationService.getConfigProvider();
            const folders = await this.workspaceService.getWorkspaceFolders2() || [];
            const dynamic = { folders };
            this._register(this.workspaceService.onDidChangeWorkspace(async (e) => {
                dynamic.folders = await this.workspaceService.getWorkspaceFolders2() || [];
            }));
            return new ExtHostVariableResolverService(this.extensionService, this.workspaceService, this.editorService, this.editorTabs, configProvider, dynamic, this.homeDir());
        });
    }
    getResolver() {
        return this._resolver.value;
    }
    homeDir() {
        return undefined;
    }
};
ExtHostVariableResolverProviderService = __decorate([
    __param(0, IExtHostExtensionService),
    __param(1, IExtHostWorkspace),
    __param(2, IExtHostDocumentsAndEditors),
    __param(3, IExtHostConfiguration),
    __param(4, IExtHostEditorTabs)
], ExtHostVariableResolverProviderService);
export { ExtHostVariableResolverProviderService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxLQUFLLElBQUksTUFBTSw4QkFBOEIsQ0FBQztBQUNyRCxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0ksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFMUQsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFbEgsT0FBTyxFQUF5QixxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBT3pGLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsa0NBQWtDLENBQUMsQ0FBQztBQU10SSxNQUFNLDhCQUErQixTQUFRLCtCQUErQjtJQUUzRSxZQUNDLGdC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