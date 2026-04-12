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
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IChatContextService } from './chatContextService.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatContext',
    jsonSchema: {
        description: localize('chatContextExtPoint', 'Contributes chat context integrations to the chat widget.'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: {
                    description: localize('chatContextExtPoint.id', 'A unique identifier for this item.'),
                    type: 'string',
                },
                icon: {
                    description: localize('chatContextExtPoint.icon', 'The icon associated with this chat context item.'),
                    type: 'string'
                },
                displayName: {
                    description: localize('chatContextExtPoint.title', 'A user-friendly name for this item which is used for display in menus.'),
                    type: 'string'
                }
            },
            required: ['id', 'icon', 'displayName'],
        }
    },
    activationEventsGenerator: function* (contributions) {
        for (const contrib of contributions) {
            yield `onChatContextProvider:${contrib.id}`;
        }
    },
});
let ChatContextContribution = class ChatContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatContextContribution'; }
    constructor(_chatContextService) {
        super();
        this._chatContextService = _chatContextService;
        extensionPoint.setHandler(extensions => {
            for (const ext of extensions) {
                if (!isProposedApiEnabled(ext.description, 'chatContextProvider')) {
                    continue;
                }
                if (!Array.isArray(ext.value)) {
                    continue;
                }
                for (const contribution of ext.value) {
                    const icon = contribution.icon ? ThemeIcon.fromString(contribution.icon) : undefined;
                    if (!icon && contribution.icon) {
                        ext.collector.error(localize('chatContextExtPoint.invalidIcon', "Invalid icon format for chat context contribution '{0}'. Icon must be in the format '{1}' or '{2}', e.g. '{3}'.", contribution.id, '$(iconId)', '$(iconId~spin)', '$(copilot)'));
                        continue;
                    }
                    if (!icon) {
                        // Icon is required by schema, but handle defensively
                        continue;
                    }
                    this._chatContextService.setChatContextProvider(`${ext.description.id}-${contribution.id}`, { title: contribution.displayName, icon });
                }
            }
        });
    }
};
ChatContextContribution = __decorate([
    __param(0, IChatContextService)
], ChatContextContribution);
export { ChatContextContribution };
registerWorkbenchContribution2(ChatContextContribution.ID, ChatContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLHFDQUFxQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBUWxHLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDLHNCQUFzQixDQUErQjtJQUM5RixjQUFjLEVBQUUsYUFBYTtJQUM3QixVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLDJEQUEyRCxDQUFDO1FBQ3pHLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsb0NBQW9DLENBQUM7b0JBQ3JGLElBQUksRUFBRSxRQUFRO2lCQUNkO2dCQUNELElBQUksRUFBRTtvQkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixF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