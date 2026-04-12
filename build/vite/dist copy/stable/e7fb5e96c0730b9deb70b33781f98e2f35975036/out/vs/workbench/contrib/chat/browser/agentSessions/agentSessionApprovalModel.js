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
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunIterableDelta, observableValue } from '../../../../../base/common/observable.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
/**
 * Tracks approval state for all live chat sessions. For each session,
 * exposes an observable that emits {@link IAgentSessionApprovalInfo}
 * when a tool invocation is waiting for user confirmation, or `undefined`
 * when no approval is needed.
 */
let AgentSessionApprovalModel = class AgentSessionApprovalModel extends Disposable {
    constructor(_chatService, _languageService) {
        super();
        this._chatService = _chatService;
        this._languageService = _languageService;
        this._approvals = new Map();
        this._modelTrackers = this._register(new DisposableResourceMap());
        this._register(autorunIterableDelta(reader => this._chatService.chatModels.read(reader), ({ addedValues, removedValues }) => {
            for (const model of addedValues) {
                this._modelTrackers.set(model.sessionResource, this._trackModel(model));
            }
            for (const model of removedValues) {
                this._modelTrackers.deleteAndDispose(model.sessionResource);
                this._approvals.get(model.sessionResource.toString())?.set(undefined, undefined);
            }
        }));
    }
    getApproval(sessionResource) {
        return this._getOrCreateApproval(sessionResource.toString());
    }
    _getOrCreateApproval(key) {
        let obs = this._approvals.get(key);
        if (!obs) {
            obs = observableValue(`sessionApproval.${key}`, undefined);
            this._approvals.set(key, obs);
        }
        return obs;
    }
    _trackModel(model) {
        const settable = this._getOrCreateApproval(model.sessionResource.toString());
        const setIfChanged = (value) => {
            const current = settable.get();
            if (current === value) {
                return;
            }
            if (current !== undefined && value !== undefined && current.label === value.label && current.languageId === value.languageId) {
                return;
            }
            settable.set(value, undefined);
        };
        return autorun(reader => {
            const needsInput = model.requestNeedsInput.read(reader);
            if (!needsInput) {
                setIfChanged(undefined);
                return;
            }
            const lastResponse = model.lastRequest?.response;
            if (!lastResponse?.response?.value) {
                setIfChanged(undefined);
                return;
            }
            for (const part of lastResponse.response.value) {
                if (part.kind !== 'toolInvocation' || part.toolSpecificData?.kind === 'modifiedFilesConfirmation') {
                    continue; // unsupported
                }
                const state = part.state.read(reader);
                if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                    let label;
                    let languageId;
                    if (part.toolSpecificData?.kind === 'terminal') {
                        const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
                        label = terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
                        languageId = this._languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language) ?? undefined;
                    }
                    else if (needsInput.detail) {
                        label = needsInput.detail;
                    }
                    else {
                        const msg = part.invocationMessage;
                        label = typeof msg === 'string' ? msg : renderAsPlaintext(msg);
                    }
                    const confirmState = state;
                    setIfChanged({
                        label,
                        languageId,
                        since: new Date(),
                        confirm: () => confirmState.confirm({ type: 4 /* ToolConfirmKind.UserAction */ }),
                    });
                    return;
                }
            }
            setIfChanged(undefined);
        });
    }
};
AgentSessionApprovalModel = __decorate([
    __param(0, IChatService),
    __param(1, ILanguageService)
], AgentSessionApprovalModel);
export { AgentSessionApprovalModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxxQkFBcUIsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQW9DLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTVJLE9BQU8sRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRTdFLE9BQU8sRUFBRSxZQUFZLEVBQXdDLE1BQU0seUNBQXlDLENBQUM7QUFDN0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFTdEY7Ozs7O0dBS0c7QUFDSSxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUEwQixTQUFRLFVBQVU7SUFLeEQsWUFDZSxZQUEyQyxFQUN2QyxnQkFBbUQ7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFIdUIsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDdEIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFrQjtRQUxyRCxlQUFVLEdBQUcsSUFBSSxHQUFHLEVBQXNFLENBQUM7UUFDM0YsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUkscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBUTdFLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUNuRCxDQUFDLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUU7WUFDbEMsS0FBSyxNQUFNLEtBQUssSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDekUsQ0FBQztZQUNELEtBQUssTUFBTSxLQUFLLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25DLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUM1RCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNsRixDQUFDO1FBQ0YsQ0FBQyxDQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxXQUFXLENBQUMsZUFBb0I7UUFDL0IsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVPLG9CQUFvQixDQUFDLEdBQVc7UUFDdkMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1YsR0FBRyxHQUFHLGVBQWUsQ0FBd0MsbUJBQW1CLEdBQUcsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ2xHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRU8sV0FBVyxDQUFDLEtBQWlCO1FBQ3BDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFN0UsTUFBTSxZQUFZLEdBQUcsQ0FBQyxLQUE0QyxFQUFFLEVBQUU7WUFDckUsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQy9CLElBQUksT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUN2QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEtBQUssS0FBSyxDQUFDLEtBQUssSUFBSSxPQUFPLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDOUgsT0FBTztZQUNSLENBQUM7WUFDRCxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUM7UUFFRixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN2QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDakIsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN4QixPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDO1lBQ2pELElBQUksQ0FBQyxZQUFZLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUNwQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3hCLE9BQU87WUFDUixDQUFDO1lBRUQsS0FBSyxNQUFNLElBQUksSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNoRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksS0FBSywyQkFBMkIsRUFBRSxDQUFDO29CQUNuRyxTQUFTLENBQUMsY0FBYztnQkFDekIsQ0FBQztnQkFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDdEMsSUFBSSxLQUFLLENBQUMsSUFBSSxpRUFBeUQsSUFBSSxLQUFLLENBQUMsSUFBSSxpRUFBeUQsRUFBRSxDQUFDO29CQUNoSixJQUFJLEtBQWEsQ0FBQztvQkFDbEIsSUFBSSxVQUE4QixDQUFDO29CQUNuQyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7d0JBQ2hELE1BQU0sWUFBWSxHQUFHLHFDQUFxQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO3dCQUNsRixLQUFLLEdBQUcsWUFBWSxDQUFDLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsSUFBSSxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsSUFBSSxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsSUFBSSxZQUFZLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQzt3QkFDbE4sVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQywyQkFBMkIsQ0FBQyxZQUFZLENBQUMscUJBQXFCLEVBQUUsUUFBUSxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxTQUFTLENBQUM7b0JBQ3BKLENBQUM7eUJBQU0sSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQzlCLEtBQUssR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO29CQUMzQixDQUFDO3lCQUFNLENBQUM7d0JBQ1AsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO3dCQUNuQyxLQUFLLEdBQUcsT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNoRSxDQUFDO29CQUVELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQztvQkFDM0IsWUFBWSxDQUFDO3dCQUNaLEtBQUs7d0JBQ0wsVUFBVTt3QkFDVixLQUFLLEVBQUUsSUFBSSxJQUFJLEVBQUU7d0JBQ2pCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxvQ0FBNEIsRUFBRSxDQUFDO3FCQUN6RSxDQUFDLENBQUM7b0JBQ0gsT0FBTztnQkFDUixDQUFDO1lBQ0YsQ0FBQztZQUVELFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBbEdZLHlCQUF5QjtJQU1uQyxXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsZ0JBQWdCLENBQUE7R0FQTix5QkFBeUIsQ0FrR3JDIn0=