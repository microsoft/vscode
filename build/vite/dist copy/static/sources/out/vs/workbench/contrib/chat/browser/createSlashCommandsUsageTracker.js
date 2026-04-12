/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatRequestSlashCommandPart } from '../common/requestParser/chatParserTypes.js';
export class CreateSlashCommandsUsageTracker extends Disposable {
    static { this._USED_CREATE_SLASH_COMMANDS_KEY = 'chat.tips.usedCreateSlashCommands'; }
    constructor(_chatService, _storageService, _getActiveContextKeyService) {
        super();
        this._chatService = _chatService;
        this._storageService = _storageService;
        this._getActiveContextKeyService = _getActiveContextKeyService;
        this._register(this._chatService.onDidSubmitRequest(e => {
            const message = e.message ?? this._chatService.getSession(e.chatSessionResource)?.lastRequest?.message;
            if (!message) {
                return;
            }
            for (const part of message.parts) {
                if (part.kind === ChatRequestSlashCommandPart.Kind) {
                    const slash = part;
                    if (CreateSlashCommandsUsageTracker._isCreateSlashCommand(slash.slashCommand.command)) {
                        this._markUsed();
                        return;
                    }
                }
            }
            // Fallback when parsing doesn't produce a slash command part.
            const trimmed = message.text.trimStart();
            const match = /^\/(create-(?:instructions|prompt|agent|skill))(?:\s|$)/.exec(trimmed);
            if (match && CreateSlashCommandsUsageTracker._isCreateSlashCommand(match[1])) {
                this._markUsed();
            }
        }));
    }
    syncContextKey(contextKeyService) {
        const used = this._storageService.getBoolean(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, -1 /* StorageScope.APPLICATION */, false);
        ChatContextKeys.hasUsedCreateSlashCommands.bindTo(contextKeyService).set(used);
    }
    _markUsed() {
        if (this._storageService.getBoolean(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, -1 /* StorageScope.APPLICATION */, false)) {
            return;
        }
        this._storageService.store(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const contextKeyService = this._getActiveContextKeyService();
        if (contextKeyService) {
            ChatContextKeys.hasUsedCreateSlashCommands.bindTo(contextKeyService).set(true);
        }
    }
    static _isCreateSlashCommand(command) {
        switch (command) {
            case 'create-instructions':
            case 'create-prompt':
            case 'create-agent':
            case 'create-skill':
                return true;
            default:
                return false;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUlsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFekYsTUFBTSxPQUFPLCtCQUFnQyxTQUFRLFVBQVU7YUFDdEMsb0NBQStCLEdBQUcsbUNBQW1DLENBQUM7SUFFOUYsWUFDa0IsWUFBMEIsRUFDMUIsZUFBZ0MsRUFDaEMsMkJBQWlFO1FBRWxGLEtBQUssRUFBRSxDQUFDO1FBSlMsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDMUIsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQ2hDLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBc0M7UUFJbEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3ZELE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsV0FBVyxFQUFFLE9BQU8sQ0FBQztZQUN2RyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTztZQUNSLENBQUM7WUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLDJCQUEyQixDQUFDLElBQUksRUFBRSxDQUFDO29CQUNwRCxNQUFNLEtBQUssR0FBRyxJQUFtQyxDQUFDO29CQUNsRCxJQUFJLCtCQUErQixDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQzt3QkFDdkYsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO3dCQUNqQixPQUFPO29CQUNSLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFFRCw4REFBOEQ7WUFDOUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QyxNQUFNLEtBQUssR0FBRyx5REFBeUQsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEYsSUFBSSxLQUFLLElBQUksK0JBQStCLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDOUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGNBQWMsQ0FBQyxpQkFBcUM7UUFDbkQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsK0JBQStCLENBQUMsK0JBQStCLHFDQUE0QixLQUFLLENBQUMsQ0FBQztRQUMvSSxlQUFlLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFTyxTQUFTO1FBQ2hCLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsK0JBQStCLENBQUMsK0JBQStCLHFDQUE0QixLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZJLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsK0JBQStCLEVBQUUsSUFBSSxtRUFBa0QsQ0FBQztRQUVuSixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1FBQzdELElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixlQUFlLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hGLENBQUM7SUFDRixDQUFDO0lBRU8sTUFBTSxDQUFDLHFCQUFxQixDQUFDLE9BQWU7UUFDbkQsUUFBUSxPQUFPLEVBQUUsQ0FBQztZQUNqQixLQUFLLHFCQUFxQixDQUFDO1lBQzNCLEtBQUssZUFBZSxDQUFDO1lBQ3JCLEtBQUssY0FBYyxDQUFDO1lBQ3BCLEtBQUssY0FBYztnQkFDbEIsT0FBTyxJQUFJLENBQUM7WUFDYjtnQkFDQyxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7SUFDRixDQUFDIn0=