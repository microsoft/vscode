/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { AICustomizationSource } from '../common/aiCustomizationWorkspaceService.js';

export const CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID = 'chat.pet.openAchievements';

export const ChatPetAchievementIds = {
	RequestRevision: 'requestRevision',
	FirstChatMessage: 'firstChatMessage',
	ModelSwitch: 'modelSwitch',
	QueueOrSteeringMessage: 'queueOrSteeringMessage',
	AgentsWindowOpened: 'agentsWindowOpened',
	CreatePullRequest: 'createPullRequest',
	AgentEditKept: 'agentEditKept',
	SessionArchived: 'sessionArchived',
	AgentChangesReviewed: 'agentChangesReviewed',
	ChatReferenceOpened: 'chatReferenceOpened',
	UsefulOutputCopied: 'usefulOutputCopied',
	AutopilotEnabled: 'autopilotEnabled',
	IntegratedBrowserShared: 'integratedBrowserShared',
	ChatOutputCopied: 'chatOutputCopied',
	CustomSkillPresent: 'customSkillPresent',
	McpServerPresent: 'mcpServerPresent',
	InstructionPresent: 'instructionPresent',
	ImageRequest: 'imageRequest',
} as const;

export type ChatPetAchievementId = typeof ChatPetAchievementIds[keyof typeof ChatPetAchievementIds];

export const ChatPetAccessoryIds = {
	CowboyHat: 'cowboyHat',
	TopHatMonocle: 'topHatMonocle',
	SailorHat: 'sailorHat',
	DarkSailorHat: 'darkSailorHat',
	BaseballCap: 'baseballCap',
	PartyHat: 'partyHat',
	PinkPartyHat: 'pinkPartyHat',
	SpinnerHat: 'spinnerHat',
	PropellerHat: 'propellerHat',
	ConstructionHardHat: 'constructionHardHat',
	FirefighterHelmet: 'firefighterHelmet',
	Crown: 'crown',
	ArtistBeret: 'artistBeret',
	RiceHat: 'riceHat',
	SantaHat: 'santaHat',
	StrawHat: 'strawHat',
	WhiteChefHat: 'whiteChefHat',
	WizardHat: 'wizardHat',
} as const;

export type ChatPetAccessoryId = typeof ChatPetAccessoryIds[keyof typeof ChatPetAccessoryIds];

export interface IChatPetAccessory {
	readonly id: ChatPetAccessoryId;
	readonly label: string;
	readonly atlasName: string;
	readonly atlasCellSize?: 64 | 96;
	readonly eyeAccessoryMirrorsWithFacing?: boolean;
	readonly coversAntennae?: boolean;
}

export interface IChatPetAchievement {
	readonly id: ChatPetAchievementId;
	readonly title: string;
	readonly description: string;
	readonly hint: string;
	readonly accessories: readonly [IChatPetAccessory];
	readonly enabled: boolean;
}

export type ChatPetAchievementPresentation =
	| { readonly locked: true; readonly id: ChatPetAchievementId; readonly hint: string; readonly rewardLabels: readonly string[] }
	| { readonly locked: false; readonly id: ChatPetAchievementId; readonly title: string; readonly description: string; readonly accessories: readonly IChatPetAccessory[] };

const enabledChatPetAchievements: readonly IChatPetAchievement[] = [
	{
		id: ChatPetAchievementIds.RequestRevision,
		title: localize('chatPet.achievement.requestRevision.title', "Second Draft"),
		description: localize('chatPet.achievement.requestRevision.description', "You edited and resent an earlier chat request."),
		hint: localize('chatPet.achievement.requestRevision.hint', "An earlier request may deserve a second pass."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.TopHatMonocle,
				label: localize('chatPet.accessory.topHatMonocle', "Grand Top Hat & Monocle"),
				atlasName: 'grand-top-hat-monocle',
				atlasCellSize: 96,
				eyeAccessoryMirrorsWithFacing: false,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.FirstChatMessage,
		title: localize('chatPet.achievement.firstChatMessage.title', "Welcome to the Wild West"),
		description: localize('chatPet.achievement.firstChatMessage.description', "You sent your first chat message."),
		hint: localize('chatPet.achievement.firstChatMessage.hint', "Every collection starts with a first conversation."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.CowboyHat,
				label: localize('chatPet.accessory.cowboyHat', "Cowboy Hat"),
				atlasName: 'cowboy-hat',
				atlasCellSize: 96,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.IntegratedBrowserShared,
		title: localize('chatPet.achievement.integratedBrowserShared.title', "Shared Perspective"),
		description: localize('chatPet.achievement.integratedBrowserShared.description', "You shared the integrated browser with the agent."),
		hint: localize('chatPet.achievement.integratedBrowserShared.hint', "Let the agent see what you see in the integrated browser."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.BaseballCap,
				label: localize('chatPet.accessory.baseballCap', "Baseball Cap"),
				atlasName: 'baseball-cap',
				atlasCellSize: 96,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.ModelSwitch,
		title: localize('chatPet.achievement.modelSwitch.title', "Model Citizen"),
		description: localize('chatPet.achievement.modelSwitch.description', "You selected a different model from the model picker."),
		hint: localize('chatPet.achievement.modelSwitch.hint', "A different model can offer a different perspective."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.ConstructionHardHat,
				label: localize('chatPet.accessory.constructionHardHat', "Construction Hard Hat"),
				atlasName: 'construction-hard-hat',
				atlasCellSize: 96,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.McpServerPresent,
		title: localize('chatPet.achievement.mcpServerPresent.title', "Server Wrangler"),
		description: localize('chatPet.achievement.mcpServerPresent.description', "You configured an MCP server."),
		hint: localize('chatPet.achievement.mcpServerPresent.hint', "Connect Chat to a server beyond the editor."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.FirefighterHelmet,
				label: localize('chatPet.accessory.firefighterHelmet', "Firefighter Helmet"),
				atlasName: 'firefighter-helmet',
				atlasCellSize: 96,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.CustomSkillPresent,
		title: localize('chatPet.achievement.customSkillPresent.title', "Skilled Builder"),
		description: localize('chatPet.achievement.customSkillPresent.description', "You added a custom skill."),
		hint: localize('chatPet.achievement.customSkillPresent.hint', "Teach Chat a skill of your own."),
		enabled: true,
		accessories: [
			{
				id: ChatPetAccessoryIds.Crown,
				label: localize('chatPet.accessory.crown', "Crown"),
				atlasName: 'crown',
				atlasCellSize: 96,
				coversAntennae: true,
			},
		],
	},
	{
		id: ChatPetAchievementIds.AgentsWindowOpened,
		title: localize('chatPet.achievement.agentsWindowOpened.title', "Mission Control"),
		description: localize('chatPet.achievement.agentsWindowOpened.description', "You opened the Agents window."),
		hint: localize('chatPet.achievement.agentsWindowOpened.hint', "Some agent work belongs in its own window."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.PropellerHat,
			label: localize('chatPet.accessory.propellerHat', "Propeller Hat"),
			atlasName: 'propeller-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.CreatePullRequest,
		title: localize('chatPet.achievement.createPullRequest.title', "Ship it"),
		description: localize('chatPet.achievement.createPullRequest.description', "You used Create PR in the Agents window."),
		hint: localize('chatPet.achievement.createPullRequest.hint', "When the changes are ready, send them on their way."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.DarkSailorHat,
			label: localize('chatPet.accessory.darkSailorHat', "Dark Sailor Hat"),
			atlasName: 'dark-sailor-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.AgentEditKept,
		title: localize('chatPet.achievement.agentEditKept.title', "Let it cook"),
		description: localize('chatPet.achievement.agentEditKept.description', "You kept a change prepared by Chat."),
		hint: localize('chatPet.achievement.agentEditKept.hint', "Give a good idea time to come together."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.WhiteChefHat,
			label: localize('chatPet.accessory.whiteChefHat', "White Chef Hat"),
			atlasName: 'white-chef-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.SessionArchived,
		title: localize('chatPet.achievement.sessionArchived.title', "Wrapped Up"),
		description: localize('chatPet.achievement.sessionArchived.description', "You archived an agent session."),
		hint: localize('chatPet.achievement.sessionArchived.hint', "Finished work deserves a tidy ending."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.SantaHat,
			label: localize('chatPet.accessory.santaHat', "Santa Hat"),
			atlasName: 'santa-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.AgentChangesReviewed,
		title: localize('chatPet.achievement.agentChangesReviewed.title', "Trust but Verify"),
		description: localize('chatPet.achievement.agentChangesReviewed.description', "You opened agent changes for review."),
		hint: localize('chatPet.achievement.agentChangesReviewed.hint', "Take a closer look before keeping the changes."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.RiceHat,
			label: localize('chatPet.accessory.riceHat', "Rice Hat"),
			atlasName: 'rice-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.ChatReferenceOpened,
		title: localize('chatPet.achievement.chatReferenceOpened.title', "Follow the Trail"),
		description: localize('chatPet.achievement.chatReferenceOpened.description', "You opened a file or code reference from Chat."),
		hint: localize('chatPet.achievement.chatReferenceOpened.hint', "Useful answers often point somewhere worth exploring."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.StrawHat,
			label: localize('chatPet.accessory.strawHat', "Straw Hat"),
			atlasName: 'straw-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.UsefulOutputCopied,
		title: localize('chatPet.achievement.usefulOutputCopied.title', "Copy That"),
		description: localize('chatPet.achievement.usefulOutputCopied.description', "You copied useful output from Chat."),
		hint: localize('chatPet.achievement.usefulOutputCopied.hint', "Keep something useful from a chat response."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.PinkPartyHat,
			label: localize('chatPet.accessory.pinkPartyHat', "Pink Party Hat"),
			atlasName: 'pink-party-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.AutopilotEnabled,
		title: localize('chatPet.achievement.autopilotEnabled.title', "Party Mode"),
		description: localize('chatPet.achievement.autopilotEnabled.description', "You switched an agent session from Interactive to Autopilot."),
		hint: localize('chatPet.achievement.autopilotEnabled.hint', "Some work is ready to carry on with less steering."),
		enabled: true,
		accessories: [{
			id: ChatPetAccessoryIds.WizardHat,
			label: localize('chatPet.accessory.wizardHat', "Wizard Hat"),
			atlasName: 'wizard-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
];

export const disabledChatPetAchievements: readonly IChatPetAchievement[] = [
	{
		id: ChatPetAchievementIds.InstructionPresent,
		title: localize('chatPet.achievement.instructionPresent.title', "Well Instructed"),
		description: localize('chatPet.achievement.instructionPresent.description', "You added custom instructions."),
		hint: localize('chatPet.achievement.instructionPresent.hint', "Leave Chat some standing guidance of your own."),
		enabled: false,
		accessories: [{
			id: ChatPetAccessoryIds.SailorHat,
			label: localize('chatPet.accessory.sailorHat', "Light Sailor Hat"),
			atlasName: 'sailor-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.QueueOrSteeringMessage,
		title: localize('chatPet.achievement.queueOrSteeringMessage.title', "Course Correction"),
		description: localize('chatPet.achievement.queueOrSteeringMessage.description', "You queued or steered a follow-up message while chat was working."),
		hint: localize('chatPet.achievement.queueOrSteeringMessage.hint', "Try changing course before the current response finishes."),
		enabled: false,
		accessories: [{
			id: ChatPetAccessoryIds.SpinnerHat,
			label: localize('chatPet.accessory.spinnerHat', "Full-Size Spinner Hat"),
			atlasName: 'full-size-spinner-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.ChatOutputCopied,
		title: localize('chatPet.achievement.chatOutputCopied.title', "Copy That"),
		description: localize('chatPet.achievement.chatOutputCopied.description', "You copied output from chat."),
		hint: localize('chatPet.achievement.chatOutputCopied.hint', "Keep something useful from a chat response."),
		enabled: false,
		accessories: [{
			id: ChatPetAccessoryIds.PartyHat,
			label: localize('chatPet.accessory.partyHat', "Leaning Party Hat"),
			atlasName: 'leaning-party-hat',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
	{
		id: ChatPetAchievementIds.ImageRequest,
		title: localize('chatPet.achievement.imageRequest.title', "Picture This"),
		description: localize('chatPet.achievement.imageRequest.description', "You sent a chat request with an image attached."),
		hint: localize('chatPet.achievement.imageRequest.hint', "Show Chat something instead of only describing it."),
		enabled: false,
		accessories: [{
			id: ChatPetAccessoryIds.ArtistBeret,
			label: localize('chatPet.accessory.artistBeret', "Artist Beret"),
			atlasName: 'artist-beret',
			atlasCellSize: 96,
			coversAntennae: true,
		}],
	},
];

export const allChatPetAchievements: readonly IChatPetAchievement[] = [...enabledChatPetAchievements, ...disabledChatPetAchievements];
export const chatPetAchievements: readonly IChatPetAchievement[] = allChatPetAchievements.filter(achievement => achievement.enabled);

const chatPetAchievementIds = new Set<string>(chatPetAchievements.map(achievement => achievement.id));
const allChatPetAchievementIds = new Set<string>(allChatPetAchievements.map(achievement => achievement.id));
export const chatPetAccessories: readonly IChatPetAccessory[] = chatPetAchievements.flatMap(achievement => achievement.accessories);
export const allChatPetAccessories: readonly IChatPetAccessory[] = allChatPetAchievements.flatMap(achievement => achievement.accessories);
const chatPetAccessoryById = new Map(chatPetAccessories.map(accessory => [accessory.id, accessory]));
const allChatPetAccessoryById = new Map(allChatPetAccessories.map(accessory => [accessory.id, accessory]));

export function isChatPetAchievementId(value: string): value is ChatPetAchievementId {
	return allChatPetAchievementIds.has(value);
}

export function isChatPetAchievementEnabled(id: ChatPetAchievementId): boolean {
	return chatPetAchievementIds.has(id);
}

export function isChatPetAccessoryId(value: string): value is ChatPetAccessoryId {
	return allChatPetAccessoryById.has(value as ChatPetAccessoryId);
}

export function getChatPetAchievement(id: ChatPetAchievementId): IChatPetAchievement {
	const achievement = chatPetAchievements.find(candidate => candidate.id === id);
	if (!achievement) {
		throw new Error(`Unknown chat pet achievement: ${id}`);
	}
	return achievement;
}

export function getChatPetAccessory(id: ChatPetAccessoryId): IChatPetAccessory {
	const accessory = chatPetAccessoryById.get(id);
	if (!accessory) {
		throw new Error(`Unknown chat pet accessory: ${id}`);
	}
	return accessory;
}

export function getChatPetAchievementForAccessory(id: ChatPetAccessoryId): IChatPetAchievement {
	const achievement = allChatPetAchievements.find(candidate => candidate.accessories.some(accessory => accessory.id === id));
	if (!achievement) {
		throw new Error(`No chat pet achievement rewards accessory: ${id}`);
	}
	return achievement;
}

export function didExplicitlySwitchChatPetModel(previousModelIdentifier: string | undefined, selectedModelIdentifier: string): boolean {
	return previousModelIdentifier !== undefined && previousModelIdentifier !== selectedModelIdentifier;
}

export function didExplicitlyEnableChatPetAutopilot(previousMode: string, selectedMode: string): boolean {
	return previousMode === 'interactive' && selectedMode === 'autopilot';
}

export function hasChatPetImageAttachment(entries: readonly { readonly kind: string }[]): boolean {
	return entries.some(entry => entry.kind === 'image');
}

export function shouldUnlockChatPetIntegratedBrowserShare(shared: boolean, succeeded: boolean): boolean {
	return shared && succeeded;
}

export function isUserAuthoredChatPetCustomization(source: AICustomizationSource, isBuiltin: boolean | undefined): boolean {
	return !isBuiltin && (source === 'local' || source === 'user');
}

export function getChatPetCustomizationAchievementIds(
	skills: readonly { readonly source: AICustomizationSource; readonly isBuiltin?: boolean }[],
	instructions: readonly { readonly source: AICustomizationSource; readonly isBuiltin?: boolean }[],
	mcpServerCount: number,
): readonly ChatPetAchievementId[] {
	const achievements: ChatPetAchievementId[] = [];
	if (skills.some(item => isUserAuthoredChatPetCustomization(item.source, item.isBuiltin))) {
		achievements.push(ChatPetAchievementIds.CustomSkillPresent);
	}
	if (instructions.some(item => isUserAuthoredChatPetCustomization(item.source, item.isBuiltin))) {
		achievements.push(ChatPetAchievementIds.InstructionPresent);
	}
	if (mcpServerCount > 0) {
		achievements.push(ChatPetAchievementIds.McpServerPresent);
	}
	return achievements;
}

export function getChatPetAchievementPresentation(achievement: IChatPetAchievement, unlocked: boolean): ChatPetAchievementPresentation {
	return unlocked
		? {
			locked: false,
			id: achievement.id,
			title: achievement.title,
			description: achievement.description,
			accessories: achievement.accessories,
		}
		: {
			locked: true,
			id: achievement.id,
			hint: achievement.hint,
			rewardLabels: achievement.accessories.map(accessory => accessory.label),
		};
}

export function getUnlockedChatPetAccessories(unlockedAchievements: readonly ChatPetAchievementId[]): readonly IChatPetAccessory[] {
	const unlocked = new Set(unlockedAchievements);
	return chatPetAchievements
		.filter(achievement => unlocked.has(achievement.id))
		.flatMap(achievement => achievement.accessories);
}
