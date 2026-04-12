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
var EnvironmentCollectionProvider_1;
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EnvironmentVariableMutatorType } from '../../../../../platform/terminal/common/environmentVariable.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
// TODO: The rest of the terminal environment changes feature should move here https://github.com/microsoft/vscode/issues/177241
// #region Actions
registerActiveInstanceAction({
    id: "workbench.action.terminal.showEnvironmentContributions" /* TerminalCommandId.ShowEnvironmentContributions */,
    title: localize2('workbench.action.terminal.showEnvironmentContributions', 'Show Environment Contributions'),
    run: async (activeInstance, c, accessor, arg) => {
        const collection = activeInstance.extEnvironmentVariableCollection;
        if (collection) {
            const scope = arg;
            const instantiationService = accessor.get(IInstantiationService);
            const outputProvider = instantiationService.createInstance(EnvironmentCollectionProvider);
            const editorService = accessor.get(IEditorService);
            const timestamp = new Date().getTime();
            const scopeDesc = scope?.workspaceFolder ? ` - ${scope.workspaceFolder.name}` : '';
            const textContent = await outputProvider.provideTextContent(URI.from({
                scheme: EnvironmentCollectionProvider.scheme,
                path: `Environment changes${scopeDesc}`,
                fragment: describeEnvironmentChanges(collection, scope),
                query: `environment-collection-${timestamp}`
            }));
            if (textContent) {
                await editorService.openEditor({
                    resource: textContent.uri
                });
            }
        }
    }
});
// #endregion
function describeEnvironmentChanges(collection, scope) {
    let content = `# ${localize('envChanges', 'Terminal Environment Changes')}`;
    const globalDescriptions = collection.getDescriptionMap(undefined);
    const workspaceDescriptions = collection.getDescriptionMap(scope);
    for (const [ext, coll] of collection.collections) {
        content += `\n\n## ${localize('extension', 'Extension: {0}', ext)}`;
        content += '\n';
        const globalDescription = globalDescriptions.get(ext);
        if (globalDescription) {
            content += `\n${globalDescription}\n`;
        }
        const workspaceDescription = workspaceDescriptions.get(ext);
        if (workspaceDescription) {
            // Only show '(workspace)' suffix if there is already a description for the extension.
            const workspaceSuffix = globalDescription ? ` (${localize('ScopedEnvironmentContributionInfo', 'workspace')})` : '';
            content += `\n${workspaceDescription}${workspaceSuffix}\n`;
        }
        for (const mutator of coll.map.values()) {
            if (filterScope(mutator, scope) === false) {
                continue;
            }
            content += `\n- \`${mutatorTypeLabel(mutator.type, mutator.value, mutator.variable)}\``;
        }
    }
    return content;
}
function filterScope(mutator, scope) {
    if (!mutator.scope) {
        return true;
    }
    // Only mutators which are applicable on the relevant workspace should be shown.
    if (mutator.scope.workspaceFolder && scope?.workspaceFolder && mutator.scope.workspaceFolder.index === scope.workspaceFolder.index) {
        return true;
    }
    return false;
}
function mutatorTypeLabel(type, value, variable) {
    switch (type) {
        case EnvironmentVariableMutatorType.Prepend: return `${variable}=${value}\${env:${variable}}`;
        case EnvironmentVariableMutatorType.Append: return `${variable}=\${env:${variable}}${value}`;
        default: return `${variable}=${value}`;
    }
}
let EnvironmentCollectionProvider = class EnvironmentCollectionProvider {
    static { EnvironmentCollectionProvider_1 = this; }
    static { this.scheme = 'ENVIRONMENT_CHANGES_COLLECTION'; }
    constructor(textModelResolverService, _modelService) {
        this._modelService = _modelService;
        textModelResolverService.registerTextModelContentProvider(EnvironmentCollectionProvider_1.scheme, this);
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        return this._modelService.createModel(resource.fragment, { languageId: 'markdown', onDidChange: Event.None }, resource, false);
    }
};
EnvironmentCollectionProvider = EnvironmentCollectionProvider_1 = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService)
], EnvironmentCollectionProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuZW52aXJvbm1lbnRDaGFuZ2VzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9lbnZpcm9ubWVudENoYW5nZXMvYnJvd3Nlci90ZXJtaW5hbC5lbnZpcm9ubWVudENoYW5nZXMuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQTZCLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDeEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsOEJBQThCLEVBQStGLE1BQU0sZ0VBQWdFLENBQUM7QUFDN00sT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFNUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXJGLGdJQUFnSTtBQUVoSSxrQkFBa0I7QUFFbEIsNEJBQTRCLENBQUM7SUFDNUIsRUFBRSwrR0FBZ0Q7SUFDbEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyx3REFBd0QsRUFBRSxnQ0FBZ0MsQ0FBQztJQUM1RyxHQUFHLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQy9DLE1BQU0sVUFBVSxHQUFH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