/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ITerminalChatService } from '../../../terminal/browser/terminal.js';
export class ChatTerminalOutputAccessibleView {
    constructor() {
        this.priority = 115;
        this.name = 'chatTerminalOutput';
        this.type = "view" /* AccessibleViewType.View */;
        this.when = ChatContextKeys.inChatTerminalToolOutput;
    }
    getProvider(accessor) {
        const terminalChatService = accessor.get(ITerminalChatService);
        const part = terminalChatService.getFocusedProgressPart();
        if (!part) {
            return;
        }
        const content = part.getCommandAndOutputAsText();
        if (!content) {
            return;
        }
        return new AccessibleContentProvider("chatTerminalOutput" /* AccessibleViewProviderId.ChatTerminalOutput */, { type: "view" /* AccessibleViewType.View */, id: "chatTerminalOutput" /* AccessibleViewProviderId.ChatTerminalOutput */, language: 'text' }, () => content, () => part.focusOutput(), "accessibility.verbosity.terminalChatOutput" /* AccessibilityVerbositySettingId.TerminalChatOutput */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsT3V0cHV0QWNjZXNzaWJsZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eS9jaGF0VGVybWluYWxPdXRwdXRBY2Nlc3NpYmxlVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQWdELE1BQU0saUVBQWlFLENBQUM7QUFJMUosT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdFLE1BQU0sT0FBTyxnQ0FBZ0M7SUFBN0M7UUFDVSxhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLG9CQUFvQixDQUFDO1FBQzVCLFNBQUksd0NBQTJCO1FBQy9CLFNBQUksR0FBRyxlQUFlLENBQUMsd0JBQXdCLENBQUM7SUFzQjFELENBQUM7SUFwQkEsV0FBVyxDQUFDLFFBQTBCO1FBQ3JDLE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sSUFBSSxHQUFHLG1CQUFtQixDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDMUQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPO1FBQ1IsQ0FBQztRQUVELE9BQU8sSUFBSSx5QkFBeUIseUVBRW5DLEVBQUUsSUFBSSxzQ0FBeUIsRUFBRSxFQUFFLHdFQUE2QyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsRUFDcEcsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUNiLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsd0dBRXhCLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==