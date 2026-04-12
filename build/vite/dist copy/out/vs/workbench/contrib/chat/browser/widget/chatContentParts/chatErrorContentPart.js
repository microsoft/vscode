/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ChatErrorLevel } from '../../../common/chatService/chatService.js';
const $ = dom.$;
export class ChatErrorContentPart extends Disposable {
    constructor(kind, content, errorDetails, renderer) {
        super();
        this.errorDetails = errorDetails;
        this.domNode = this._register(new ChatErrorWidget(kind, content, renderer)).domNode;
    }
    hasSameContent(other) {
        return other.kind === this.errorDetails.kind;
    }
}
export class ChatErrorWidget extends Disposable {
    constructor(kind, content, renderer) {
        super();
        this.domNode = $('.chat-notification-widget');
        this.domNode.tabIndex = 0;
        let icon;
        let iconClass;
        switch (kind) {
            case ChatErrorLevel.Warning:
                icon = Codicon.warning;
                iconClass = '.chat-warning-codicon';
                break;
            case ChatErrorLevel.Error:
                icon = Codicon.error;
                iconClass = '.chat-error-codicon';
                break;
            case ChatErrorLevel.Info:
                icon = Codicon.info;
                iconClass = '.chat-info-codicon';
                break;
        }
        this.domNode.appendChild($(iconClass, undefined, renderIcon(icon)));
        const markdownContent = this._register(renderer.render(content));
        this.domNode.appendChild(markdownContent.element);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVycm9yQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEVycm9yQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDdkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV4RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFJNUUsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVoQixNQUFNLE9BQU8sb0JBQXFCLFNBQVEsVUFBVTtJQUduRCxZQUNDLElBQW9CLEVBQ3BCLE9BQXdCLEVBQ1AsWUFBa0MsRUFDbkQsUUFBMkI7UUFFM0IsS0FBSyxFQUFFLENBQUM7UUFIUyxpQkFBWSxHQUFaLFlBQVksQ0FBc0I7UUFLbkQsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDckYsQ0FBQztJQUVELGNBQWMsQ0FBQyxLQUEyQjtRQUN6QyxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUM7SUFDOUMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGVBQWdCLFNBQVEsVUFBVTtJQUc5QyxZQUNDLElBQW9CLEVBQ3BCLE9BQXdCLEVBQ3hCLFFBQTJCO1FBRTNCLEtBQUssRUFBRSxDQUFDO1FBRVIsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDMUIsSUFBSSxJQUFJLENBQUM7UUFDVCxJQUFJLFNBQVMsQ0FBQztRQUNkLFFBQVEsSUFBSSxFQUFFLENBQUM7WUFDZCxLQUFLLGNBQWMsQ0FBQyxPQUFPO2dCQUMxQixJQUFJLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztnQkFDdkIsU0FBUyxHQUFHLHVCQUF1QixDQUFDO2dCQUNwQyxNQUFNO1lBQ1AsS0FBSyxjQUFjLENBQUMsS0FBSztnQkFDeEIsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7Z0JBQ3JCLFNBQVMsR0FBRyxxQkFBcUIsQ0FBQztnQkFDbEMsTUFBTTtZQUNQLEtBQUssY0FBYyxDQUFDLElBQUk7Z0JBQ3ZCLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNwQixTQUFTLEdBQUcsb0JBQW9CLENBQUM7Z0JBQ2pDLE1BQU07UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRSxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkQsQ0FBQztDQUNEIn0=