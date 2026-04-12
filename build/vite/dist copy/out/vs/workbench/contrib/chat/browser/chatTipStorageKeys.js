/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Storage keys used by ChatTipService for persisting tip state.
 */
export const ChatTipStorageKeys = {
    /** IDs of tips that have been permanently dismissed by the user. */
    DismissedTips: 'chat.tip.dismissed',
    /** The ID of the last tip that was shown, for round-robin selection. */
    LastTipId: 'chat.tip.lastTipId',
    /** Whether the user has ever modified the thinking phrases setting. */
    ThinkingPhrasesEverModified: 'chat.tip.thinkingPhrasesEverModified',
};
/**
 * Storage keys used by TipEligibilityTracker for tracking user signals.
 */
export const TipEligibilityStorageKeys = {
    /** Command IDs that have been executed (for excludeWhenCommandsExecuted). */
    ExecutedCommands: 'chat.tips.executedCommands',
    /** Chat modes that have been used (for excludeWhenModesUsed). */
    UsedModes: 'chat.tips.usedModes',
    /** Tool IDs that have been invoked (for excludeWhenToolsInvoked). */
    InvokedTools: 'chat.tips.invokedTools',
};
/**
 * Synthetic command IDs used to track user actions that don't have real commands.
 * These are recorded when the user performs the action, allowing tips to be excluded
 * via excludeWhenCommandsExecuted.
 */
export const TipTrackingCommands = {
    /** Tracked when user attaches a file/folder reference with #. */
    AttachFilesReferenceUsed: 'chat.tips.attachFiles.referenceUsed',
    /** Tracked when user executes /init or /create-instructions. */
    CreateAgentInstructionsUsed: 'chat.tips.createAgentInstructions.commandUsed',
    /** Tracked when user executes /create-prompt. */
    CreatePromptUsed: 'chat.tips.createPrompt.commandUsed',
    /** Tracked when user executes /create-agent. */
    CreateAgentUsed: 'chat.tips.createAgent.commandUsed',
    /** Tracked when user executes /create-skill. */
    CreateSkillUsed: 'chat.tips.createSkill.commandUsed',
    /** Tracked when user executes /fork. */
    ForkConversationUsed: 'chat.tips.forkConversation.commandUsed',
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcFN0b3JhZ2VLZXlzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRUaXBTdG9yYWdlS2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2pDLG9FQUFvRTtJQUNwRSxhQUFhLEVBQUUsb0JBQW9CO0lBQ25DLHdFQUF3RTtJQUN4RSxTQUFTLEVBQUUsb0JBQW9CO0lBQy9CLHVFQUF1RTtJQUN2RSwyQkFBMkIsRUFBRSxzQ0FBc0M7Q0FDbkUsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUc7SUFDeEMsNkVBQTZFO0lBQzdFLGdCQUFnQixFQUFFLDRCQUE0QjtJQUM5QyxpRUFBaUU7SUFDakUsU0FBUyxFQUFFLHFCQUFxQjtJQUNoQyxxRUFBcUU7SUFDckUsWUFBWSxFQUFFLHdCQUF3QjtDQUN0QyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHO0lBQ2xDLGlFQUFpRTtJQUNqRSx3QkFBd0IsRUFBRSxxQ0FBcUM7SUFDL0QsZ0VBQWdFO0lBQ2hFLDJCQUEyQixFQUFFLCtDQUErQztJQUM1RSxpREFBaUQ7SUFDakQsZ0JBQWdCLEVBQUUsb0NBQW9DO0lBQ3RELGdEQUFnRDtJQUNoRCxlQUFlLEVBQUUsbUNBQW1DO0lBQ3BELGdEQUFnRDtJQUNoRCxlQUFlLEVBQUUsbUNBQW1DO0lBQ3BELHdDQUF3QztJQUN4QyxvQkFBb0IsRUFBRSx3Q0FBd0M7Q0FDckQsQ0FBQyJ9