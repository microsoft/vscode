/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export var TerminalInitialHintSettingId;
(function (TerminalInitialHintSettingId) {
    TerminalInitialHintSettingId["Enabled"] = "terminal.integrated.initialHint";
})(TerminalInitialHintSettingId || (TerminalInitialHintSettingId = {}));
export const terminalInitialHintConfiguration = {
    ["terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.initialHint', "Controls if the first terminal without input will show a hint about available actions when it is focused. This will only show when {0} is disabled.", `\`#${"terminal.integrated.sendKeybindingsToShell" /* TerminalSettingId.SendKeybindingsToShell */}#\``),
        type: 'boolean',
        default: true
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJbml0aWFsSGludENvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvaW5saW5lSGludC9jb21tb24vdGVybWluYWxJbml0aWFsSGludENvbmZpZ3VyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpELE1BQU0sQ0FBTixJQUFrQiw0QkFFakI7QUFGRCxXQUFrQiw0QkFBNEI7SUFDN0MsMkVBQTJDLENBQUE7QUFDNUMsQ0FBQyxFQUZpQiw0QkFBNEIsS0FBNUIsNEJBQTRCLFFBRTdDO0FBRUQsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQW9EO0lBQ2hHLDhFQUFzQyxFQUFFO1FBQ3ZDLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxxSkFBcUosRUFBRSxNQUFNLDJGQUF3QyxLQUFLLENBQUM7UUFDNVEsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsSUFBSTtLQUNiO0NBQ0QsQ0FBQyJ9