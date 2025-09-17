/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IPlanningModeService, IConversationEntry, IConversationSummary, IPlanningModeState, RESTRICTED_OPERATIONS, PlanningModeSettings } from '../common/planningMode.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

const PLANNING_MODE_STORAGE_KEY = 'planningMode.state';
const CONVERSATION_STORAGE_KEY = 'planningMode.conversation';

export class PlanningModeService extends Disposable implements IPlanningModeService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<boolean>());
	readonly onDidChange: Event<boolean> = this._onDidChange.event;

	private readonly _onDidAddConversationEntry = this._register(new Emitter<IConversationEntry>());
	readonly onDidAddConversationEntry: Event<IConversationEntry> = this._onDidAddConversationEntry.event;

	private _isActive: boolean = false;
	private _startTime?: number;
	private _conversationEntries: IConversationEntry[] = [];
	private readonly _restrictedOperations = new Set<string>(Object.values(RESTRICTED_OPERATIONS));

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._loadState();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PlanningModeSettings.ENABLED)) {
				this._onConfigurationChanged();
			}
		}));
	}

	get isActive(): boolean {
		return this._isActive;
	}

	get conversationEntries(): readonly IConversationEntry[] {
		return this._conversationEntries.slice();
	}

	async togglePlanningMode(): Promise<void> {
		await this.setActive(!this._isActive);
	}

	async setActive(active: boolean): Promise<void> {
		if (this._isActive === active) {
			return;
		}

		this._isActive = active;

		if (active) {
			this._startTime = Date.now();
			this.addConversationEntry({
				type: 'system',
				content: 'Planning Mode activated. File editing is now restricted. Use MCP tools for research and analysis.'
			});
		} else {
			this.addConversationEntry({
				type: 'system',
				content: 'Planning Mode deactivated. File editing is now enabled.'
			});
		}

		this._saveState();
		this._onDidChange.fire(active);
	}

	addConversationEntry(entry: Omit<IConversationEntry, 'timestamp'>): void {
		const fullEntry: IConversationEntry = {
			...entry,
			timestamp: Date.now()
		};

		this._conversationEntries.push(fullEntry);
		this._saveConversation();
		this._onDidAddConversationEntry.fire(fullEntry);
	}

	generateSummary(): IConversationSummary {
		const startTime = this._startTime ?? (this._conversationEntries[0]?.timestamp ?? Date.now());
		const endTime = Date.now();

		// Extract key information from conversation
		const toolCalls = this._conversationEntries.filter(e => e.type === 'tool-call');
		const toolsUsed = [...new Set(toolCalls.map(e => e.metadata?.toolName).filter(Boolean))];

		const userEntries = this._conversationEntries.filter(e => e.type === 'user');
		const assistantEntries = this._conversationEntries.filter(e => e.type === 'assistant');

		// Generate concise summary
		const summary = this._generateTextSummary(userEntries, assistantEntries, toolCalls);
		const keyFindings = this._extractKeyFindings();
		const recommendations = this._generateRecommendations();

		return {
			startTime,
			endTime,
			totalEntries: this._conversationEntries.length,
			summary,
			keyFindings,
			toolsUsed: toolsUsed as string[],
			recommendations,
			context: {
				workspace: this._extractWorkspaceContext(),
				files: this._extractFileContext(),
				errors: this._extractErrorContext()
			}
		};
	}

	clearConversation(): void {
		this._conversationEntries = [];
		this._saveConversation();
	}

	isOperationRestricted(operation: string): boolean {
		return this._isActive && this._restrictedOperations.has(operation);
	}

	exportConversation(): string {
		const summary = this.generateSummary();
		const format = this.configurationService.getValue<string>(PlanningModeSettings.EXPORT_FORMAT) ?? 'markdown';

		if (format === 'json') {
			return JSON.stringify({
				summary,
				entries: this._conversationEntries
			}, null, 2);
		}

		// Default to markdown format
		return this._generateMarkdownExport(summary);
	}

	private _generateTextSummary(userEntries: IConversationEntry[], assistantEntries: IConversationEntry[], toolCalls: IConversationEntry[]): string {
		const sections = [];

		if (userEntries.length > 0) {
			sections.push(`User made ${userEntries.length} requests for analysis and planning.`);
		}

		if (toolCalls.length > 0) {
			const uniqueTools = new Set(toolCalls.map(e => e.metadata?.toolName).filter(Boolean));
			sections.push(`Used ${uniqueTools.size} different tools for research: ${Array.from(uniqueTools).join(', ')}.`);
		}

		if (assistantEntries.length > 0) {
			sections.push(`Assistant provided detailed analysis and recommendations.`);
		}

		return sections.join(' ');
	}

	private _extractKeyFindings(): string[] {
		// Extract key findings from conversation content
		const findings: string[] = [];

		// Look for patterns indicating important discoveries
		this._conversationEntries.forEach(entry => {
			if (entry.type === 'assistant' && entry.content.length > 100) {
				// Extract bullet points or numbered lists
				const bulletPattern = /[•\-\*]\s+(.+)/g;
				const matches = entry.content.match(bulletPattern);
				if (matches) {
					findings.push(...matches.slice(0, 3).map(m => m.replace(/[•\-\*]\s+/, '').trim()));
				}
			}
		});

		return findings.slice(0, 5); // Limit to top 5 findings
	}

	private _generateRecommendations(): string[] {
		const recommendations: string[] = [];

		// Generate recommendations based on the conversation
		const hasErrors = this._conversationEntries.some(e => e.metadata?.error);
		if (hasErrors) {
			recommendations.push('Address identified errors and issues');
		}

		const toolsUsed = new Set(this._conversationEntries
			.filter(e => e.type === 'tool-call')
			.map(e => e.metadata?.toolName)
			.filter(Boolean)
		);

		if (toolsUsed.size > 0) {
			recommendations.push('Implement findings from tool analysis');
		}

		recommendations.push('Review and validate the planning phase results');
		recommendations.push('Proceed with implementation using identified approaches');

		return recommendations;
	}

	private _extractWorkspaceContext(): string | undefined {
		// Extract workspace information from conversation
		const workspaceRefs = this._conversationEntries
			.map(e => e.content)
			.join(' ')
			.match(/workspace|project|repo|repository/gi);

		return workspaceRefs ? 'Active workspace context detected' : undefined;
	}

	private _extractFileContext(): string[] {
		// Extract file references from conversation
		const files: string[] = [];
		const filePattern = /[\w\-\.]+\.(ts|js|json|md|txt|py|java|cpp|h|css|html|xml|yaml|yml)/gi;

		this._conversationEntries.forEach(entry => {
			const matches = entry.content.match(filePattern);
			if (matches) {
				files.push(...matches);
			}
		});

		return [...new Set(files)].slice(0, 10); // Unique files, limit to 10
	}

	private _extractErrorContext(): string[] {
		return this._conversationEntries
			.filter(e => e.metadata?.error)
			.map(e => e.metadata!.error!)
			.slice(0, 5); // Limit to 5 errors
	}

	private _generateMarkdownExport(summary: IConversationSummary): string {
		const lines = [
			'# Planning Session Summary',
			'',
			`**Session Duration:** ${this._formatDuration(summary.endTime - summary.startTime)}`,
			`**Total Entries:** ${summary.totalEntries}`,
			'',
			'## Overview',
			summary.summary,
			'',
		];

		if (summary.keyFindings.length > 0) {
			lines.push('## Key Findings');
			summary.keyFindings.forEach(finding => lines.push(`- ${finding}`));
			lines.push('');
		}

		if (summary.toolsUsed.length > 0) {
			lines.push('## Tools Used');
			summary.toolsUsed.forEach(tool => lines.push(`- ${tool}`));
			lines.push('');
		}

		if (summary.recommendations.length > 0) {
			lines.push('## Recommendations');
			summary.recommendations.forEach(rec => lines.push(`- ${rec}`));
			lines.push('');
		}

		if (summary.context.files && summary.context.files.length > 0) {
			lines.push('## Files Referenced');
			summary.context.files.forEach(file => lines.push(`- ${file}`));
			lines.push('');
		}

		lines.push('## Detailed Conversation Log');
		this._conversationEntries.forEach((entry, index) => {
			lines.push(`### Entry ${index + 1} (${entry.type})`);
			lines.push(`**Time:** ${new Date(entry.timestamp).toISOString()}`);
			if (entry.metadata?.toolName) {
				lines.push(`**Tool:** ${entry.metadata.toolName}`);
			}
			lines.push('');
			lines.push(entry.content);
			lines.push('');
		});

		return lines.join('\n');
	}

	private _formatDuration(ms: number): string {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}m ${seconds}s`;
	}

	private _loadState(): void {
		try {
			const stateJson = this.storageService.get(PLANNING_MODE_STORAGE_KEY, StorageScope.WORKSPACE);
			if (stateJson) {
				const state: IPlanningModeState = JSON.parse(stateJson);
				this._isActive = state.isActive;
				this._startTime = state.startTime;
			}
		} catch (error) {
			// Ignore errors loading state
		}

		try {
			const conversationJson = this.storageService.get(CONVERSATION_STORAGE_KEY, StorageScope.WORKSPACE);
			if (conversationJson) {
				this._conversationEntries = JSON.parse(conversationJson);
			}
		} catch (error) {
			// Ignore errors loading conversation
		}
	}

	private _saveState(): void {
		const state: IPlanningModeState = {
			isActive: this._isActive,
			startTime: this._startTime,
			conversationEntries: [],
			restrictedOperations: Array.from(this._restrictedOperations)
		};

		this.storageService.store(PLANNING_MODE_STORAGE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _saveConversation(): void {
		this.storageService.store(CONVERSATION_STORAGE_KEY, JSON.stringify(this._conversationEntries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _onConfigurationChanged(): void {
		const enabled = this.configurationService.getValue<boolean>(PlanningModeSettings.ENABLED);
		if (!enabled && this._isActive) {
			this.setActive(false);
		}
	}
}

registerSingleton(IPlanningModeService, PlanningModeService, InstantiationType.Delayed);
