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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { dirname, extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatExternalPathConfirmationContribution } from '../../common/tools/builtinTools/chatExternalPathConfirmation.js';
import { ChatUrlFetchingConfirmationContribution } from '../../common/tools/builtinTools/chatUrlFetchingConfirmation.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { InternalFetchWebPageToolId } from '../../common/tools/builtinTools/tools.js';
import { FetchWebPageTool, FetchWebPageToolData } from './fetchPageTool.js';
let NativeBuiltinToolsContribution = class NativeBuiltinToolsContribution extends Disposable {
    static { this.ID = 'chat.nativeBuiltinTools'; }
    constructor(toolsService, instantiationService, confirmationService, fileService, storageService, fileDialogService, labelService) {
        super();
        const editTool = instantiationService.createInstance(FetchWebPageTool);
        this._register(toolsService.registerTool(FetchWebPageToolData, editTool));
        this._register(confirmationService.registerConfirmationContribution(InternalFetchWebPageToolId, instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, params => params.urls)));
        // Register external path confirmation contribution for read_file and list_dir
        // They share the same allowlist so approving a folder for reading files also allows listing that directory
        const externalPathConfirmation = new ChatExternalPathConfirmationContribution((ref) => {
            const params = ref.parameters;
            // read_file uses filePath (it's a file), list_dir uses path (it's a directory)
            if (params?.filePath) {
                return { path: params.filePath, isDirectory: false };
            }
            if (params?.path) {
                return { path: params.path, isDirectory: true };
            }
            return undefined;
        }, labelService, async (pathUri) => {
            // Walk up from the path looking for a .git folder to find the repository root
            let dir = dirname(pathUri);
            for (let i = 0; i < 100; i++) {
                try {
                    if (await fileService.exists(URI.joinPath(dir, '.git'))) {
                        return dir;
                    }
                }
                catch {
                    // ignore permission errors etc.
                }
                const parent = dirname(dir);
                if (extUriBiasedIgnorePathCase.isEqual(parent, dir)) {
                    return undefined;
                }
                dir = parent;
            }
            return undefined;
        }, storageService, async () => {
            const result = await fileDialogService.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
            });
            return result?.[0];
        });
        this._register(externalPathConfirmation);
        this._register(confirmationService.registerConfirmationContribution('copilot_readFile', externalPathConfirmation));
        this._register(confirmationService.registerConfirmationContribution('copilot_listDirectory', externalPathConfirmation));
    }
};
NativeBuiltinToolsContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInstantiationService),
    __param(2, ILanguageModelToolsConfirmationService),
    __param(3, IFileService),
    __param(4, IStorageService),
    __param(5, IFileDialogService),
    __param(6, ILabelService)
], NativeBuiltinToolsContribution);
export { NativeBuiltinToolsContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2VsZWN0cm9uLWJyb3dzZXIvYnVpbHRJblRvb2xzL3Rvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXBGLE9BQU8sRUFBRSx3Q0FBd0MsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzNILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBMkIsTUFBTSxvQkFBb0IsQ0FBQztBQUU5RixJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7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