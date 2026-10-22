/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { ILogService } from '../../../log/common/log.js';
import { COMPUTER_USE_ACTIVATION_QUESTION_ID, COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH, type ComputerUseActivationChoice } from '../../common/computerUse.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { getComputerUseActivationMessage, isComputerUseActivationAccepted, withComputerUseActivationCard } from '../../common/meta/computerUse.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../../common/state/sessionState.js';
import { COMPUTER_USE_PLUGIN_NAME } from './copilotComputerUsePlugin.js';

export const COMPUTER_USE_ACTIVATION_TOOL_NAME = 'enable_computer_use';

const description = 'Ask the user to turn on Computer Use, which gives you tools to see and operate apps on the user\'s computer: list apps, read their windows, click, type, and scroll. Call this when the task needs a desktop app that your other tools can\'t reach. Don\'t call it for files, shell commands, or web pages that other tools can handle. Turning it on is saved for Copilot on this computer, not only for this chat. The user decides in a card. When they turn it on, the Computer Use tools are available as soon as this call returns. If they decline, don\'t call this again in this chat.';

/** The Copilot runtime's record of a plugin, as `plugins.list` reports it. */
export interface ICopilotRuntimePlugin {
	readonly name: string;
	/** `builtin` for plugins the host registered as trusted built-ins. */
	readonly source?: string;
	readonly enabled: boolean;
}

/** What turning on Computer Use needs from the chat whose agent asks. Implemented by the Copilot chat session. */
export interface IComputerUseActivationChat {
	/** The runtime's plugins; empty when VS Code doesn't offer Computer Use. */
	listPlugins(): Promise<readonly ICopilotRuntimePlugin[]>;
	/** Turns Computer Use on for Copilot, as `/computer on` does: the runtime saves the choice and starts its tools in every session. */
	enablePlugin(): Promise<void>;
	/** Whether someone can answer a card in this chat now. Not outside a running turn, in autopilot, or with automatic replies. */
	canAskUser(): boolean;
	/** Adds the request to the chat's running turn. */
	requestInput(request: ChatInputRequest): void;
}

/**
 * How a call to {@link COMPUTER_USE_ACTIVATION_TOOL_NAME} ended:
 * - `turnedOn`: the user turned Computer Use on, and its tools are available.
 * - `alreadyOn`: it was on already, e.g. turned on in another chat or with `/computer on`.
 * - `declined`, `declinedEarlier`: the user said no now, or earlier in this chat.
 * - `blocked`: the user's organization turned it off.
 * - `unavailable`: the runtime doesn't have the built-in plugin.
 * - `unattended`: no one can answer a card in this chat now, e.g. in autopilot or after its turn ended.
 * - `cancelled`: the turn ended before the user answered.
 * - `failed`: the runtime didn't turn it on.
 */
type ComputerUseActivationOutcome = 'turnedOn' | 'alreadyOn' | 'declined' | 'declinedEarlier' | 'blocked' | 'unavailable' | 'unattended' | 'cancelled' | 'failed';

const outcomeResults: { readonly [K in ComputerUseActivationOutcome]: ToolResultObject } = {
	turnedOn: { resultType: 'success', textResultForLlm: 'Computer Use is on. Its tools, from the computer-use MCP server, are available now.' },
	alreadyOn: { resultType: 'success', textResultForLlm: 'Computer Use is already on. Use the tools from the computer-use MCP server.' },
	declined: { resultType: 'success', textResultForLlm: 'The user chose not to turn on Computer Use. Continue without it, and don\'t ask again in this chat. If they ask for it later, tell them they can turn it on with /computer on.' },
	declinedEarlier: { resultType: 'success', textResultForLlm: 'The user already chose not to turn on Computer Use in this chat. Continue without it. If they ask for it, tell them they can turn it on with /computer on.' },
	blocked: { resultType: 'failure', textResultForLlm: 'The user\'s organization turned off Computer Use, so it can\'t be turned on. Continue without it.' },
	unavailable: { resultType: 'failure', textResultForLlm: 'Computer Use isn\'t available in this chat. Continue without it.' },
	unattended: { resultType: 'failure', textResultForLlm: 'Computer Use is off, and no one can turn it on while this chat runs unattended. Continue without it, and tell the user they can turn it on with /computer on.' },
	cancelled: { resultType: 'failure', textResultForLlm: 'The request to turn on Computer Use was cancelled.' },
	failed: { resultType: 'failure', textResultForLlm: 'Computer Use couldn\'t be turned on. Continue without it.' },
};

interface IActivationAnswer {
	readonly response: ChatInputResponseKind;
	readonly answers?: Record<string, ChatInputAnswer>;
}

/** Whether a session's effective managed settings, as the runtime reports them, turn Computer Use off. */
export function isComputerUseTurnedOffByPolicy(settings: unknown): boolean {
	const features = settings && typeof settings === 'object' ? (settings as { readonly features?: unknown }).features : undefined;
	return !!features && typeof features === 'object' && (features as { readonly computerUse?: unknown }).computerUse === false;
}

/**
 * Lets the agent of one chat ask the user to turn on Computer Use, which the Copilot runtime keeps off until the user
 * opts in. The tool is offered while the runtime has the built-in plugin and it is off; the user answers in a card, and
 * the tools are available in the same turn. After a decline the chat doesn't show the card again, but the user can still
 * turn Computer Use on with `/computer on`.
 */
export class CopilotComputerUseActivation {

	private readonly _pending = new PendingRequestRegistry<IActivationAnswer>();
	private _asking: Promise<ComputerUseActivationOutcome> | undefined;
	private _declined = false;
	private _blockedByPolicy = false;

	constructor(
		private readonly _chat: IComputerUseActivationChat,
		private readonly _logPrefix: string,
		private readonly _logService: ILogService,
	) { }

	/** The tools to launch the chat's session with: the activation tool while the runtime has Computer Use and it is off. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async createTools(): Promise<Tool<any>[]> {
		try {
			const plugin = await this._getPlugin();
			return plugin && !plugin.enabled ? [this._createTool()] : [];
		} catch (error) {
			this._logService.warn(`${this._logPrefix} Could not check whether Computer Use is on: ${getErrorMessage(error)}`);
			return [];
		}
	}

	/** Records the session's effective managed settings; see {@link isComputerUseTurnedOffByPolicy}. */
	observeManagedSettings(settings: unknown): void {
		this._blockedByPolicy = isComputerUseTurnedOffByPolicy(settings);
	}

	/** Settles the pending request `requestId`, if it is this chat's; returns whether it was. */
	respondToInput(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): boolean {
		return this._pending.respond(requestId, { response, answers });
	}

	/** Cancels the request waiting for an answer, e.g. when its turn ends. */
	cancel(): void {
		this._pending.denyAll({ response: ChatInputResponseKind.Cancel });
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createTool(): Tool<any> {
		return {
			name: COMPUTER_USE_ACTIVATION_TOOL_NAME,
			description,
			parameters: {
				type: 'object',
				properties: {
					reason: { type: 'string', description: 'One short sentence telling the user what you will do with Computer Use, such as "Open Calculator and add up the invoice totals."' },
				},
				required: ['reason'],
				additionalProperties: false,
			},
			// The tool asks the user itself.
			skipPermission: true,
			defer: 'never',
			metadata: {
				'github.com/copilot:safeForTelemetry': { name: true, inputsNames: false },
			},
			handler: async (args: unknown): Promise<ToolResultObject> => {
				try {
					const outcome = await this._activate(readReason(args));
					this._logService.info(`${this._logPrefix} Computer Use activation: ${outcome}`);
					return outcomeResults[outcome];
				} catch (error) {
					const message = getErrorMessage(error);
					this._logService.warn(`${this._logPrefix} Could not turn on Computer Use: ${message}`);
					return { resultType: 'failure', textResultForLlm: `Computer Use couldn't be turned on: ${message}. Continue without it.`, error: message };
				}
			},
		};
	}

	/** A call made while the user decides waits for the same answer. */
	private _activate(reason: string | undefined): Promise<ComputerUseActivationOutcome> {
		this._asking ??= this._ask(reason).finally(() => this._asking = undefined);
		return this._asking;
	}

	private async _ask(reason: string | undefined): Promise<ComputerUseActivationOutcome> {
		const plugin = await this._getPlugin();
		if (!plugin) {
			return 'unavailable';
		}
		if (plugin.enabled) {
			return 'alreadyOn';
		}
		if (this._declined) {
			return 'declinedEarlier';
		}
		if (this._blockedByPolicy) {
			return 'blocked';
		}
		if (!this._chat.canAskUser()) {
			return 'unattended';
		}
		const requestId = generateUuid();
		const answer = this._pending.register(requestId);
		this._chat.requestInput(createActivationRequest(requestId, reason));
		const { response, answers } = await answer;
		if (response === ChatInputResponseKind.Cancel) {
			return 'cancelled';
		}
		if (!isComputerUseActivationAccepted(response, answers)) {
			this._declined = true;
			return 'declined';
		}
		await this._chat.enablePlugin();
		return (await this._getPlugin())?.enabled ? 'turnedOn' : 'failed';
	}

	private async _getPlugin(): Promise<ICopilotRuntimePlugin | undefined> {
		return (await this._chat.listPlugins()).find(plugin => plugin.name === COMPUTER_USE_PLUGIN_NAME && plugin.source === 'builtin');
	}
}

function readReason(args: unknown): string | undefined {
	const reason = args && typeof args === 'object' ? (args as { readonly reason?: unknown }).reason : undefined;
	return typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH) : undefined;
}

/** A standard yes/no question that VS Code shows as a compact card; other clients answer the question itself. */
function createActivationRequest(requestId: string, reason: string | undefined): ChatInputRequest {
	const turnOn: ComputerUseActivationChoice = 'turnOn';
	const notNow: ComputerUseActivationChoice = 'notNow';
	return withComputerUseActivationCard(withChatInputRequestPurpose({
		id: requestId,
		message: getComputerUseActivationMessage(reason),
		questions: [{
			kind: ChatInputQuestionKind.SingleSelect,
			id: COMPUTER_USE_ACTIVATION_QUESTION_ID,
			title: localize('computerUseActivation.title', "Computer Use"),
			message: localize('computerUseActivation.question', "Turn on Computer Use?"),
			required: true,
			allowFreeformInput: false,
			options: [
				{ id: turnOn, label: localize('computerUseActivation.turnOn', "Turn On"), recommended: true },
				{ id: notNow, label: localize('computerUseActivation.notNow', "Not Now") },
			],
		}],
	}, ChatInputRequestPurpose.Elicitation), reason ? { reason } : {});
}
