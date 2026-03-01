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
	/** Whether the user has ever enabled global auto-approve (yolo mode). */
	YoloModeEverEnabled: 'chat.tip.yoloModeEverEnabled',
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
	/** Tracked when user executes /create-instructions. */
	CreateAgentInstructionsUsed: 'chat.tips.createAgentInstructions.commandUsed',
	/** Tracked when user executes /create-prompt. */
	CreatePromptUsed: 'chat.tips.createPrompt.commandUsed',
	/** Tracked when user executes /create-agent. */
	CreateAgentUsed: 'chat.tips.createAgent.commandUsed',
	/** Tracked when user executes /create-skill. */
	CreateSkillUsed: 'chat.tips.createSkill.commandUsed',
} as const;
