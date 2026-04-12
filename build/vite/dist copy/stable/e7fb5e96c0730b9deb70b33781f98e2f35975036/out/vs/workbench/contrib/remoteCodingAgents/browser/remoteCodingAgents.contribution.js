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
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IRemoteCodingAgentsService } from '../common/remoteCodingAgentsService.js';
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'remoteCodingAgents',
    jsonSchema: {
        description: localize('remoteCodingAgentsExtPoint', 'Contributes remote coding agent integrations to the chat widget.'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: {
                    description: localize('remoteCodingAgentsExtPoint.id', 'A unique identifier for this item.'),
                    type: 'string',
                },
                command: {
                    description: localize('remoteCodingAgentsExtPoint.command', 'Identifier of the command to execute. The command must be declared in the "commands" section.'),
                    type: 'string'
                },
                displayName: {
                    description: localize('remoteCodingAgentsExtPoint.displayName', 'A user-friendly name for this item which is used for display in menus.'),
                    type: 'string'
                },
                description: {
                    description: localize('remoteCodingAgentsExtPoint.description', 'Description of the remote agent for use in menus and tooltips.'),
                    type: 'string'
                },
                followUpRegex: {
                    description: localize('remoteCodingAgentsExtPoint.followUpRegex', 'The last occurrence of pattern in an existing chat conversation is sent to the contributing extension to facilitate follow-up responses.'),
                    type: 'string',
                },
                when: {
                    description: localize('remoteCodingAgentsExtPoint.when', 'Condition which must be true to show this item.'),
                    type: 'string'
                },
            },
            required: ['command', 'displayName'],
        }
    }
});
let RemoteCodingAgentsContribution = class RemoteCodingAgentsContribution extends Disposable {
    constructor(remoteCodingAgentsService) {
        super();
        this.remoteCodingAgentsService = remoteCodingAgentsService;
        extensionPoint.setHandler(extensions => {
            for (const ext of extensions) {
                if (!isProposedApiEnabled(ext.description, 'remoteCodingAgents')) {
                    continue;
                }
                if (!Array.isArray(ext.value)) {
                    continue;
                }
                for (const contribution of ext.value) {
                    const command = MenuRegistry.getCommand(contribution.command);
                    if (!command) {
                        continue;
                    }
                    const agent = {
                        id: contribution.id,
                        command: contribution.command,
                        displayName: contribution.displayName,
                        description: contribution.description,
                        followUpRegex: contribution.followUpRegex,
                        when: contribution.when
                    };
                    this.remoteCodingAgentsService.registerAgent(agent);
                }
            }
        });
    }
};
RemoteCodingAgentsContribution = __decorate([
    __param(0, IRemoteCodingAgentsService)
], RemoteCodingAgentsContribution);
export { RemoteCodingAgentsContribution };
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteCodingAgentsContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQ29kaW5nQWdlbnRzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZUNvZGluZ0FnZW50cy9icm93c2VyL3JlbW90ZUNvZGluZ0FnZW50cy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFOUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBMEIsVUFBVSxJQUFJLG1CQUFtQixFQUFtQyxNQUFNLGtDQUFrQyxDQUFDO0FBQzlJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRS9GLE9BQU8sRUFBc0IsMEJBQTBCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQVd4RyxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBcUM7SUFDcEcsY0FBYyxFQUFFLG9CQUFvQjtJQUNwQyxVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLGtFQUFrRSxDQUFDO1FBQ3ZILElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsb0NBQW9DLENBQUM7b0JBQzVGLElB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