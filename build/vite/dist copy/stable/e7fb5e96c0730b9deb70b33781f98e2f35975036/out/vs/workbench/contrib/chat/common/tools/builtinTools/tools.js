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
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../constants.js';
import { ILanguageModelToolsService } from '../languageModelToolsService.js';
import { AskQuestionsTool, AskQuestionsToolData } from './askQuestionsTool.js';
import { ConfirmationTool, ConfirmationToolData, ConfirmationToolWithOptionsData, ModifiedFilesConfirmationTool, ModifiedFilesConfirmationToolData } from './confirmationTool.js';
import { EditTool, EditToolData } from './editFileTool.js';
import { createManageTodoListToolData, ManageTodoListTool } from './manageTodoListTool.js';
import { RunSubagentTool } from './runSubagentTool.js';
import { SetArtifactsTool, SetArtifactsToolData } from './setArtifactsTool.js';
import { TaskCompleteTool, TaskCompleteToolData } from './taskCompleteTool.js';
let BuiltinToolsContribution = class BuiltinToolsContribution extends Disposable {
    static { this.ID = 'chat.builtinTools'; }
    constructor(toolsService, instantiationService, configurationService) {
        super();
        const editTool = instantiationService.createInstance(EditTool);
        this._register(toolsService.registerTool(EditToolData, editTool));
        const askQuestionsTool = this._register(instantiationService.createInstance(AskQuestionsTool));
        this._register(toolsService.registerTool(AskQuestionsToolData, askQuestionsTool));
        this._register(toolsService.vscodeToolSet.addTool(AskQuestionsToolData));
        const todoToolData = createManageTodoListToolData();
        const manageTodoListTool = this._register(instantiationService.createInstance(ManageTodoListTool));
        this._register(toolsService.registerTool(todoToolData, manageTodoListTool));
        const confirmationTool = instantiationService.createInstance(ConfirmationTool);
        this._register(toolsService.registerTool(ConfirmationToolData, confirmationTool));
        this._register(toolsService.registerTool(ConfirmationToolWithOptionsData, confirmationTool));
        const modifiedFilesConfirmationTool = instantiationService.createInstance(ModifiedFilesConfirmationTool);
        this._register(toolsService.registerTool(ModifiedFilesConfirmationToolData, modifiedFilesConfirmationTool));
        const taskCompleteTool = instantiationService.createInstance(TaskCompleteTool);
        this._register(toolsService.registerTool(TaskCompleteToolData, taskCompleteTool));
        const setArtifactsTool = instantiationService.createInstance(SetArtifactsTool);
        const setArtifactsRegistration = this._register(new MutableDisposable());
        const updateArtifactsRegistration = () => {
            if (configurationService.getValue(ChatConfiguration.ArtifactsEnabled) &&
                configurationService.getValue(ChatConfiguration.ArtifactsMode) === 'tool') {
                if (!setArtifactsRegistration.value) {
                    setArtifactsRegistration.value = toolsService.registerTool(SetArtifactsToolData, setArtifactsTool);
                }
            }
            else {
                setArtifactsRegistration.clear();
            }
        };
        updateArtifactsRegistration();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.ArtifactsEnabled) || e.affectsConfiguration(ChatConfiguration.ArtifactsMode)) {
                updateArtifactsRegistration();
            }
        }));
        const runSubagentTool = this._register(instantiationService.createInstance(RunSubagentTool));
        let runSubagentRegistration;
        let toolSetRegistration;
        const registerRunSubagentTool = () => {
            runSubagentRegistration?.dispose();
            toolSetRegistration?.dispose();
            toolsService.flushToolUpdates();
            const runSubagentToolData = runSubagentTool.getToolData();
            runSubagentRegistration = toolsService.registerTool(runSubagentToolData, runSubagentTool);
            toolSetRegistration = toolsService.agentToolSet.addTool(runSubagentToolData);
        };
        registerRunSubagentTool();
        this._register(runSubagentTool.onDidUpdateToolData(registerRunSubagentTool));
        this._register({
            dispose: () => {
                runSubagentRegistration?.dispose();
                toolSetRegistration?.dispose();
            }
        });
    }
};
BuiltinToolsContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInstantiationService),
    __param(2, IConfigurationService)
], BuiltinToolsContribution);
export { BuiltinToolsContribution };
export const InternalFetchWebPageToolId = 'vscode_fetchWebPage_internal';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXpHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSwrQkFBK0IsRUFBRSw2QkFBNkIsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xMLE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLDRCQUE0QixFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXhFLElBQU0sd0JBQXdCLEdBQTlCLE1BQU0sd0JBQXlCLFNBQVEs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