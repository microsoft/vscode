/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentData } from '../participants/chatAgents.js';
import { ChatRequestModel, IChatRequestVariableData } from '../model/chatModel.js';
import { ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart } from '../requestParser/chatParserTypes.js';
import { ChatAgentVoteDirection, ChatCopyKind, IChatSendRequestOptions, IChatUserActionEvent } from './chatService.js';
import { isImageVariableEntry } from '../attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../constants.js';
import { ILanguageModelsService } from '../languageModels.js';

type ChatVoteEvent = {
	direction: 'up' | 'down';
	agentId: string;
	command: string | undefined;
	reason: string | undefined;
};

type ChatVoteClassification = {
	direction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user voted up or down.' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat agent that this vote is for.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the slash command that this vote is for.' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason selected by the user for voting down.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of Chat agents.';
};

type ChatCopyEvent = {
	copyKind: 'action' | 'toolbar';
	agentId: string;
	command: string | undefined;
};

type ChatCopyClassification = {
	copyKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the copy was initiated.' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat agent that the copy acted on.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the slash command the copy acted on.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatInsertEvent = {
	newFile: boolean;
	agentId: string;
	command: string | undefined;
};

type ChatInsertClassification = {
	newFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the code was inserted into a new untitled file.' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat agent that this insertion is for.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the slash command that this insertion is for.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatApplyEvent = {
	newFile: boolean;
	agentId: string;
	command: string | undefined;
	codeMapper: string | undefined;
	editsProposed: boolean;
};

type ChatApplyClassification = {
	newFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the code was inserted into a new untitled file.' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat agent that this insertion is for.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the slash command that this insertion is for.' };
	codeMapper: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The code mapper that wa used to compute the edit.' };
	editsProposed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether there was a change proposed to the user.' };
	owner: 'aeschli';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatFollowupEvent = {
	agentId: string;
	command: string | undefined;
};

type ChatFollowupClassification = {
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the related chat agent.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the related slash command.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatTerminalEvent = {
	languageId: string;
	agentId: string;
	command: string | undefined;
};

type ChatTerminalClassification = {
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language of the code that was run in the terminal.' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the related chat agent.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the related slash command.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatFollowupsRetrievedEvent = {
	agentId: string;
	command: string | undefined;
	numFollowups: number;
};

type ChatFollowupsRetrievedClassification = {
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the related chat agent.' };
	command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the related slash command.' };
	numFollowups: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of followup prompts returned by the agent.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatEditHunkEvent = {
	agentId: string;
	outcome: 'accepted' | 'rejected';
	lineCount: number;
	hasRemainingEdits: boolean;
};

type ChatEditHunkClassification = {
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the related chat agent.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The outcome of the edit hunk action.' };
	lineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of lines in the relevant change.' };
	hasRemainingEdits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether there are remaining edits in the file after this action.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

export type ChatProviderInvokedEvent = {
	timeToFirstProgress: number | undefined;
	totalTime: number | undefined;
	result: 'success' | 'error' | 'errorWithOutput' | 'cancelled' | 'filtered';
	requestType: 'string' | 'followup' | 'slashCommand';
	chatSessionId: string;
	agent: string;
	agentExtensionId: string | undefined;
	slashCommand: string | undefined;
	location: ChatAgentLocation;
	citations: number;
	numCodeBlocks: number;
	isParticipantDetected: boolean;
	enableCommandDetection: boolean;
	attachmentKinds: string[];
	model: string | undefined;
};

export type ChatProviderInvokedClassification = {
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The time in milliseconds from invoking the provider to getting the first data.' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The total time it took to run the provider\'s `provideResponseWithProgress`.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the ChatProvider resulted in an error.' };
	requestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of request that the user made.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random ID for the session.' };
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of agent used.' };
	agentExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the agent.' };
	slashCommand?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of slashCommand used.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location at which chat request was made.' };
	citations: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of public code citations that were returned with the response.' };
	numCodeBlocks: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of code blocks in the response.' };
	isParticipantDetected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the participant was automatically detected.' };
	enableCommandDetection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether participation detection was disabled for this invocation.' };
	attachmentKinds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The types of variables/attachments that the user included with their query.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model used to generate the response.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of Chat agents.';
};

export class ChatServiceTelemetry {
	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	notifyUserAction(action: IChatUserActionEvent): void {
		if (action.action.kind === 'vote') {
			this.telemetryService.publicLog2<ChatVoteEvent, ChatVoteClassification>('interactiveSessionVote', {
				direction: action.action.direction === ChatAgentVoteDirection.Up ? 'up' : 'down',
				agentId: action.agentId ?? '',
				command: action.command,
				reason: action.action.reason,
			});
		} else if (action.action.kind === 'copy') {
			this.telemetryService.publicLog2<ChatCopyEvent, ChatCopyClassification>('interactiveSessionCopy', {
				copyKind: action.action.copyKind === ChatCopyKind.Action ? 'action' : 'toolbar',
				agentId: action.agentId ?? '',
				command: action.command,
			});
		} else if (action.action.kind === 'insert') {
			this.telemetryService.publicLog2<ChatInsertEvent, ChatInsertClassification>('interactiveSessionInsert', {
				newFile: !!action.action.newFile,
				agentId: action.agentId ?? '',
				command: action.command,
			});
		} else if (action.action.kind === 'apply') {
			this.telemetryService.publicLog2<ChatApplyEvent, ChatApplyClassification>('interactiveSessionApply', {
				newFile: !!action.action.newFile,
				codeMapper: action.action.codeMapper,
				agentId: action.agentId ?? '',
				command: action.command,
				editsProposed: !!action.action.editsProposed,
			});
		} else if (action.action.kind === 'runInTerminal') {
			this.telemetryService.publicLog2<ChatTerminalEvent, ChatTerminalClassification>('interactiveSessionRunInTerminal', {
				languageId: action.action.languageId ?? '',
				agentId: action.agentId ?? '',
				command: action.command,
			});
		} else if (action.action.kind === 'followUp') {
			this.telemetryService.publicLog2<ChatFollowupEvent, ChatFollowupClassification>('chatFollowupClicked', {
				agentId: action.agentId ?? '',
				command: action.command,
			});
		} else if (action.action.kind === 'chatEditingHunkAction') {
			this.telemetryService.publicLog2<ChatEditHunkEvent, ChatEditHunkClassification>('chatEditHunk', {
				agentId: action.agentId ?? '',
				outcome: action.action.outcome,
				lineCount: action.action.lineCount,
				hasRemainingEdits: action.action.hasRemainingEdits,
			});
		}
	}

	retrievedFollowups(agentId: string, command: string | undefined, numFollowups: number): void {
		this.telemetryService.publicLog2<ChatFollowupsRetrievedEvent, ChatFollowupsRetrievedClassification>('chatFollowupsRetrieved', {
			agentId,
			command,
			numFollowups,
		});
	}
}

function getCodeBlocks(text: string): string[] {
	const lines = text.split('\n');
	const codeBlockLanguages: string[] = [];

	let codeBlockState: undefined | { readonly delimiter: string; readonly languageId: string };
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (codeBlockState) {
			if (new RegExp(`^\\s*${codeBlockState.delimiter}\\s*$`).test(line)) {
				codeBlockLanguages.push(codeBlockState.languageId);
				codeBlockState = undefined;
			}
		} else {
			const match = line.match(/^(\s*)(`{3,}|~{3,})(\w*)/);
			if (match) {
				codeBlockState = { delimiter: match[2], languageId: match[3] };
			}
		}
	}
	return codeBlockLanguages;
}

export class ChatRequestTelemetry {
	private isComplete = false;

	constructor(private readonly opts: {
		agent: IChatAgentData;
		agentSlashCommandPart: ChatRequestAgentSubcommandPart | undefined;
		commandPart: ChatRequestSlashCommandPart | undefined;
		sessionId: string;
		location: ChatAgentLocation;
		options: IChatSendRequestOptions | undefined;
		enableCommandDetection: boolean;
	},
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService
	) { }

	complete({ timeToFirstProgress, totalTime, result, requestType, request, detectedAgent }: {
		timeToFirstProgress: number | undefined;
		totalTime: number | undefined;
		result: ChatProviderInvokedEvent['result'];
		requestType: ChatProviderInvokedEvent['requestType'];
		// Should rearrange so these 2 can be in the constructor
		request: ChatRequestModel;
		detectedAgent: IChatAgentData | undefined;
	}) {
		if (this.isComplete) {
			return;
		}

		this.isComplete = true;
		this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
			timeToFirstProgress,
			totalTime,
			result,
			requestType,
			agent: detectedAgent?.id ?? this.opts.agent.id,
			agentExtensionId: detectedAgent?.extensionId.value ?? this.opts.agent.extensionId.value,
			slashCommand: this.opts.agentSlashCommandPart ? this.opts.agentSlashCommandPart.command.name : this.opts.commandPart?.slashCommand.command,
			chatSessionId: this.opts.sessionId,
			enableCommandDetection: this.opts.enableCommandDetection,
			isParticipantDetected: !!detectedAgent,
			location: this.opts.location,
			citations: request.response?.codeCitations.length ?? 0,
			numCodeBlocks: getCodeBlocks(request.response?.response.toString() ?? '').length,
			attachmentKinds: this.attachmentKindsForTelemetry(request.variableData),
			model: this.resolveModelId(this.opts.options?.userSelectedModelId),
		});
	}

	private attachmentKindsForTelemetry(variableData: IChatRequestVariableData): string[] {
		// this shows why attachments still have to be cleaned up somewhat
		return variableData.variables.map(v => {
			if (v.kind === 'implicit') {
				return 'implicit';
			} else if (v.range) {
				// 'range' is range within the prompt text
				if (v.kind === 'tool') {
					return 'toolInPrompt';
				} else if (v.kind === 'toolset') {
					return 'toolsetInPrompt';
				} else {
					return 'fileInPrompt';
				}
			} else if (v.kind === 'command') {
				return 'command';
			} else if (v.kind === 'symbol') {
				return 'symbol';
			} else if (isImageVariableEntry(v)) {
				return 'image';
			} else if (v.kind === 'directory') {
				return 'directory';
			} else if (v.kind === 'tool') {
				return 'tool';
			} else if (v.kind === 'toolset') {
				return 'toolset';
			} else {
				if (URI.isUri(v.value)) {
					return 'file';
				} else if (isLocation(v.value)) {
					return 'location';
				} else {
					return 'otherAttachment';
				}
			}
		});
	}

	private resolveModelId(userSelectedModelId: string | undefined): string | undefined {
		return userSelectedModelId && this.languageModelsService.lookupLanguageModel(userSelectedModelId)?.id;
	}
}
