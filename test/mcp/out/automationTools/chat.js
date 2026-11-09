"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyChatTools = applyChatTools;
const zod_1 = require("zod");
/**
 * Chat Tools
 */
function applyChatTools(server, appService) {
    const tools = [];
    tools.push(server.tool('vscode_automation_chat_send_message', 'Send a message to the VS Code chat panel', {
        message: zod_1.z.string().describe('The message to send to the chat')
    }, async (args) => {
        const { message } = args;
        const app = await appService.getOrCreateApplication();
        try {
            await app.workbench.chat.sendMessage(message);
            return {
                content: [{
                        type: 'text',
                        text: `Sent chat message: "${message}"`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Failed to send chat message: ${error}`
                    }]
            };
        }
    }));
    return tools;
}
//# sourceMappingURL=chat.js.map