/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatDebugCustomizationLogEntry, IChatDebugEventFileListContent, IChatDebugResolvedEventContent, IChatDebugService } from '../common/chatDebugService.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatRequestHooks, formatHookCommandLabel } from '../common/promptSyntax/hookSchema.js';
import { HookType } from '../common/promptSyntax/hookTypes.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { IHookDiscoveryInfo, type InstructionsCollectionDebugInfo, IPromptDiscoveryInfo, IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { lastInstructionsCollectionResult } from '../common/promptSyntax/computeAutomaticInstructions.js';

interface ICustomizationEventData {
	readonly debugInfo: InstructionsCollectionDebugInfo;
	readonly hooks: ChatRequestHooks | undefined;
}

/**
 * Bridges prompt discovery information to {@link IChatDebugService}.
 */
export class PromptsDebugContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.promptsDebug';

	private static readonly MAX_DISCOVERY_DETAILS = 10_000;

	/**
	 * Maps debug event IDs to their discovery info, so that
	 * {@link IChatDebugService.resolveEvent} can return rich details.
	 */
	private readonly _discoveryEventDetails = new Map<string, IPromptDiscoveryInfo>();
	private readonly _customizationEventDetails = new Map<string, ICustomizationEventData>();
	private readonly _loggedSessions = new Set<string>();

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IChatService chatService: IChatService,
		@IChatDebugService chatDebugService: IChatDebugService,
		@ILogService logService: ILogService,
	) {
		super();

		// Clean up logged-session entries when sessions are disposed.
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._loggedSessions.delete(sessionResource.toString());
			}
		}));

		// Forward discovery log events to the debug service.
		this._register(chatAgentService.onWillInvokeAgent(async e => {
			const sessionKey = e.request.sessionResource.toString();
			const isFirstInvocation = !this._loggedSessions.has(sessionKey);
			this._loggedSessions.add(sessionKey);

			const sessionResource = e.request.sessionResource;

			if (isFirstInvocation) {
				const cts = new CancellationTokenSource();
				try {
					const discoveryInfos = await Promise.all([PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.skill, PromptsType.hook].map(type => this.promptsService.getDiscoveryInfo(type, cts.token)));
					for (const discoveryInfo of discoveryInfos) {
						const { name, details } = this.getDiscoveryLogEntry(discoveryInfo);
						const eventId = generateUuid();

						this._discoveryEventDetails.set(eventId, discoveryInfo);

						// Evict oldest entries when the map exceeds the cap.
						if (this._discoveryEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
							const first = this._discoveryEventDetails.keys().next().value;
							if (first !== undefined) {
								this._discoveryEventDetails.delete(first);
							}
						}

						// Enrich details with file paths so they appear in the event
						// payload (e.g. forwarded via onDidReceiveChatDebugEvent to the
						// extension's JSONL file logger).
						const loaded = discoveryInfo.files
							.filter(f => f.status === 'loaded')
							.map(f => f.promptPath.name ?? f.promptPath.uri.path.split('/').pop() ?? f.promptPath.uri.toString());
						const skipped = discoveryInfo.files.filter(f => f.status === 'skipped').map(f => {
							const label = f.promptPath.uri.toString();
							return f.skipReason ? `${label} (${f.skipReason})` : label;
						});
						const folders = discoveryInfo.sourceFolders?.map(sf => sf.uri.path) ?? [];
						const parts: string[] = [];
						if (details) {
							parts.push(details);
						}
						if (loaded.length > 0) {
							parts.push(`loaded: [${truncateList(loaded)}]`);
						}
						if (skipped.length > 0) {
							parts.push(`skipped: [${truncateList(skipped)}]`);
						}
						if (folders.length > 0) {
							parts.push(`folders: [${truncateList(folders)}]`);
						}
						const newDetails = parts.join(' | ') || undefined;

						chatDebugService.log(
							sessionResource,
							name,
							newDetails,
							undefined,
							{ id: eventId, category: 'discovery' },
						);
					}
				} catch (error) {
					logService.error('Error while logging prompt discovery info to chat debug service', error);
				} finally {
					cts.dispose();
				}
			}

			// Log resolved customizations from the last instructions collection.
			const lastResult = lastInstructionsCollectionResult;
			if (!isFirstInvocation && lastResult) {
				const { telemetryEvent: collectionEvent, debugInfo } = lastResult;
				// Fetch the cached hook discovery info.
				let resolvedHooks: ChatRequestHooks | undefined;
				try {
					const hookDiscoveryInfo = await this.promptsService.getDiscoveryInfo(PromptsType.hook, CancellationToken.None) as IHookDiscoveryInfo;
					resolvedHooks = hookDiscoveryInfo.hooksInfo?.hooks;
				} catch (error) {
					logService.warn('Error while fetching hooks for customization debug event', error);
				}

				const parts: string[] = [];
				if (collectionEvent.applyingInstructionsCount > 0) {
					parts.push(localize('customizations.applying', '{0} applying', collectionEvent.applyingInstructionsCount));
				}
				if (collectionEvent.referencedInstructionsCount > 0) {
					parts.push(localize('customizations.referenced', '{0} referenced', collectionEvent.referencedInstructionsCount));
				}
				if (collectionEvent.agentInstructionsCount > 0) {
					parts.push(localize('customizations.agent', '{0} agent', collectionEvent.agentInstructionsCount));
				}
				if (collectionEvent.listedInstructionsCount > 0) {
					parts.push(localize('customizations.listed', '{0} listed', collectionEvent.listedInstructionsCount));
				}
				const durationStr = debugInfo.durationInMillis.toFixed(1);
				const summary = parts.length > 0
					? localize('customizationsResolved.details', 'Resolved {0} customizations ({1}) in {2}ms', collectionEvent.totalInstructionsCount, parts.join(', '), durationStr)
					: localize('customizationsResolved.none', 'No customizations resolved');
				const detailSummaries = debugInfo.debugDetails.map(e => {
					const detail = e.reason ? `${e.name} — ${e.reason}` : e.name;
					return `[${e.category}] ${detail}`;
				});
				const details = detailSummaries.length > 0
					? `${summary} | ${detailSummaries.join(', ')}`
					: summary;

				const customizationEventId = generateUuid();
				this._customizationEventDetails.set(customizationEventId, { debugInfo, hooks: resolvedHooks });

				// Evict oldest entries when the map exceeds the cap.
				if (this._customizationEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
					const first = this._customizationEventDetails.keys().next().value;
					if (first !== undefined) {
						this._customizationEventDetails.delete(first);
					}
				}

				chatDebugService.log(
					sessionResource,
					localize('customizationsResolved', 'Resolve Customizations'),
					details,
					undefined,
					{ id: customizationEventId, category: 'customization' },
				);
			}
		}));
		// Register a resolve provider so expanding a discovery event
		// in the Agent Debug Logs shows the full file list.
		this._register(chatDebugService.registerProvider({
			provideChatDebugLog: async () => undefined,
			resolveChatDebugLogEvent: async (eventId) => {
				return this._resolveDiscoveryEvent(eventId) ?? this._resolveCustomizationEvent(eventId);
			}
		}));
	}

	private getDiscoveryLogEntry(discoveryInfo: IPromptDiscoveryInfo): { readonly name: string; readonly details?: string } {

		const durationInMillis = discoveryInfo.durationInMillis.toFixed(1);
		const loadedCount = discoveryInfo.files.filter(file => file.status === 'loaded').length;
		const skippedCount = discoveryInfo.files.length - loadedCount;

		switch (discoveryInfo.type) {
			case PromptsType.prompt:
				return {
					name: localize('promptsService.loadSlashCommands', 'Slash Commands Discovery'),
					details: loadedCount === 1
						? localize('promptsDebugContribution.resolvedSlashCommand', 'Resolved {0} slash command in {1}ms', loadedCount, durationInMillis)
						: localize('promptsDebugContribution.resolvedSlashCommands', 'Resolved {0} slash commands in {1}ms', loadedCount, durationInMillis)
				};
			case PromptsType.agent:
				return {
					name: localize('promptsService.loadAgents', 'Agent Discovery'),
					details: loadedCount === 1
						? localize('promptsDebugContribution.resolvedAgent', 'Resolved {0} agent in {1}ms', loadedCount, durationInMillis)
						: localize('promptsDebugContribution.resolvedAgents', 'Resolved {0} agents in {1}ms', loadedCount, durationInMillis)
				};
			case PromptsType.skill:
				return {
					name: localize('promptsService.loadSkills', 'Skill Discovery'),
					details: loadedCount === 1
						? localize('promptsDebugContribution.resolvedSkill', 'Resolved {0} skill in {1}ms', loadedCount, durationInMillis)
						: localize('promptsDebugContribution.resolvedSkills', 'Resolved {0} skills in {1}ms', loadedCount, durationInMillis)
				};
			case PromptsType.instructions:
				return {
					name: localize('promptsService.loadInstructions', 'Instructions Discovery'),
					details: loadedCount === 1
						? localize('promptsDebugContribution.resolvedInstruction', 'Resolved {0} instruction in {1}ms', loadedCount, durationInMillis)
						: localize('promptsDebugContribution.resolvedInstructions', 'Resolved {0} instructions in {1}ms', loadedCount, durationInMillis)
				};
			case PromptsType.hook: {
				const hookDiscoveryInfo = discoveryInfo as IHookDiscoveryInfo;
				const hookCount = hookDiscoveryInfo.hooksInfo
					? Object.values(hookDiscoveryInfo.hooksInfo.hooks).reduce((total, hooks) => total + hooks.length, 0)
					: loadedCount;
				const details = skippedCount > 0
					? localize('promptsDebugContribution.resolvedHooksWithSkipped', 'Resolved {0} hooks from {1} files in {2}ms, skipped {3}', hookCount, loadedCount, durationInMillis, skippedCount)
					: hookCount === 1
						? localize('promptsDebugContribution.resolvedHook', 'Resolved {0} hook in {1}ms', hookCount, durationInMillis)
						: localize('promptsDebugContribution.resolvedHooks', 'Resolved {0} hooks in {1}ms', hookCount, durationInMillis);
				return {
					name: localize('promptsService.loadHooks', 'Hook Discovery'),
					details
				};
			}
		}
	}

	private _resolveDiscoveryEvent(eventId: string): IChatDebugResolvedEventContent | undefined {
		const info = this._discoveryEventDetails.get(eventId);
		if (!info) {
			return undefined;
		}

		return this._toFileListContent(info);
	}

	private _resolveCustomizationEvent(eventId: string): IChatDebugResolvedEventContent | undefined {
		const data = this._customizationEventDetails.get(eventId);
		if (!data) {
			return undefined;
		}

		const { debugInfo, hooks } = data;
		const logs: IChatDebugCustomizationLogEntry[] = [...debugInfo.debugDetails];

		// Add hook entries from the resolved hooks — each command carries its sourceUri.
		if (hooks) {
			for (const hookType of Object.values(HookType)) {
				const commands = hooks[hookType];
				if (commands && commands.length > 0) {
					for (const cmd of commands) {
						const commandLabel = formatHookCommandLabel(cmd, OS) || localize('hook.unknownCommand', '(unknown command)');
						logs.push({
							category: 'hook',
							name: commandLabel,
							reason: hookType,
							uri: cmd.sourceUri,
						});
					}
				}
			}
		}

		return {
			kind: 'customizationSummary',
			resolutionLogs: logs,
			durationInMillis: debugInfo.durationInMillis,
			counts: {
				instructions: logs.filter(e => e.category === 'applying' || e.category === 'referenced').length,
				skills: logs.filter(e => e.category === 'skill').length,
				agents: logs.filter(e => e.category === 'custom-agent').length,
				hooks: logs.filter(e => e.category === 'hook').length,
				skipped: logs.filter(e => e.category === 'skipped').length,
			},
		};
	}

	private _toFileListContent(info: IPromptDiscoveryInfo): IChatDebugEventFileListContent {
		return {
			kind: 'fileList',
			discoveryType: info.type,
			durationInMillis: info.durationInMillis,
			files: info.files.map(f => ({
				uri: f.promptPath.uri,
				name: f.promptPath.name,
				status: f.status,
				storage: f.promptPath.storage,
				extensionId: f.promptPath.extension?.identifier.value,
				skipReason: f.skipReason,
				errorMessage: f.errorMessage,
				duplicateOf: f.duplicateOf,
			})),
			sourceFolders: info.sourceFolders?.map(sf => ({
				uri: sf.uri,
				storage: sf.storage,
			})),
		};
	}
}

const MAX_LIST_ITEMS = 100;

/**
 * Join a list of strings, truncating after {@link MAX_LIST_ITEMS} entries.
 * Full details are available via {@link IChatDebugService.resolveEvent}.
 */
function truncateList(items: string[]): string {
	if (items.length <= MAX_LIST_ITEMS) {
		return items.join(', ');
	}

	return items.slice(0, MAX_LIST_ITEMS).join(', ') + ` (+${items.length - MAX_LIST_ITEMS} more)`;
}
