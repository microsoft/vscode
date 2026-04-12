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
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { checkProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
const chatViewsWelcomeJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['icon', 'title', 'contents', 'when'],
    properties: {
        icon: {
            type: 'string',
            description: localize('chatViewsWelcome.icon', 'The icon for the welcome message.'),
        },
        title: {
            type: 'string',
            description: localize('chatViewsWelcome.title', 'The title of the welcome message.'),
        },
        content: {
            type: 'string',
            description: localize('chatViewsWelcome.content', 'The content of the welcome message. The first command link will be rendered as a button.'),
        },
        when: {
            type: 'string',
            description: localize('chatViewsWelcome.when', 'Condition when the welcome message is shown.'),
        }
    }
};
const chatViewsWelcomeExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatViewsWelcome',
    jsonSchema: {
        description: localize('vscode.extension.contributes.chatViewsWelcome', 'Contributes a welcome message to a chat view'),
        type: 'array',
        items: chatViewsWelcomeJsonSchema,
    },
});
let ChatViewsWelcomeHandler = class ChatViewsWelcomeHandler {
    static { this.ID = 'workbench.contrib.chatViewsWelcomeHandler'; }
    constructor(logService) {
        this.logService = logService;
        chatViewsWelcomeExtensionPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                for (const providerDescriptor of extension.value) {
                    checkProposedApiEnabled(extension.description, 'chatParticipantPrivate');
                    const when = ContextKeyExpr.deserialize(providerDescriptor.when);
                    if (!when) {
                        this.logService.error(`Could not deserialize 'when' clause for chatViewsWelcome contribution: ${providerDescriptor.when}`);
                        continue;
                    }
                    const descriptor = {
                        ...providerDescriptor,
                        when,
                        icon: ThemeIcon.fromString(providerDescriptor.icon),
                        content: new MarkdownString(providerDescriptor.content, { isTrusted: true }), // private API with command links
                    };
                    Registry.as("workbench.registry.chat.viewsWelcome" /* ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry */).register(descriptor);
                }
            }
        });
    }
};
ChatViewsWelcomeHandler = __decorate([
    __param(0, ILogService)
], ChatViewsWelcomeHandler);
export { ChatViewsWelcomeHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZpZXdzV2VsY29tZUhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdmlld3NXZWxjb21lL2NoYXRWaWV3c1dlbGNvbWVIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRS9FLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9GLE9BQU8sS0FBSyxrQkFBa0IsTUFBTSw4REFBOEQsQ0FBQztBQUluRyxNQUFNLDBCQUEwQixHQUFHO0lBQ2xDLElBQUksRUFBRSxRQUFRO0lBQ2Qsb0JBQW9CLEVBQUUsS0FBSztJQUMzQixRQUFRLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUM7SUFDL0MsVUFBVSxFQUFFO1FBQ1gsSUFBSSxFQUFFO1lBQ0wsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLG1DQUFtQyxDQUFDO1NBQ25GO1FBQ0QsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLG1DQUFtQyxDQUFDO1NBQ3BGO1FBQ0QsT0FBTyxFQUFFO1lBQ1IsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDBGQUEwRixDQUFDO1NBQzdJO1FBQ0QsSUFBSSxFQUFFO1lBQ0wsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDhDQUE4QyxDQUFDO1NBQzlGO0tBQ0Q7Q0FDOEIsQ0FBQztBQUlqQyxNQUFNLDhCQUE4QixHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUFxQztJQUN2SSxjQUFjLEVBQUUsa0JBQWtCO0lBQ2xDLFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxRQUFRLENBQUMsK0NBQStDLEVBQUUsOENBQThDLENBQUM7UUFDdEgsSUFBSSxFQUFFLE9BQU87UUFDYixLQUFLLEVBQUUsMEJBQTBCO0tBQ2pDO0NBQ0QsQ0FBQyxDQUFDO0FBRUksSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBdUI7YUFFbkIsT0FBRSxHQUFHLDJDQUEyQyxBQUE5QyxDQUErQztJQUVqRSxZQUMrQixVQUF1QjtRQUF2QixlQUFVLEdBQVYsVUFBVSxDQUFhO1FBRXJELDhCQUE4QixDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMvRCxLQUFLLE1BQU0sU0FBUyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsS0FBSyxNQUFNLGtCQUFrQixJQUFJLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDbEQsdUJBQXVCLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO29CQUV6RSxNQUFNLElBQUksR0FBRyxjQUFjLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNqRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ1gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsMEVBQTBFLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQzNILFNBQVM7b0JBQ1YsQ0FBQztvQkFFRCxNQUFNLFVBQVUsR0FBZ0M7d0JBQy9DLEdBQUcsa0JBQWtCO3dCQUNyQixJQUFJO3dCQUNKLElBQUksRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQzt3QkFDbkQsT0FBTyxFQUFFLElBQUksY0FBYyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLGlDQUFpQztxQkFDL0csQ0FBQztvQkFDRixRQUFRLENBQUMsRUFBRSxrR0FBNEYsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzlILENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDOztBQTVCVyx1QkFBdUI7SUFLakMsV0FBQSxXQUFXLENBQUE7R0FMRCx1QkFBdUIsQ0E2Qm5DIn0=