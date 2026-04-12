/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export const DEFAULT_LOCAL_ECHO_EXCLUDE = ['vim', 'vi', 'nano', 'tmux'];
export var TerminalTypeAheadSettingId;
(function (TerminalTypeAheadSettingId) {
    TerminalTypeAheadSettingId["LocalEchoLatencyThreshold"] = "terminal.integrated.localEchoLatencyThreshold";
    TerminalTypeAheadSettingId["LocalEchoEnabled"] = "terminal.integrated.localEchoEnabled";
    TerminalTypeAheadSettingId["LocalEchoExcludePrograms"] = "terminal.integrated.localEchoExcludePrograms";
    TerminalTypeAheadSettingId["LocalEchoStyle"] = "terminal.integrated.localEchoStyle";
})(TerminalTypeAheadSettingId || (TerminalTypeAheadSettingId = {}));
export const terminalTypeAheadConfiguration = {
    ["terminal.integrated.localEchoLatencyThreshold" /* TerminalTypeAheadSettingId.LocalEchoLatencyThreshold */]: {
        description: localize('terminal.integrated.localEchoLatencyThreshold', "Length of network delay, in milliseconds, where local edits will be echoed on the terminal without waiting for server acknowledgement. If '0', local echo will always be on, and if '-1' it will be disabled."),
        type: 'integer',
        minimum: -1,
        default: 30,
        tags: ['preview'],
    },
    ["terminal.integrated.localEchoEnabled" /* TerminalTypeAheadSettingId.LocalEchoEnabled */]: {
        markdownDescription: localize('terminal.integrated.localEchoEnabled', "When local echo should be enabled. This will override {0}", '`#terminal.integrated.localEchoLatencyThreshold#`'),
        type: 'string',
        enum: ['on', 'off', 'auto'],
        enumDescriptions: [
            localize('terminal.integrated.localEchoEnabled.on', "Always enabled"),
            localize('terminal.integrated.localEchoEnabled.off', "Always disabled"),
            localize('terminal.integrated.localEchoEnabled.auto', "Enabled only for remote workspaces")
        ],
        default: 'off',
        tags: ['preview'],
    },
    ["terminal.integrated.localEchoExcludePrograms" /* TerminalTypeAheadSettingId.LocalEchoExcludePrograms */]: {
        description: localize('terminal.integrated.localEchoExcludePrograms', "Local echo will be disabled when any of these program names are found in the terminal title."),
        type: 'array',
        items: {
            type: 'string',
            uniqueItems: true
        },
        default: DEFAULT_LOCAL_ECHO_EXCLUDE,
        tags: ['preview'],
    },
    ["terminal.integrated.localEchoStyle" /* TerminalTypeAheadSettingId.LocalEchoStyle */]: {
        description: localize('terminal.integrated.localEchoStyle', "Terminal style of locally echoed text; either a font style or an RGB color."),
        default: 'dim',
        anyOf: [
            {
                enum: ['bold', 'dim', 'italic', 'underlined', 'inverted', '#ff0000'],
            },
            {
                type: 'string',
                format: 'color-hex',
            }
        ],
        tags: ['preview'],
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3R5cGVBaGVhZC9jb21tb24vdGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdqRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBMEIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztBQUUvRixNQUFNLENBQU4sSUFBa0IsMEJBS2pCO0FBTEQsV0FBa0IsMEJBQTBCO0lBQzNDLHlHQUEyRSxDQUFBO0lBQzNFLHVGQUF5RCxDQUFBO0lBQ3pELHVHQUF5RSxDQUFBO0lBQ3pFLG1GQUFxRCxDQUFBO0FBQ3RELENBQUMsRUFMaUIsMEJBQTBCLEtBQTFCLDBCQUEwQixRQUszQztBQVNELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFvRDtJQUM5Riw0R0FBc0QsRUFBRTtRQUN2RCxXQUFXLEVBQUUsUUFBUSxDQUFDLCtDQUErQyxFQUFFLCtNQUErTSxDQUFDO1FBQ3ZSLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNYLE9BQU8sRUFBRSxFQUFFO1FBQ1gsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDO0tBQ2pCO0lBQ0QsMEZBQTZDLEVBQUU7UUFDOUMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDJEQUEyRCxFQUFFLG1EQUFtRCxDQUFDO1FBQ3ZMLElBQUksRUFBRSxRQUFRO1FBQ2QsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUM7UUFDM0IsZ0JBQWdCLEVBQUU7WUFDakIsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLGdCQUFnQixDQUFDO1lBQ3JFLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxpQkFBaUIsQ0FBQztZQUN2RSxRQUFRLENBQUMsMkNBQTJDLEVBQUUsb0NBQW9DLENBQUM7U0FDM0Y7UUFDRCxPQUFPLEVBQUUsS0FBSztRQUNkLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztLQUNqQjtJQUNELDBHQUFxRCxFQUFFO1FBQ3RELFdBQVcsRUFBRSxRQUFRLENBQUMsOENBQThDLEVBQUUsOEZBQThGLENBQUM7UUFDckssSUFBSSxFQUFFLE9BQU87UUFDYixLQUFLLEVBQUU7WUFDTixJQUFJLEVBQUUsUUFBUTtZQUNkLFdBQVcsRUFBRSxJQUFJO1NBQ2pCO1FBQ0QsT0FBTyxFQUFFLDBCQUEwQjtRQUNuQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUM7S0FDakI7SUFDRCxzRkFBMkMsRUFBRTtRQUM1QyxXQUFXLEVBQUUsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLDZFQUE2RSxDQUFDO1FBQzFJLE9BQU8sRUFBRSxLQUFLO1FBQ2QsS0FBSyxFQUFFO1lBQ047Z0JBQ0MsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUM7YUFDcEU7WUFDRDtnQkFDQyxJQUFJLEVBQUUsUUFBUTtnQkFDZCxNQUFNLEVBQUUsV0FBVzthQUNuQjtTQUNEO1FBQ0QsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDO0tBQ2pCO0NBQ0QsQ0FBQyJ9