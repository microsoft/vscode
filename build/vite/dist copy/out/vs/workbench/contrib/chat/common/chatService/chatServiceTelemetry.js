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
import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatAgentVoteDirection, ChatCopyKind } from './chatService.js';
import { isImageVariableEntry } from '../attachments/chatVariableEntries.js';
import { ChatModeKind } from '../constants.js';
import { ILanguageModelsService } from '../languageModels.js';
import { chatSessionResourceToId } from '../model/chatUri.js';
let ChatServiceTelemetry = class ChatServiceTelemetry {
    constructor(telemetryService) {
        this.telemetryService = telemetryService;
    }
    notifyUserAction(action) {
        if (action.action.kind === 'vote') {
            this.telemetryService.publicLog2('interactiveSessionVote', {
                direction: action.action.direction === ChatAgentVoteDirection.Up ? 'up' : 'down',
                agentId: action.agentId ?? '',
                command: action.command,
            });
        }
        else if (action.action.kind === 'copy') {
            this.telemetryService.publicLog2('interactiveSessionCopy', {
                copyKind: action.action.copyKind === ChatCopyKind.Action ? 'action' : 'toolbar',
                agentId: action.agentId ?? '',
                command: action.command,
            });
        }
        else if (action.action.kind === 'insert') {
            this.telemetryService.publicLog2('interactiveSessionInsert', {
                newFile: !!action.action.newFile,
                agentId: action.agentId ?? '',
                command: action.command,
            });
        }
        else if (action.action.kind === 'apply') {
            this.telemetryService.publicLog2('interactiveSessionApply', {
                newFile: !!action.action.newFile,
                codeMapper: action.action.codeMapper,
                agentId: action.agentId ?? '',
                command: action.command,
                editsProposed: !!action.action.editsProposed,
            });
        }
        else if (action.action.kind === 'runInTerminal') {
            this.telemetryService.publicLog2('interactiveSessionRunInTerminal', {
                languageId: action.action.languageId ?? '',
                agentId: action.agentId ?? '',
                command: action.command,
            });
        }
        else if (action.action.kind === 'followUp') {
            this.telemetryService.publicLog2('chatFollowupClicked', {
                agentId: action.agentId ?? '',
                command: action.command,
            });
        }
        else if (action.action.kind === 'chatEditingHunkAction') {
            this.telemetryService.publicLog2('chatEditHunk', {
                agentId: action.agentId ?? '',
                outcome: action.action.outcome,
                lineCount: action.action.lineCount,
                hasRemainingEdits: action.action.hasRemainingEdits,
            });
        }
    }
    retrievedFollowups(agentId, command, numFollowups) {
        this.telemetryService.publicLog2('chatFollowupsRetrieved', {
            agentId,
            command,
            numFollowups,
        });
    }
};
ChatServiceTelemetry = __decorate([
    __param(0, ITelemetryService)
], ChatServiceTelemetry);
export { ChatServiceTelemetry };
function getCodeBlocks(text) {
    const lines = text.split('\n');
    const codeBlockLanguages = [];
    let codeBlockState;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (codeBlockState) {
            if (new RegExp(`^\\s*${codeBlockState.delimiter}\\s*$`).test(line)) {
                codeBlockLanguages.push(codeBlockState.languageId);
                codeBlockState = undefined;
            }
        }
        else {
            const match = line.match(/^(\s*)(`{3,}|~{3,})(\w*)/);
            if (match) {
                codeBlockState = { delimiter: match[2], languageId: match[3] };
            }
        }
    }
    return codeBlockLanguages;
}
let ChatRequestTelemetry = class ChatRequestTelemetry {
    constructor(opts, telemetryService, languageModelsService) {
        this.opts = opts;
        this.telemetryService = telemetryService;
        this.languageModelsService = languageModelsService;
        this.isComplete = false;
    }
    complete({ timeToFirstProgress, totalTime, result, requestType, request, detectedAgent }) {
        if (this.isComplete) {
            return;
        }
        this.isComplete = true;
        this.telemetryService.publicLog2('interactiveSessionProviderInvoked', {
            timeToFirstProgress,
            totalTime,
            result,
            requestType,
            agent: detectedAgent?.id ?? this.opts.agent.id,
            agentExtensionId: detectedAgent?.extensionId.value ?? this.opts.agent.extensionId.value,
            slashCommand: this.opts.agentSlashCommandPart ? this.opts.agentSlashCommandPart.command.name : this.opts.commandPart?.slashCommand.command,
            chatSessionId: chatSessionResourceToId(this.opts.sessionResource),
            enableCommandDetection: this.opts.enableCommandDetection,
            isParticipantDetected: !!detectedAgent,
            location: this.opts.location,
            citations: request.response?.codeCitations.length ?? 0,
            numCodeBlocks: getCodeBlocks(request.response?.response.toString() ?? '').length,
            attachmentKinds: this.attachmentKindsForTelemetry(request.variableData),
            model: this.resolveModelId(this.opts.options?.userSelectedModelId),
            permissionLevel: this.opts.options?.modeInfo?.kind === ChatModeKind.Ask ? undefined : this.opts.options?.modeInfo?.permissionLevel,
            chatMode: this.opts.options?.modeInfo?.modeName ?? this.opts.options?.modeInfo?.modeId,
            sessionType: this.opts.sessionResource.scheme,
        });
    }
    attachmentKindsForTelemetry(variableData) {
        // this shows why attachments still have to be cleaned up somewhat
        return variableData.variables.map(v => {
            if (v.kind === 'implicit') {
                return 'implicit';
            }
            else if (v.range) {
                // 'range' is range within the prompt text
                if (v.kind === 'tool') {
                    return 'toolInPrompt';
                }
                else if (v.kind === 'toolset') {
                    return 'toolsetInPrompt';
                }
                else {
                    return 'fileInPrompt';
                }
            }
            else if (v.kind === 'command') {
                return 'command';
            }
            else if (v.kind === 'symbol') {
                return 'symbol';
            }
            else if (isImageVariableEntry(v)) {
                return 'image';
            }
            else if (v.kind === 'directory') {
                return 'directory';
            }
            else if (v.kind === 'tool') {
                return 'tool';
            }
            else if (v.kind === 'toolset') {
                return 'toolset';
            }
            else {
                if (URI.isUri(v.value)) {
                    return 'file';
                }
                else if (isLocation(v.value)) {
                    return 'location';
                }
                else {
                    return 'otherAttachment';
                }
            }
        });
    }
    resolveModelId(userSelectedModelId) {
        return userSelectedModelId && this.languageModelsService.lookupLanguageModel(userSelectedModelId)?.id;
    }
};
ChatRequestTelemetry = __decorate([
    __param(1, ITelemetryService),
    __param(2, ILanguageModelsService)
], ChatRequestTelemetry);
export { ChatRequestTelemetry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlcnZpY2VUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZVRlbGVtZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBSTFGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxZQUFZLEVBQWlELE1BQU0sa0JBQWtCLENBQUM7QUFDdkgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFxQixZQUFZLEVBQXVCLE1BQU0saUJBQWlCLENBQUM7QUFDdkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFrS3ZELElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQW9CO0lBQ2hDLFlBQ3FDLGdCQUFtQztRQUFuQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO0lBQ3BFLENBQUM7SUFFTCxnQkFBZ0IsQ0FBQyxNQUE0QjtRQUM1QyxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQXdDLHdCQUF3QixFQUFFO2dCQUNqRyxTQUFTLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEtBQUssc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU07Z0JBQ2hGLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUU7Z0JBQzdCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTzthQUN2QixDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMxQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3Qyx3QkFBd0IsRUFBRTtnQkFDakcsUUFBUSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxLQUFLLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDL0UsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRTtnQkFDN0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2FBQ3ZCLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQTRDLDBCQUEwQixFQUFFO2dCQUN2RyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTztnQkFDaEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRTtnQkFDN0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2FBQ3ZCLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQzNDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQTBDLHlCQUF5QixFQUFFO2dCQUNwRyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTztnQkFDaEMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVTtnQkFDcEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRTtnQkFDN0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2dCQUN2QixhQUFhLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsYUFBYTthQUM1QyxDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztZQUNuRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFnRCxpQ0FBaUMsRUFBRTtnQkFDbEgsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxJQUFJLEVBQUU7Z0JBQzFDLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUU7Z0JBQzdCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTzthQUN2QixDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUM5QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFnRCxxQkFBcUIsRUFBRTtnQkFDdEcsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRTtnQkFDN0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2FBQ3ZCLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLHVCQUF1QixFQUFFLENBQUM7WUFDM0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBZ0QsY0FBYyxFQUFFO2dCQUMvRixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFO2dCQUM3QixPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPO2dCQUM5QixTQUFTLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTO2dCQUNsQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLGlCQUFpQjthQUNsRCxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztJQUVELGtCQUFrQixDQUFDLE9BQWUsRUFBRSxPQUEyQixFQUFFLFlBQW9CO1FBQ3BGLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQW9FLHdCQUF3QixFQUFFO1lBQzdILE9BQU87WUFDUCxPQUFPO1lBQ1AsWUFBWTtTQUNaLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBNURZLG9CQUFvQjtJQUU5QixXQUFBLGlCQUFpQixDQUFBO0dBRlAsb0JBQW9CLENBNERoQzs7QUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFZO0lBQ2xDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0IsTUFBTSxrQkFBa0IsR0FBYSxFQUFFLENBQUM7SUFFeEMsSUFBSSxjQUF1RixDQUFDO0lBQzVGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdkMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXRCLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsSUFBSSxJQUFJLE1BQU0sQ0FBQyxRQUFRLGNBQWMsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNwRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNuRCxjQUFjLEdBQUcsU0FBUyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUNyRCxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLGNBQWMsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2hFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sa0JBQWtCLENBQUM7QUFDM0IsQ0FBQztBQUVNLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQW9CO0lBR2hDLFlBQTZCLElBUTVCLEVBQ21CLGdCQUFvRCxFQUMvQyxxQkFBOEQ7UUFWMUQsU0FBSSxHQUFKLElBQUksQ0FRaEM7UUFDb0MscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUM5QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBWi9FLGVBQVUsR0FBRyxLQUFLLENBQUM7SUFhdkIsQ0FBQztJQUVMLFFBQVEsQ0FBQyxFQUFFLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBUXJGO1FBQ0EsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUN2QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUE4RCxtQ0FBbUMsRUFBRTtZQUNsSSxtQkFBbUI7WUFDbkIsU0FBUztZQUNULE1BQU07WUFDTixXQUFXO1lBQ1gsS0FBSyxFQUFFLGFBQWEsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM5QyxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsV0FBVyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSztZQUN2RixZQUFZLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsT0FBTztZQUMxSSxhQUFhLEVBQUUsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUM7WUFDakUsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0I7WUFDeEQscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLGFBQWE7WUFDdEMsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtZQUM1QixTQUFTLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsTUFBTSxJQUFJLENBQUM7WUFDdEQsYUFBYSxFQUFFLGFBQWEsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNO1lBQ2hGLGVBQWUsRUFBRSxJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztZQUN2RSxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQztZQUNsRSxlQUFlLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksS0FBSyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlO1lBQ2xJLFFBQVEsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNO1lBQ3RGLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNO1NBQzdDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTywyQkFBMkIsQ0FBQyxZQUFzQztRQUN6RSxrRUFBa0U7UUFDbEUsT0FBTyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNyQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQzNCLE9BQU8sVUFBVSxDQUFDO1lBQ25CLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLDBDQUEwQztnQkFDMUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO29CQUN2QixPQUFPLGNBQWMsQ0FBQztnQkFDdkIsQ0FBQztxQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ2pDLE9BQU8saUJBQWlCLENBQUM7Z0JBQzFCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLGNBQWMsQ0FBQztnQkFDdkIsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNqQyxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDaEMsT0FBTyxRQUFRLENBQUM7WUFDakIsQ0FBQztpQkFBTSxJQUFJLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLE9BQU8sT0FBTyxDQUFDO1lBQ2hCLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO2dCQUNuQyxPQUFPLFdBQVcsQ0FBQztZQUNwQixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDeEIsT0FBTyxNQUFNLENBQUM7Z0JBQ2YsQ0FBQztxQkFBTSxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDaEMsT0FBTyxVQUFVLENBQUM7Z0JBQ25CLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLGlCQUFpQixDQUFDO2dCQUMxQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLGNBQWMsQ0FBQyxtQkFBdUM7UUFDN0QsT0FBTyxtQkFBbUIsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsRUFBRSxFQUFFLENBQUM7SUFDdkcsQ0FBQztDQUNELENBQUE7QUE3Rlksb0JBQW9CO0lBWTlCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxzQkFBc0IsQ0FBQTtHQWJaLG9CQUFvQixDQTZGaEMifQ==