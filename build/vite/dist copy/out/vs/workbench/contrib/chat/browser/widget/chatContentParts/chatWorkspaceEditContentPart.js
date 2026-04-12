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
import { $, append } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { ChatProgressSubPart } from './chatProgressContentPart.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
let ChatWorkspaceEditContentPart = class ChatWorkspaceEditContentPart extends Disposable {
    constructor(workspaceEdit, _context, chatContentMarkdownRenderer, instantiationService, chatMarkdownAnchorService, labelService) {
        super();
        this.workspaceEdit = workspaceEdit;
        this.instantiationService = instantiationService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.labelService = labelService;
        this.domNode = $('.chat-workspace-edit-content-part');
        const renderEntry = (message, icon) => {
            const result = this._register(chatContentMarkdownRenderer.render(new MarkdownString(message, { isTrusted: true })));
            result.element.classList.add('progress-step');
            renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);
            const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, result.element, icon, undefined));
            append(this.domNode, progressPart.domNode);
        };
        for (const edit of workspaceEdit.edits) {
            if (edit.oldResource && !edit.newResource) {
                // note: not linked because trying to open it would simply error
                renderEntry(localize('deleted', "Deleted `{0}`", this.labelService.getUriBasenameLabel(edit.oldResource)), Codicon.trash);
            }
            else if (!edit.oldResource && edit.newResource) {
                renderEntry(localize('created', "Created []({0})", edit.newResource.toString()), Codicon.newFile);
            }
            else if (edit.oldResource && edit.newResource) {
                renderEntry(localize('renamedTo', "Renamed {0} to []({1})", this.labelService.getUriBasenameLabel(edit.oldResource), edit.newResource.toString()), Codicon.arrowRight);
            }
        }
    }
    hasSameContent(other, _followingContent, _element) {
        if (other.kind !== 'workspaceEdit') {
            return false;
        }
        // Check if the edits are the same
        if (other.edits.length !== this.workspaceEdit.edits.length) {
            return false;
        }
        for (let i = 0; i < other.edits.length; i++) {
            const a = other.edits[i];
            const b = this.workspaceEdit.edits[i];
            if (a.oldResource?.toString() !== b.oldResource?.toString() ||
                a.newResource?.toString() !== b.newResource?.toString()) {
                return false;
            }
        }
        return true;
    }
};
ChatWorkspaceEditContentPart = __decorate([
    __param(3, IInstantiationService),
    __param(4, IChatMarkdownAnchorService),
    __param(5, ILabelService)
], ChatWorkspaceEditContentPart);
export { ChatWorkspaceEditContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdvcmtzcGFjZUVkaXRDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0V29ya3NwYWNlRWRpdENvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBS3pHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUUxRSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFHM0QsWUFDa0IsYUFBaUMsRUFDbEQsUUFBdUMsRUFDdkMsMkJBQThDLEVBQ04sb0JBQTJDLEVBQ3RDLHlCQUFxRCxFQUNsRSxZQUEyQjtRQUUzRCxLQUFLLEVBQUUsQ0FBQztRQVBTLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUdWLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDdEMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQUNsRSxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUkzRCxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBRXRELE1BQU0sV0FBVyxHQUFHLENBQUMsT0FBZSxFQUFFLElBQWUsRUFBRSxFQUFFO1lBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsMkJBQTJCLENBQUMsTUFBTSxDQUFDLElBQUksY0FBYyxDQUFDLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwSCxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxRyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNwSSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDO1FBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDeEMsSUFBSSxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMzQyxnRUFBZ0U7Z0JBQ2hFLFdBQVcsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMzSCxDQUFDO2lCQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbEQsV0FBVyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNuRyxDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pELFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLHdCQUF3QixFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDeEssQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsY0FBYyxDQUFDLEtBQTJCLEVBQUUsaUJBQXlDLEVBQUUsUUFBc0I7UUFDNUcsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELGtDQUFrQztRQUNsQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzVELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEMsSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFO2dCQUMxRCxDQUFDLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztnQkFDMUQsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNELENBQUE7QUFyRFksNEJBQTRCO0lBT3RDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSwwQkFBMEIsQ0FBQTtJQUMxQixXQUFBLGFBQWEsQ0FBQTtHQVRILDRCQUE0QixDQXFEeEMifQ==