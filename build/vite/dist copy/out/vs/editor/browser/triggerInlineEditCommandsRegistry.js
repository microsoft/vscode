/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Registry for commands that can trigger Inline Edits (NES) when invoked.
 */
export class TriggerInlineEditCommandsRegistry {
    static { this.REGISTERED_COMMANDS = new Set(); }
    static getRegisteredCommands() {
        return [...TriggerInlineEditCommandsRegistry.REGISTERED_COMMANDS];
    }
    static registerCommand(commandId) {
        TriggerInlineEditCommandsRegistry.REGISTERED_COMMANDS.add(commandId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpZ2dlcklubGluZUVkaXRDb21tYW5kc1JlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdHJpZ2dlcklubGluZUVkaXRDb21tYW5kc1JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHOztHQUVHO0FBQ0gsTUFBTSxPQUFnQixpQ0FBaUM7YUFFdkMsd0JBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUVoRCxNQUFNLENBQUMscUJBQXFCO1FBQ2xDLE9BQU8sQ0FBQyxHQUFHLGlDQUFpQyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVNLE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBaUI7UUFDOUMsaUNBQWlDLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3RFLENBQUMifQ==