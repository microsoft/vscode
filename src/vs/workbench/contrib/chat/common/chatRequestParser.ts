/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequestPart } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

const variableOrAgentReg = /(^|\s)(@)([\w_\-]+)(:\d+)?(?=(\s|$))/i; // An @-variable with an optional numeric : arg (@response:2)
const slashReg = /(^|\s)(\/)([\w_-]+)(?=(\s|$))/i; // A / command

export async function parseChatRequest(accessor: ServicesAccessor, sessionId: string, message: string): Promise<IParsedChatRequestPart[]> {
	const agentService = accessor.get(IChatAgentService);
	const variableService = accessor.get(IChatVariablesService);
	const chatService = accessor.get(IChatService);

	let lastIndex = 0;

	const parts: IParsedChatRequestPart[] = [];
	while (true) {
		const remainingMessage = message.slice(lastIndex);
		const nextVariableMatch = remainingMessage.match(variableOrAgentReg);
		const nextSlashMatch = remainingMessage.match(slashReg);

		if (nextVariableMatch && nextSlashMatch && (nextVariableMatch.index! < nextSlashMatch.index!) || (!nextSlashMatch && nextVariableMatch)) {
			// Handle the next variable or agent
			const [full, leading, _triggerChar, name] = nextVariableMatch;
			const variableArg = nextVariableMatch[3] ?? '';
			const varStart = lastIndex + nextVariableMatch.index! + leading.length;
			const consumedText = remainingMessage.slice(0, varStart);
			if (consumedText) {
				parts.push(new ChatRequestTextPart(new OffsetRange(lastIndex, lastIndex + varStart), consumedText));
			}

			const varRange = new OffsetRange(varStart, varStart + full.length - leading.length);
			let agent: IChatAgentData | undefined;
			if ((agent = agentService.getAgent(name)) && !variableArg) {
				if (parts.some(p => p instanceof ChatRequestAgentPart)) {
					// Only one agent allowed
					parts.push(new ChatRequestTextPart(varRange, full.slice(leading.length)));
				} else {
					parts.push(new ChatRequestAgentPart(varRange, agent));
				}
			} else if (variableService.hasVariable(name)) {
				parts.push(new ChatRequestVariablePart(varRange, name, variableArg));
			} else {
				parts.push(new ChatRequestTextPart(varRange, full.slice(leading.length)));
			}

			lastIndex += nextVariableMatch.index! + full.length;
		} else if (nextVariableMatch && nextSlashMatch && nextSlashMatch.index! < nextVariableMatch.index! || (!nextVariableMatch && nextSlashMatch)) {
			// Handle the next slash command
			const [full, leading, _triggerChar, command] = nextSlashMatch;
			const varStart = lastIndex + nextSlashMatch.index! + leading.length;
			const consumedText = remainingMessage.slice(0, varStart);
			if (consumedText) {
				parts.push(new ChatRequestTextPart(new OffsetRange(lastIndex, lastIndex + varStart), consumedText));
			}

			const slashRange = new OffsetRange(varStart, varStart + full.length - leading.length);
			const usedAgent = parts.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
			if (usedAgent) {
				const subCommand = usedAgent.agent.metadata.subCommands.find(c => c.name === command);
				if (subCommand) {
					// Valid agent subcommand
					parts.push(new ChatRequestAgentSubcommandPart(slashRange, subCommand));
				} else {
					// Unrecognized subcommand
					parts.push(new ChatRequestTextPart(slashRange, full.slice(leading.length)));
				}
			} else {
				const slashCommands = await chatService.getSlashCommands(sessionId, CancellationToken.None);
				const slashCommand = slashCommands.find(c => c.command === command);
				if (slashCommand) {
					// Valid standalone slash command
					parts.push(new ChatRequestSlashCommandPart(slashRange, slashCommand));
				} else {
					// Unrecognized slash command
					parts.push(new ChatRequestTextPart(slashRange, full.slice(leading.length)));
				}
			}

			lastIndex += nextSlashMatch.index! + full.length;
		} else {
			parts.push(new ChatRequestTextPart(new OffsetRange(lastIndex, lastIndex + remainingMessage.length), remainingMessage));
			break;
		}
	}

	return parts;
}
