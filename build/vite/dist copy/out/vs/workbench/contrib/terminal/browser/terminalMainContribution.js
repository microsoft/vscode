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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, terminalEditorId } from './terminal.js';
import { parseTerminalUri } from './terminalUri.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IEmbedderTerminalService } from '../../../services/terminal/common/embedderTerminalService.js';
/**
 * The main contribution for the terminal contrib. This contains calls to other components necessary
 * to set up the terminal but don't need to be tracked in the long term (where TerminalService would
 * be more relevant).
 */
let TerminalMainContribution = class TerminalMainContribution extends Disposable {
    static { this.ID = 'terminalMain'; }
    constructor(editorResolverService, embedderTerminalService, workbenchEnvironmentService, labelService, lifecycleService, terminalService, terminalEditorService, terminalGroupService, terminalInstanceService) {
        super();
        this._init(editorResolverService, embedderTerminalService, workbenchEnvironmentService, labelService, lifecycleService, terminalService, terminalEditorService, terminalGroupService, terminalInstanceService);
    }
    async _init(editorResolverService, embedderTerminalService, workbenchEnvironmentService, labelService, lifecycleService, terminalService, terminalEditorService, terminalGroupService, terminalInstanceService) {
        // IMPORTANT: This listener needs to be set up before the workbench is ready to support
        // embedder terminals.
        this._register(embedderTerminalService.onDidCreateTerminal(async (embedderTerminal) => {
            const terminal = await terminalService.createTerminal({
                config: embedderTerminal,
                location: TerminalLocation.Panel,
                skipContributedProfileCheck: true,
            });
            terminalService.setActiveInstance(terminal);
            await terminalService.revealActiveTerminal();
        }));
        await lifecycleService.when(3 /* LifecyclePhase.Restored */);
        // Register terminal editors
        this._register(editorResolverService.registerEditor(`${Schemas.vscodeTerminal}:/**`, {
            id: terminalEditorId,
            label: terminalStrings.terminal,
            priority: RegisteredEditorPriority.exclusive
        }, {
            canSupportResource: uri => uri.scheme === Schemas.vscodeTerminal,
            singlePerResource: true
        }, {
            createEditorInput: async ({ resource, options }) => {
                let instance = terminalService.getInstanceFromResource(resource);
                if (instance) {
                    const sourceGroup = terminalGroupService.getGroupForInstance(instance);
                    sourceGroup?.removeInstance(instance);
                }
                else { // Terminal from a different window
                    const terminalIdentifier = parseTerminalUri(resource);
                    if (!terminalIdentifier.instanceId) {
                        throw new Error('Terminal identifier without instanceId');
                    }
                    const primaryBackend = terminalService.getPrimaryBackend();
                    if (!primaryBackend) {
                        throw new Error('No terminal primary backend');
                    }
                    const attachPersistentProcess = await primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId);
                    if (!attachPersistentProcess) {
                        throw new Error('No terminal persistent process to attach');
                    }
                    instance = terminalInstanceService.createInstance({ attachPersistentProcess }, TerminalLocation.Editor);
                }
                const resolvedResource = terminalEditorService.resolveResource(instance);
                const editor = terminalEditorService.getInputFromResource(resolvedResource);
                return {
                    editor,
                    options: {
                        ...options,
                        pinned: true,
                        forceReload: true,
                        override: terminalEditorId
                    }
                };
            }
        }));
        // Register a resource formatter for terminal URIs
        this._register(labelService.registerFormatter({
            scheme: Schemas.vscodeTerminal,
            formatting: {
                label: '${path}',
                separator: ''
            }
        }));
    }
};
TerminalMainContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IEmbedderTerminalService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ILabelService),
    __param(4, ILifecycleService),
    __param(5, ITerminalService),
    __param(6, ITerminalEditorService),
    __param(7, ITerminalGroupService),
    __param(8, ITerminalInstanceService)
], TerminalMainContribution);
export { TerminalMainContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxNYWluQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbE1haW5Db250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFcEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQzVJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1SCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUJBQWlCLEVBQWtCLE1BQU0saURBQWlELENBQUM7QUFDcEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFeEc7Ozs7R0FJRztBQUNJLElBQU0sd0JBQXdCLEdBQTlCLE1BQU0sd0JBQXlCLFNBQVEsVUFBVTthQUNoRCxPQUFFLEdBQUcsY0FBYyxBQUFqQixDQUFrQjtJQUUzQixZQUN5QixxQkFBNkMsRUFDM0MsdUJBQWlE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