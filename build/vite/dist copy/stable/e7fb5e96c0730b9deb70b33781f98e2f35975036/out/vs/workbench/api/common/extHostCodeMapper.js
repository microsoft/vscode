/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as extHostProtocol from './extHost.protocol.js';
import { NotebookEdit, TextEdit } from './extHostTypeConverters.js';
import { URI } from '../../../base/common/uri.js';
import { asArray } from '../../../base/common/arrays.js';
import { LocalChatSessionUri } from '../../contrib/chat/common/model/chatUri.js';
export class ExtHostCodeMapper {
    static { this._providerHandlePool = 0; }
    constructor(mainContext) {
        this.providers = new Map();
        this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCodeMapper);
    }
    async $mapCode(handle, internalRequest, token) {
        // Received request to map code from the main thread
        const provider = this.providers.get(handle);
        if (!provider) {
            throw new Error(`Received request to map code for unknown provider handle ${handle}`);
        }
        // Construct a response object to pass to the provider
        const stream = {
            textEdit: (target, edits) => {
                edits = asArray(edits);
                this._proxy.$handleProgress(internalRequest.requestId, {
                    uri: target,
                    edits: edits.map(TextEdit.from)
                });
            },
            notebookEdit: (target, edits) => {
                edits = asArray(edits);
                this._proxy.$handleProgress(internalRequest.requestId, {
                    uri: target,
                    edits: edits.map(NotebookEdit.from)
                });
            }
        };
        const request = {
            location: internalRequest.location,
            chatRequestId: internalRequest.chatRequestId,
            chatRequestModel: internalRequest.chatRequestModel,
            chatSessionId: internalRequest.chatSessionResource ? LocalChatSessionUri.parseLocalSessionId(URI.revive(internalRequest.chatSessionResource)) : undefined,
            codeBlocks: internalRequest.codeBlocks.map(block => {
                return {
                    code: block.code,
                    resource: URI.revive(block.resource),
                    markdownBeforeBlock: block.markdownBeforeBlock
                };
            })
        };
        const result = await provider.provideMappedEdits(request, stream, token);
        return result ?? null;
    }
    registerMappedEditsProvider(extension, provider) {
        const handle = ExtHostCodeMapper._providerHandlePool++;
        this._proxy.$registerCodeMapperProvider(handle, extension.displayName ?? extension.name);
        this.providers.set(handle, provider);
        return {
            dispose: () => {
                return this._proxy.$unregisterCodeMapperProvider(handle);
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENvZGVNYXBwZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q29kZU1hcHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEtBQUssZUFBZSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVqRixNQUFNLE9BQU8saUJBQWlCO2FBRWQsd0JBQW1CLEdBQVcsQ0FBQyxBQUFaLENBQWE7SUFJL0MsWUFDQyxXQUF5QztRQUh6QixjQUFTLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7UUFLM0UsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFjLEVBQUUsZUFBc0QsRUFBRSxLQUF3QjtRQUM5RyxvREFBb0Q7UUFDcEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN2RixDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELE1BQU0sTUFBTSxHQUFxQztZQUNoRCxRQUFRLEVBQUUsQ0FBQyxNQUFrQixFQUFFLEtBQTBDLEVBQUUsRUFBRTtnQkFDNUUsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRTtvQkFDdEQsR0FBRyxFQUFFLE1BQU07b0JBQ1gsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztpQkFDL0IsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELFlBQVksRUFBRSxDQUFDLE1BQWtCLEVBQUUsS0FBa0QsRUFBRSxFQUFFO2dCQUN4RixLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN2QixJQUFJLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFO29CQUN0RCxHQUFHLEVBQUUsTUFBTTtvQkFDWCxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDO2lCQUNuQyxDQUFDLENBQUM7WUFDSixDQUFDO1NBQ0QsQ0FBQztRQUVGLE1BQU0sT0FBTyxHQUE4QjtZQUMxQyxRQUFRLEVBQUUsZUFBZSxDQUFDLFFBQVE7WUFDbEMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxhQUFhO1lBQzVDLGdCQUFnQixFQUFFLGVBQWUsQ0FBQyxnQkFBZ0I7WUFDbEQsYUFBYSxFQUFFLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3pKLFVBQVUsRUFBRSxlQUFlLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDbEQsT0FBTztvQkFDTixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7b0JBQ3BDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxtQkFBbUI7aUJBQzlDLENBQUM7WUFDSCxDQUFDLENBQUM7U0FDRixDQUFDO1FBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RSxPQUFPLE1BQU0sSUFBSSxJQUFJLENBQUM7SUFDdkIsQ0FBQztJQUVELDJCQUEyQixDQUFDLFNBQWdDLEVBQUUsUUFBcUM7UUFDbEcsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsV0FBVyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6RixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDckMsT0FBTztZQUNOLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLDZCQUE2QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFELENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQyJ9