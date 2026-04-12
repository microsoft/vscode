/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
export class BaseChatToolInvocationSubPart extends Disposable {
    static { this.idPool = 0; }
    get codeblocksPartId() {
        return this._codeBlocksPartId;
    }
    constructor(toolInvocation) {
        super();
        this.toolInvocation = toolInvocation;
        this._onNeedsRerender = this._register(new Emitter());
        this.onNeedsRerender = this._onNeedsRerender.event;
        this._codeBlocksPartId = 'tool-' + (BaseChatToolInvocationSubPart.idPool++);
    }
    getIcon() {
        const toolInvocation = this.toolInvocation;
        const confirmState = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation);
        const isSkipped = confirmState?.type === 5 /* ToolConfirmKind.Skipped */;
        if (isSkipped) {
            return Codicon.circleSlash;
        }
        return confirmState?.type === 0 /* ToolConfirmKind.Denied */ ?
            Codicon.error :
            IChatToolInvocation.isComplete(toolInvocation) ?
                Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBa0QsTUFBTSwrQ0FBK0MsQ0FBQztBQUdwSSxNQUFNLE9BQWdCLDZCQUE4QixTQUFRLFVBQVU7YUFDcEQsV0FBTSxHQUFHLENBQUMsQUFBSixDQUFLO0lBVTVCLElBQVcsZ0JBQWdCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDO0lBQy9CLENBQUM7SUFFRCxZQUNvQixjQUFtRTtRQUV0RixLQUFLLEVBQUUsQ0FBQztRQUZXLG1CQUFjLEdBQWQsY0FBYyxDQUFxRDtRQVo3RSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNqRCxvQkFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7UUFJN0Msc0JBQWlCLEdBQUcsT0FBTyxHQUFHLENBQUMsNkJBQTZCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQVV4RixDQUFDO0lBRVMsT0FBTztRQUNoQixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBQzNDLE1BQU0sWUFBWSxHQUFHLG1CQUFtQixDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sU0FBUyxHQUFHLFlBQVksRUFBRSxJQUFJLG9DQUE0QixDQUFDO1FBQ2pFLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPLE9BQU8sQ0FBQyxXQUFXLENBQUM7UUFDNUIsQ0FBQztRQUVELE9BQU8sWUFBWSxFQUFFLElBQUksbUNBQTJCLENBQUMsQ0FBQztZQUNyRCxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDZixtQkFBbUIsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDL0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzdELENBQUMifQ==