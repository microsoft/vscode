/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';

export type SessionTimelineCategory = 'system' | 'user' | 'assistant' | 'tool' | 'subagent';

export interface IAgentHostJsonlRecord {
	readonly type: string;
	readonly id: string;
	readonly parentId: string | null;
	readonly agentId?: string;
	readonly timestamp: string;
	readonly data: Record<string, unknown>;
	readonly [key: string]: unknown;
}

export interface ISessionTimelineSection {
	readonly id?: SessionTimelinePromptSection;
	readonly label: string;
	readonly content: string;
}

export type SessionTimelinePromptSection = 'skills' | 'tools' | 'instructions';

export interface ISessionTimelinePromptCapabilities {
	readonly instructions: readonly string[];
	readonly instructionCount: number;
	readonly skills: readonly string[];
	readonly tools: readonly string[];
}

export interface ISessionTimelineEvent {
	readonly id: string;
	readonly parentEventId?: string;
	readonly category: SessionTimelineCategory;
	readonly title: string;
	readonly summary: string;
	readonly summaryPath?: { readonly directory: string; readonly basename: string };
	readonly timestamp: string;
	readonly metadata: readonly string[];
	readonly promptCapabilities?: ISessionTimelinePromptCapabilities;
	readonly sections: readonly ISessionTimelineSection[];
	readonly rawRecords: readonly IAgentHostJsonlRecord[];
	readonly searchableText: string;
}

export interface ISessionTimelineParseError {
	readonly line: number;
	readonly message: string;
}

export interface ISessionTimelineModel {
	readonly totalRecords: number;
	readonly events: readonly ISessionTimelineEvent[];
	readonly errors: readonly ISessionTimelineParseError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (isRecord(value)) {
		return value;
	}
	if (typeof value === 'string') {
		try {
			const parsed: unknown = JSON.parse(value);
			return isRecord(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function splitPath(path: string): { directory: string; basename: string } {
	const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	return separatorIndex >= 0
		? { directory: path.slice(0, separatorIndex + 1), basename: path.slice(separatorIndex + 1) }
		: { directory: '', basename: path };
}

function firstPath(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return splitPath(value).basename;
	}
	if (Array.isArray(value)) {
		return value.map(asString).filter((path): path is string => !!path).map(path => splitPath(path).basename).join(', ') || undefined;
	}
	return undefined;
}

function getToolSummary(toolName: string, value: unknown): { text: string; path?: { readonly directory: string; readonly basename: string } } {
	const args = asRecord(value);
	if (!args) {
		return { text: '' };
	}
	const normalizedToolName = toolName.split('.').at(-1)?.toLowerCase();
	switch (normalizedToolName) {
		case 'view':
		case 'read': {
			const path = asString(args.path);
			return path ? { text: path, path: splitPath(path) } : { text: '' };
		}
		case 'rg':
			return { text: [asString(args.pattern), firstPath(args.paths)].filter((part): part is string => !!part).join(' · ') };
		case 'glob':
			return { text: asString(args.pattern) ?? '' };
		case 'skill':
			return { text: asString(args.skill) ?? '' };
		case 'bash':
			return { text: asString(args.description) ?? '' };
		case 'runtests':
			return { text: firstPath(args.files) ?? '' };
		case 'task':
			return { text: asString(args.description) ?? asString(args.name) ?? '' };
		case 'web_fetch':
			return { text: asString(args.url) ?? '' };
		default: {
			const firstArgument = Object.values(args)[0];
			if (typeof firstArgument === 'string') {
				const isPath = (firstArgument.includes('/') || firstArgument.includes('\\')) && !/\s/.test(firstArgument);
				return isPath
					? { text: firstArgument, path: splitPath(firstArgument) }
					: { text: summarize(firstArgument, '') };
			}
			return { text: summarize(formatReadable(firstArgument), '') };
		}
	}
}

function formatReadable(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (value === undefined || value === null) {
		return value === null ? 'null' : '';
	}
	if (typeof value !== 'object') {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value.map(item => {
			const formatted = formatReadable(item);
			const [firstLine, ...remainingLines] = formatted.split('\n');
			return [`- ${firstLine}`, ...remainingLines.map(line => `  ${line}`)].join('\n');
		}).join('\n');
	}
	return Object.entries(value)
		.filter(([key]) => key !== 'toolCallId' && key !== 'requestId')
		.map(([key, item]) => {
			const formatted = formatReadable(item);
			if (!formatted.includes('\n') && (typeof item !== 'object' || item === null)) {
				return `${key}: ${formatted}`;
			}
			return `${key}:\n${formatted.split('\n').map(line => `  ${line}`).join('\n')}`;
		})
		.join('\n');
}

function summarize(value: string, fallback: string): string {
	const compact = value.replace(/\s+/g, ' ').trim();
	return compact ? compact.slice(0, 180) : fallback;
}

function extractTagContent(content: string, tag: string): string | undefined {
	const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(content);
	return match?.[1];
}

function extractPromptCapabilities(content: string): ISessionTimelinePromptCapabilities | undefined {
	const availableSkills = extractTagContent(content, 'available_skills');
	const skills = availableSkills
		? [...availableSkills.matchAll(/<skill>\s*[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/skill>/gi)]
			.map(match => match[1].trim())
			.filter(Boolean)
		: [];

	const toolsContent = extractTagContent(content, 'tools') ?? '';
	const tools = ['bash', 'view', 'skill', 'ask_user', 'sql', 'rg', 'task']
		.filter(tool => new RegExp(`<${tool}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tool}>`, 'i').test(toolsContent));

	const toolsStart = content.search(/<tools(?:\s[^>]*)?>/i);
	const toolsEndTag = /<\/tools>/i.exec(content);
	const instructionSections: { name: string; start: number; end: number }[] = [];
	for (const match of content.matchAll(/<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?>/g)) {
		const name = match[1];
		const start = match.index;
		if (start === undefined || name.toLowerCase() === 'tools' || (toolsStart >= 0 && toolsEndTag && start >= toolsStart && start <= toolsEndTag.index)) {
			continue;
		}
		const closingTag = `</${name}>`;
		const end = content.indexOf(closingTag, start + match[0].length);
		if (end >= 0) {
			instructionSections.push({ name, start, end: end + closingTag.length });
		}
	}
	const topLevelInstructionSections = instructionSections.filter(section =>
		!instructionSections.some(parent => parent !== section && parent.start < section.start && parent.end > section.end)
	);
	const instructionCounts = new Map<string, number>();
	for (const section of topLevelInstructionSections) {
		instructionCounts.set(section.name, (instructionCounts.get(section.name) ?? 0) + 1);
	}
	const instructions = [...instructionCounts].map(([name, count]) => {
		const label = name
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/[_.-]+/g, ' ')
			.replace(/\b\w/g, character => character.toUpperCase());
		return count > 1 ? `${label} (${count})` : label;
	});

	return skills.length || tools.length || topLevelInstructionSections.length
		? { skills, tools, instructions, instructionCount: topLevelInstructionSections.length }
		: undefined;
}

function duration(start: IAgentHostJsonlRecord, end: IAgentHostJsonlRecord): string | undefined {
	const milliseconds = Date.parse(end.timestamp) - Date.parse(start.timestamp);
	return Number.isFinite(milliseconds) && milliseconds >= 0
		? localize('chatDebug.sessionTimeline.duration', "{0} ms", milliseconds)
		: undefined;
}

function characterCount(kind: 'response' | 'reasoning', content: string): string {
	const count = content.length;
	const displayCount = count < 1000 ? String(count) : `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (kind === 'response') {
		return count === 1
			? localize('chatDebug.sessionTimeline.responseOneCharacter', "response (1 char)")
			: localize('chatDebug.sessionTimeline.responseCharacters', "response ({0} chars)", displayCount);
	}
	return count === 1
		? localize('chatDebug.sessionTimeline.reasoningOneCharacter', "reasoning (1 char)")
		: localize('chatDebug.sessionTimeline.reasoningCharacters', "reasoning ({0} chars)", displayCount);
}

function createEvent(
	record: IAgentHostJsonlRecord,
	category: SessionTimelineCategory,
	title: string,
	summary: string,
	metadata: readonly string[],
	sections: readonly ISessionTimelineSection[],
	rawRecords: readonly IAgentHostJsonlRecord[] = [record],
	summaryPath?: { readonly directory: string; readonly basename: string },
	promptCapabilities?: ISessionTimelinePromptCapabilities,
): ISessionTimelineEvent {
	return {
		id: record.id,
		category,
		title,
		summary,
		summaryPath,
		timestamp: record.timestamp,
		metadata,
		promptCapabilities,
		sections,
		rawRecords,
		searchableText: JSON.stringify(rawRecords).toLowerCase(),
	};
}

function withParent(event: ISessionTimelineEvent, parentEventId: string | undefined): ISessionTimelineEvent {
	return parentEventId ? { ...event, parentEventId } : event;
}

function correlationKey(record: IAgentHostJsonlRecord, id: string): string {
	return `${record.agentId ?? ''}\0${id}`;
}

function parseRecords(text: string): { records: IAgentHostJsonlRecord[]; errors: ISessionTimelineParseError[] } {
	const records: IAgentHostJsonlRecord[] = [];
	const errors: ISessionTimelineParseError[] = [];
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].trim();
		if (!line) {
			continue;
		}
		try {
			const parsed: unknown = JSON.parse(line);
			if (!isRecord(parsed)
				|| typeof parsed.type !== 'string'
				|| typeof parsed.id !== 'string'
				|| typeof parsed.timestamp !== 'string'
				|| (parsed.parentId !== null && typeof parsed.parentId !== 'string')
				|| !isRecord(parsed.data)) {
				errors.push({ line: index + 1, message: localize('chatDebug.sessionTimeline.invalidEnvelope', "Invalid event envelope") });
				continue;
			}
			records.push(parsed as IAgentHostJsonlRecord);
		} catch (error) {
			errors.push({
				line: index + 1,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return { records, errors };
}

export function createSessionTimelineModel(text: string): ISessionTimelineModel {
	const { records, errors } = parseRecords(text);
	const toolCompletions = new Map<string, IAgentHostJsonlRecord>();
	const externalCompletions = new Map<string, IAgentHostJsonlRecord>();
	const subagentCompletions = new Map<string, IAgentHostJsonlRecord>();
	const toolRequestOwners = new Map<string, string>();
	const toolStartIds = new Map<string, string>();
	const pairedRecordIds = new Set<string>();

	for (const record of records) {
		const data = record.data;
		if (record.type === 'assistant.message' && Array.isArray(data.toolRequests)) {
			for (const request of data.toolRequests) {
				const requestData = asRecord(request);
				const toolCallId = requestData && (asString(requestData.toolCallId) ?? asString(requestData.id));
				if (toolCallId) {
					toolRequestOwners.set(toolCallId, record.id);
				}
			}
		} else if (record.type === 'tool.execution_start') {
			const toolCallId = asString(data.toolCallId);
			if (toolCallId) {
				toolStartIds.set(toolCallId, record.id);
			}
		} else if (record.type === 'tool.execution_complete') {
			const toolCallId = asString(data.toolCallId);
			if (toolCallId) {
				toolCompletions.set(correlationKey(record, toolCallId), record);
			}
		} else if (record.type === 'external_tool.completed') {
			const requestId = asString(data.requestId);
			if (requestId) {
				externalCompletions.set(correlationKey(record, requestId), record);
			}
		} else if (record.type === 'subagent.completed') {
			const toolCallId = asString(data.toolCallId);
			if (toolCallId) {
				subagentCompletions.set(correlationKey(record, toolCallId), record);
			}
		}
	}

	const events: ISessionTimelineEvent[] = [];
	const currentUserEventByAgent = new Map<string, string>();
	const currentAssistantEventByAgent = new Map<string, string>();
	for (const record of records) {
		if (pairedRecordIds.has(record.id)) {
			continue;
		}
		const data = record.data;
		const agentKey = record.agentId ?? '';
		const currentUserEventId = currentUserEventByAgent.get(agentKey);
		const currentAssistantEventId = currentAssistantEventByAgent.get(agentKey);
		switch (record.type) {
			case 'system.message': {
				const content = asString(data.content) ?? '';
				const promptCapabilities = extractPromptCapabilities(content);
				const sections: ISessionTimelineSection[] = [{ label: localize('chatDebug.sessionTimeline.content', "Content"), content }];
				if (promptCapabilities?.skills.length) {
					sections.push({ id: 'skills', label: localize('chatDebug.sessionTimeline.advertisedSkills', "Advertised Skills"), content: promptCapabilities.skills.join('\n') });
				}
				if (promptCapabilities?.tools.length) {
					sections.push({ id: 'tools', label: localize('chatDebug.sessionTimeline.toolGuidance', "Tool Guidance"), content: promptCapabilities.tools.join('\n') });
				}
				if (promptCapabilities?.instructions.length) {
					sections.push({ id: 'instructions', label: localize('chatDebug.sessionTimeline.instructionSections', "Instruction Sections"), content: promptCapabilities.instructions.join('\n') });
				}
				events.push(withParent(createEvent(
					record,
					'system',
					'',
					summarize(content, localize('chatDebug.sessionTimeline.emptySystemMessage', "Empty system message")),
					[],
					sections,
					[record],
					undefined,
					promptCapabilities,
				), currentUserEventId));
				break;
			}
			case 'user.message': {
				currentUserEventByAgent.set(agentKey, record.id);
				currentAssistantEventByAgent.delete(agentKey);
				const content = asString(data.content) ?? '';
				const sections: ISessionTimelineSection[] = [{ label: localize('chatDebug.sessionTimeline.userRequest', "User Request"), content }];
				const transformedContent = asString(data.transformedContent);
				if (transformedContent && transformedContent !== content) {
					sections.push({ label: localize('chatDebug.sessionTimeline.transformedPrompt', "Transformed Prompt"), content: transformedContent });
				}
				if (Array.isArray(data.attachments) && data.attachments.length > 0) {
					sections.push({ label: localize('chatDebug.sessionTimeline.attachments', "Attachments"), content: formatReadable(data.attachments) });
				}
				events.push(createEvent(
					record,
					'user',
					'',
					summarize(content, localize('chatDebug.sessionTimeline.emptyUserMessage', "Empty user message")),
					[],
					sections,
				));
				break;
			}
			case 'assistant.message': {
				const content = asString(data.content) ?? '';
				const reasoning = asString(data.reasoningText);
				const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : [];
				const sections: ISessionTimelineSection[] = [];
				if (content) {
					sections.push({ label: localize('chatDebug.sessionTimeline.response', "Response"), content });
				}
				if (reasoning) {
					sections.push({ label: localize('chatDebug.sessionTimeline.reasoning', "Reasoning"), content: reasoning });
				}
				if (toolRequests.length > 0) {
					sections.push({ label: localize('chatDebug.sessionTimeline.toolRequests', "Tool Requests"), content: formatReadable(toolRequests) });
				}
				const parentToolCallId = asString(data.parentToolCallId);
				const parentToolEventId = parentToolCallId ? toolStartIds.get(parentToolCallId) : undefined;
				events.push(withParent(createEvent(
					record,
					'assistant',
					'',
					summarize(content, toolRequests.length > 0 ? '' : localize('chatDebug.sessionTimeline.emptyAssistantMessage', "Empty assistant message")),
					[
						asString(data.model),
						content ? characterCount('response', content) : undefined,
						reasoning ? characterCount('reasoning', reasoning) : undefined,
						toolRequests.length > 0 ? (toolRequests.length === 1
							? localize('chatDebug.sessionTimeline.oneToolRequest', "1 tool request")
							: localize('chatDebug.sessionTimeline.toolRequestCount', "{0} tool requests", toolRequests.length)) : undefined,
					].filter((value): value is string => !!value),
					sections,
				), parentToolEventId ?? currentUserEventId));
				currentAssistantEventByAgent.set(agentKey, record.id);
				break;
			}
			case 'tool.execution_start': {
				const toolCallId = asString(data.toolCallId);
				const toolCallKey = toolCallId ? correlationKey(record, toolCallId) : undefined;
				const parentToolCallId = asString(data.parentToolCallId);
				const parentToolEventId = parentToolCallId ? toolStartIds.get(parentToolCallId) : undefined;
				const completion = toolCallKey ? toolCompletions.get(toolCallKey) : undefined;
				if (completion && toolCallKey) {
					pairedRecordIds.add(completion.id);
					toolCompletions.delete(toolCallKey);
				}
				const completionData = completion?.data;
				const toolName = asString(data.toolName) ?? localize('chatDebug.sessionTimeline.unknownTool', "Tool");
				const toolSummary = getToolSummary(toolName, data.arguments);
				const success = completionData && typeof completionData.success === 'boolean' ? completionData.success : undefined;
				const sections: ISessionTimelineSection[] = [
					{ label: localize('chatDebug.sessionTimeline.arguments', "Arguments"), content: formatReadable(data.arguments) },
				];
				if (completionData) {
					sections.push({
						label: success === false ? localize('chatDebug.sessionTimeline.error', "Error") : localize('chatDebug.sessionTimeline.result', "Result"),
						content: formatReadable(completionData.result ?? completionData.error),
					});
				}
				events.push(withParent(createEvent(
					record,
					'tool',
					toolName,
					toolSummary.text,
					[
						completion ? duration(record, completion) : localize('chatDebug.sessionTimeline.pending', "Pending"),
					].filter((value): value is string => !!value),
					sections,
					completion ? [record, completion] : [record],
					toolSummary.path,
				), parentToolEventId ?? (toolCallId ? toolRequestOwners.get(toolCallId) : undefined) ?? currentAssistantEventId));
				break;
			}
			case 'external_tool.requested': {
				const requestId = asString(data.requestId);
				const toolCallId = asString(data.toolCallId);
				const requestKey = requestId ? correlationKey(record, requestId) : undefined;
				const parentToolCallId = asString(data.parentToolCallId);
				const parentToolEventId = parentToolCallId ? toolStartIds.get(parentToolCallId) : undefined;
				const completion = requestKey ? externalCompletions.get(requestKey) : undefined;
				if (completion && requestKey) {
					pairedRecordIds.add(completion.id);
					externalCompletions.delete(requestKey);
				}
				const toolName = asString(data.toolName) ?? localize('chatDebug.sessionTimeline.externalTool', "External Tool");
				const toolSummary = getToolSummary(toolName, data.arguments);
				const completionData = completion?.data;
				const completionResult = completionData?.result ?? completionData?.error;
				const sections: ISessionTimelineSection[] = [
					{ label: localize('chatDebug.sessionTimeline.arguments', "Arguments"), content: formatReadable(data.arguments) },
				];
				if (completionResult !== undefined) {
					sections.push({
						label: completionData?.success === false ? localize('chatDebug.sessionTimeline.error', "Error") : localize('chatDebug.sessionTimeline.result', "Result"),
						content: formatReadable(completionResult),
					});
				}
				events.push(withParent(createEvent(
					record,
					'tool',
					toolName,
					toolSummary.text,
					[completion ? duration(record, completion) : localize('chatDebug.sessionTimeline.pending', "Pending")].filter((value): value is string => !!value),
					sections,
					completion ? [record, completion] : [record],
					toolSummary.path,
				), parentToolEventId ?? (toolCallId ? toolRequestOwners.get(toolCallId) : undefined) ?? currentAssistantEventId));
				break;
			}
			case 'subagent.started': {
				const toolCallId = asString(data.toolCallId);
				const toolCallKey = toolCallId ? correlationKey(record, toolCallId) : undefined;
				const completion = toolCallKey ? subagentCompletions.get(toolCallKey) : undefined;
				if (completion && toolCallKey) {
					pairedRecordIds.add(completion.id);
					subagentCompletions.delete(toolCallKey);
				}
				const name = asString(data.agentDisplayName) ?? asString(data.agentName) ?? localize('chatDebug.sessionTimeline.subagent', "Subagent");
				events.push(withParent(createEvent(
					record,
					'subagent',
					name,
					completion ? localize('chatDebug.sessionTimeline.subagentCompleted', "Subagent completed.") : localize('chatDebug.sessionTimeline.subagentStarted', "Subagent started."),
					[asString(data.model), completion ? duration(record, completion) : localize('chatDebug.sessionTimeline.running', "Running")].filter((value): value is string => !!value),
					[{ label: localize('chatDebug.sessionTimeline.details', "Details"), content: formatReadable(completion ? [data, completion.data] : data) }],
					completion ? [record, completion] : [record],
				), toolCallId ? toolStartIds.get(toolCallId) ?? toolRequestOwners.get(toolCallId) ?? currentAssistantEventId : currentAssistantEventId));
				break;
			}
			case 'subagent.completed': {
				events.push(withParent(createEvent(
					record,
					'subagent',
					asString(data.agentDisplayName) ?? asString(data.agentName) ?? localize('chatDebug.sessionTimeline.subagent', "Subagent"),
					localize('chatDebug.sessionTimeline.subagentCompleted', "Subagent completed."),
					[asString(data.model)].filter((value): value is string => !!value),
					[{ label: localize('chatDebug.sessionTimeline.details', "Details"), content: formatReadable(data) }],
				), currentAssistantEventId));
				break;
			}
			case 'tool.execution_complete':
			case 'external_tool.completed': {
				events.push(withParent(createEvent(
					record,
					'tool',
					localize('chatDebug.sessionTimeline.unpairedCompletion', "Unpaired Tool Completion"),
					localize('chatDebug.sessionTimeline.unpairedCompletionSummary', "A completion record has no matching request in this log."),
					[],
					[{ label: localize('chatDebug.sessionTimeline.details', "Details"), content: formatReadable(data) }],
				), currentAssistantEventId));
				break;
			}
		}
	}

	return { totalRecords: records.length, events, errors };
}
