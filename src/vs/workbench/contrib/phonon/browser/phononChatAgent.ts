/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPhononService } from '../common/phonon.js';
import { IPhononAgentPoolService } from '../common/phononAgentPool.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import {
	IChatAgentHistoryEntry,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
} from '../../chat/common/participants/chatAgents.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import {
	ChatMessageRole,
	IChatMessage,
	IChatMessagePart,
	ILanguageModelsService,
} from '../../chat/common/languageModels.js';
import { IChatFollowup, IChatProgress } from '../../chat/common/chatService/chatService.js';

export class PhononChatAgentImpl extends Disposable implements IChatAgentImplementation {

	private readonly _onDidSoloOutput = this._register(new Emitter<string>());
	/**
	 * Fires with accumulated text when a solo-mode API call completes.
	 * Used by PhononMcpBridge to intercept composition intents from solo output.
	 */
	readonly onDidSoloOutput: Event<string> = this._onDidSoloOutput.event;

	constructor(
		@IPhononService private readonly phononService: IPhononService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@IPhononAgentPoolService private readonly agentPoolService: IPhononAgentPoolService,
		@ILiquidModuleRegistry private readonly liquidModuleRegistry: ILiquidModuleRegistry,
	) {
		super();
	}

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		const stopWatch = StopWatch.create(false);

		if (!this.phononService.isConfigured) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(
					'**Phonon IDE** needs the Claude CLI or an API key.\n\n' +
					'**Option 1 (recommended):** Install [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) - uses your Max subscription.\n\n' +
					'**Option 2:** Run **Phonon: Set API Key** from the Command Palette (`Cmd+Shift+P`) with a key from [console.anthropic.com](https://console.anthropic.com/).'
				),
			}]);

			return {
				timings: { totalElapsed: stopWatch.elapsed() },
			};
		}

		// Auto-spawn analysis: decides solo vs team mode
		try {
			const result = await this.agentPoolService.submitPrompt(request.message);

			if (result.mode === 'solo') {
				return this._directApiCall(request, progress, history, stopWatch, token);
			}

			// Team mode -- stream all agent activity via native ChatWidget progress
			return this._streamTeamActivity(progress, stopWatch, token);
		} catch (err) {
			this.logService.error('[Phonon] submitPrompt failed, falling back to solo:', err);
			return this._directApiCall(request, progress, history, stopWatch, token);
		}
	}

	/**
	 * Stream team activity into the ChatWidget via native IChatProgress emissions.
	 * Listens to agent pool events and translates them into progress updates.
	 */
	private _streamTeamActivity(
		progress: (parts: IChatProgress[]) => void,
		stopWatch: StopWatch,
		token: CancellationToken,
	): Promise<IChatAgentResult> {
		return new Promise<IChatAgentResult>(resolve => {
			const lastRenderedLength = new Map<string, number>();

			// Emit initial spawn status with shimmer loading indicator
			progress([{
				kind: 'progressMessage',
				content: new MarkdownString('*Analyzing task and spawning team...*'),
				shimmer: true,
			}]);

			// Listen for auto-spawn event
			const spawnListener = this.agentPoolService.onDidAutoSpawn(({ workers, reasoning }) => {
				this.logService.info(`[Phonon] Auto-spawn: ${reasoning}`);
				progress([{
					kind: 'progressMessage',
					content: new MarkdownString(`*Team spawned: master + ${workers.join(', ')}*`),
				}]);
			});

			// Listen for delegations
			const delegationListener = this.agentPoolService.onDidDelegation(({ toRole, prompt: task }) => {
				const truncated = task.length > 120 ? task.substring(0, 120) + '...' : task;
				progress([{
					kind: 'markdownContent',
					content: new MarkdownString(`> **\u2192 ${toRole}:** ${truncated}`),
				}]);
			});

			// Listen for agent output (streaming)
			const outputListener = this.agentPoolService.onDidAgentOutput(({ agentId, isFinal }) => {
				if (isFinal) { return; }

				const agent = this.agentPoolService.agents.find(a => a.id === agentId);
				if (!agent) { return; }

				const prevLen = lastRenderedLength.get(agentId) ?? 0;
				const newText = agent.outputSoFar.substring(prevLen);

				if (newText) {
					progress([{
						kind: 'markdownContent',
						content: new MarkdownString(newText),
					}]);
					lastRenderedLength.set(agentId, agent.outputSoFar.length);
				}
			});

			const cleanup = () => {
				spawnListener.dispose();
				delegationListener.dispose();
				outputListener.dispose();
				statusListener.dispose();
				cancelListener.dispose();
			};

			// Register cancellation listener so late cancellations resolve the promise
			const cancelListener = token.onCancellationRequested(() => {
				cleanup();
				resolve({ timings: { totalElapsed: stopWatch.elapsed() } });
			});

			// Wait for all agents to complete
			const statusListener = this.agentPoolService.onDidAgentStatusChange((agent) => {
				if (agent.role === 'master' && (agent.status === 'done' || agent.status === 'error')) {
					// Check if all agents are finished
					const allDone = this.agentPoolService.agents.every(
						a => a.status === 'done' || a.status === 'error' || a.status === 'idle'
					);
					if (allDone) {
						cleanup();
						resolve({
							timings: { totalElapsed: stopWatch.elapsed() },
							errorDetails: agent.status === 'error'
								? { message: 'Agent team encountered an error' }
								: undefined,
						});
					}
				}
			});
		});
	}

	/**
	 * Direct API call -- no agent pool, solo mode.
	 */
	private async _directApiCall(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		stopWatch: StopWatch,
		token: CancellationToken,
	): Promise<IChatAgentResult> {
		const accumulatedText: string[] = [];
		try {
			const messages = this._buildMessages(request, history);
			const rawModelId = request.userSelectedModelId || this.phononService.defaultModelId;
			const modelIdentifier = rawModelId.startsWith('phonon/') ? rawModelId : `phonon/${rawModelId}`;

			const response = await this.languageModelsService.sendChatRequest(
				modelIdentifier,
				new ExtensionIdentifier('phonon.claude'),
				messages,
				{ maxTokens: 8192 },
				token
			);

			let firstProgress = false;
			for await (const part of response.stream) {
				if (token.isCancellationRequested) { break; }

				const parts = Array.isArray(part) ? part : [part];
				for (const p of parts) {
					if (p.type === 'text') {
						accumulatedText.push(p.value);
						progress([{
							kind: 'markdownContent',
							content: new MarkdownString(p.value),
						}]);
						if (!firstProgress) { firstProgress = true; }
					} else if (p.type === 'thinking') {
						const thinkingText = Array.isArray(p.value) ? p.value.join('') : p.value;
						progress([{
							kind: 'markdownContent',
							content: new MarkdownString(`*${thinkingText}*`),
						}]);
					}
				}
			}

			await response.result;

			return {
				timings: {
					firstProgress: firstProgress ? stopWatch.elapsed() : undefined,
					totalElapsed: stopWatch.elapsed(),
				},
			};
		} catch (err) {
			this.logService.error('[Phonon] Chat request failed:', err);
			return {
				errorDetails: { message: err instanceof Error ? err.message : String(err) },
				timings: { totalElapsed: stopWatch.elapsed() },
			};
		} finally {
			// Fire solo output for intent interception by MCP bridge.
			// In finally: even if response.result rejects, the user already saw
			// the streamed output (including any intent), so we must process it.
			const fullOutput = accumulatedText.join('');
			if (fullOutput.length > 0) {
				this._onDidSoloOutput.fire(fullOutput);
			}
		}
	}

	async provideFollowups(
		_request: IChatAgentRequest,
		_result: IChatAgentResult,
		_history: IChatAgentHistoryEntry[],
		_token: CancellationToken
	): Promise<IChatFollowup[]> {
		return [];
	}

	async provideChatTitle(
		history: IChatAgentHistoryEntry[],
		_token: CancellationToken
	): Promise<string | undefined> {
		if (history.length === 0) {
			return undefined;
		}

		// Use the first user message as a basis for the title
		const firstMessage = history[0]?.request?.message;
		if (!firstMessage) {
			return undefined;
		}

		// Truncate to a reasonable title length
		const maxLength = 50;
		if (firstMessage.length <= maxLength) {
			return firstMessage;
		}
		return firstMessage.substring(0, maxLength - 3) + '...';
	}

	private _buildMessages(
		request: IChatAgentRequest,
		history: IChatAgentHistoryEntry[]
	): IChatMessage[] {
		const messages: IChatMessage[] = [];

		// System message
		messages.push({
			role: ChatMessageRole.System,
			content: [{
				type: 'text',
				value: this._getSystemPrompt(request),
			}],
		});

		// History
		for (const entry of history) {
			// User message
			messages.push({
				role: ChatMessageRole.User,
				content: [{
					type: 'text',
					value: entry.request.message,
				}],
			});

			// Assistant response
			const responseParts: IChatMessagePart[] = [];
			for (const part of entry.response) {
				const partAny = part as { content?: unknown };
				if (partAny.content) {
					responseParts.push({
						type: 'text',
						value: typeof partAny.content === 'string'
							? partAny.content
							: (partAny.content as { value: string }).value || '',
					});
				}
			}
			if (responseParts.length > 0) {
				messages.push({
					role: ChatMessageRole.Assistant,
					content: responseParts,
				});
			}
		}

		// Current message
		messages.push({
			role: ChatMessageRole.User,
			content: [{
				type: 'text',
				value: request.message,
			}],
		});

		return messages;
	}

	private _getSystemPrompt(_request: IChatAgentRequest): string {
		const base = [
			'You are Claude, an AI assistant integrated into Phonon IDE.',
			'You are helpful, direct, and concise.',
			'When asked about code, provide practical solutions.',
			'Use markdown formatting for code blocks and structured content.',
			'If the user asks about the IDE, you can explain that Phonon IDE is a VS Code fork with native Claude integration.',
		].join(' ');

		const capabilities = this.liquidModuleRegistry.getCapabilities();
		const hasEntities = capabilities.entities.length > 0;
		const hasViews = capabilities.views.length > 0;
		const hasCards = capabilities.cards && capabilities.cards.length > 0;

		if (!hasEntities && !hasViews && !hasCards) {
			return base;
		}

		const sections: string[] = [base, '', '## Liquid Module Capabilities'];

		if (hasEntities) {
			sections.push('', '### Available Entities');
			for (const entity of capabilities.entities) {
				const fields = entity.fields.length > 0 ? `fields=${entity.fields.join(', ')}` : 'no fields';
				sections.push(`- ${entity.id} (${entity.label}): ${fields}`);
			}
		}

		if (hasViews) {
			sections.push('', '### Available Views');
			for (const view of capabilities.views) {
				const parts = [`mode=${view.mode}`];
				if (view.entity) {
					parts.push(`entity=${view.entity}`);
				}
				sections.push(`- ${view.id} (${view.label}): ${parts.join(', ')}`);
			}
		}

		if (hasCards) {
			sections.push('', '### Available Cards (Micro-Widgets)');
			sections.push('Cards are sandboxed HTML components. Use cardId in composition intents.');
			for (const card of capabilities.cards) {
				const parts: string[] = [];
				if (card.entity) { parts.push(`entity=${card.entity}`); }
				if (card.tags.length > 0) { parts.push(`tags=${card.tags.join(',')}`); }
				sections.push(`- ${card.id} (${card.label}): ${parts.join(', ')}`);
			}
		}

		sections.push(
			'',
			'### Canvas Composition',
			'When the user asks to see data visually, emit a composition intent.',
			'Use cardId for micro-cards (preferred for dashboards) or viewId for full views.',
			'Example with cards:',
			'```phonon-intent',
			'{ "layout": "grid", "slots": [{ "cardId": "rist-food-cost" }, { "cardId": "rist-orders-incoming" }, { "cardId": "rist-revenue-today" }] }',
			'```',
			'Example with view:',
			'```phonon-intent',
			'{ "layout": "single", "slots": [{ "viewId": "ristDashboard" }] }',
			'```',
			'Available layouts: single, split-horizontal, split-vertical, grid, stack.',
			'Do NOT generate HTML. The compositor renders the intent.',
		);

		return sections.join('\n');
	}
}
