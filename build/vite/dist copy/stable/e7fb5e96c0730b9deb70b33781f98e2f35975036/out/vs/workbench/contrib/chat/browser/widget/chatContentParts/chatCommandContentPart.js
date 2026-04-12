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
import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
const $ = dom.$;
let ChatCommandButtonContentPart = class ChatCommandButtonContentPart extends Disposable {
    constructor(commandButton, context, commandService) {
        super();
        this.commandService = commandService;
        this.domNode = $('.chat-command-button');
        const enabled = !isResponseVM(context.element) || !context.element.isStale;
        // Render the primary button
        this.renderButton(this.domNode, commandButton.command, enabled);
        // Render additional buttons if any
        if (commandButton.additionalCommands) {
            for (const command of commandButton.additionalCommands) {
                this.renderButton(this.domNode, command, enabled, true);
            }
        }
    }
    renderButton(container, command, enabled, secondary) {
        const tooltip = enabled ?
            command.tooltip :
            localize('commandButtonDisabled', "Button not available in restored chat");
        const button = this._register(new Button(container, { ...defaultButtonStyles, supportIcons: true, title: tooltip, secondary }));
        button.label = command.title;
        button.enabled = enabled;
        // TODO still need telemetry for command buttons
        this._register(button.onDidClick(() => this.commandService.executeCommand(command.id, ...(command.arguments ?? []))));
    }
    hasSameContent(other) {
        // No other change allowed for this content type
        return other.kind === 'command';
    }
};
ChatCommandButtonContentPart = __decorate([
    __param(2, ICommandService)
], ChatCommandButtonContentPart);
export { ChatCommandButtonContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbW1hbmRDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29tbWFuZENvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBSWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUd0RSxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRVQsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNkIsU0FBUSxVQUFVO0lBRzNELFlBQ0MsYUFBaUMsRUFDakMsT0FBc0MsRUFDSixjQUErQjtRQUVqRSxLQUFLLEVBQUUsQ0FBQztRQUYwQixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFJakUsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN6QyxNQUFNLE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztRQUUzRSw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEUsbUNBQW1DO1FBQ25DLElBQUksYUFBYSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDdEMsS0FBSyxNQUFNLE9BQU8sSUFBSSxhQUFhLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQkFDeEQsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sWUFBWSxDQUFDLFNBQXNCLEVBQUUsT0FBZ0IsRUFBRSxPQUFnQixFQUFFLFNBQW1CO1FBQ25HLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNqQixRQUFRLENBQUMsdUJBQXVCLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUM1RSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUFFLEdBQUcsbUJBQW1CLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoSSxNQUFNLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDN0IsTUFBTSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFFekIsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZILENBQUM7SUFFRCxjQUFjLENBQUMsS0FBNkM7UUFDM0QsZ0RBQWdEO1FBQ2hELE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUM7SUFDakMsQ0FBQztDQUNELENBQUE7QUF4Q1ksNEJBQTRCO0lBTXRDLFdBQUEsZUFBZSxDQUFBO0dBTkwsNEJBQTRCLENBd0N4QyJ9