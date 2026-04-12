/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import Severity from '../../../../base/common/severity.js';
export class TestDialogService {
    constructor(defaultConfirmResult = undefined, defaultPromptResult = undefined) {
        this.defaultConfirmResult = defaultConfirmResult;
        this.defaultPromptResult = defaultPromptResult;
        this.onWillShowDialog = Event.None;
        this.onDidShowDialog = Event.None;
        this.confirmResult = undefined;
    }
    setConfirmResult(result) {
        this.confirmResult = result;
    }
    async confirm(confirmation) {
        if (this.confirmResult) {
            const confirmResult = this.confirmResult;
            this.confirmResult = undefined;
            return confirmResult;
        }
        return this.defaultConfirmResult ?? { confirmed: false };
    }
    async prompt(prompt) {
        if (this.defaultPromptResult) {
            return this.defaultPromptResult;
        }
        const promptButtons = [...(prompt.buttons ?? [])];
        if (prompt.cancelButton && typeof prompt.cancelButton !== 'string' && typeof prompt.cancelButton !== 'boolean') {
            promptButtons.push(prompt.cancelButton);
        }
        return { result: await promptButtons[0]?.run({ checkboxChecked: false }) };
    }
    async info(message, detail) {
        await this.prompt({ type: Severity.Info, message, detail });
    }
    async warn(message, detail) {
        await this.prompt({ type: Severity.Warning, message, detail });
    }
    async error(message, detail) {
        await this.prompt({ type: Severity.Error, message, detail });
    }
    async input() { {
        return { confirmed: true, values: [] };
    } }
    async about() { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdERpYWxvZ1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUczRCxNQUFNLE9BQU8saUJBQWlCO0lBTzdCLFlBQ1MsdUJBQXdELFNBQVMsRUFDakUsc0JBQTBELFNBQVM7UUFEbkUseUJBQW9CLEdBQXBCLG9CQUFvQixDQUE2QztRQUNqRSx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQWdEO1FBTG5FLHFCQUFnQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDOUIsb0JBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBTzlCLGtCQUFhLEdBQW9DLFNBQVMsQ0FBQztJQUYvRCxDQUFDO0lBR0wsZ0JBQWdCLENBQUMsTUFBMkI7UUFDM0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7SUFDN0IsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBMkI7UUFDeEMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUN6QyxJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQztZQUUvQixPQUFPLGFBQWEsQ0FBQztRQUN0QixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsb0JBQW9CLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDMUQsQ0FBQztJQUtELEtBQUssQ0FBQyxNQUFNLENBQUksTUFBK0M7UUFDOUQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUM5QixPQUFPLElBQUksQ0FBQyxtQkFBdUMsQ0FBQztRQUNyRCxDQUFDO1FBQ0QsTUFBTSxhQUFhLEdBQTJCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxRSxJQUFJLE1BQU0sQ0FBQyxZQUFZLElBQUksT0FBTyxNQUFNLENBQUMsWUFBWSxLQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU0sQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDaEgsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDekMsQ0FBQztRQUVELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQztJQUM1RSxDQUFDO0lBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFlLEVBQUUsTUFBZTtRQUMxQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFlLEVBQUUsTUFBZTtRQUMxQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFlLEVBQUUsTUFBZTtRQUMzQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBQ0QsS0FBSyxDQUFDLEtBQUssS0FBNEIsQ0FBQztRQUFDLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLEtBQUssQ0FBQyxLQUFLLEtBQW9CLENBQUM7Q0FDaEMifQ==