/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { ChatResultPromptTokenDetail, LanguageModelToolInformation } from 'vscode';
import { ITokenizer } from '../../../util/common/tokenizer';

/**
 * Categories for prompt token breakdown
 */
export const PromptTokenCategory = {
	System: 'System',
	UserContext: 'User Context',
} as const;

/**
 * Labels for prompt token breakdown within categories
 */
export const PromptTokenLabel = {
	// System category
	SystemInstructions: 'System Instructions',
	Tools: 'Tool Definitions',

	// User Context category
	Messages: 'Messages',
	Files: 'Files',
	ToolResults: 'Tool Results',
} as const;

/**
 * Mapping from XML tag names in message content to labels.
 * These tags are used by prompt-tsx to structure content.
 * Tags not in this mapping default to User Context / Messages.
 */
const tagToLabelMapping: Record<string, { category: string; label: string }> = {
	// System category - Instructions (LLM behavior guidance)
	instructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	toolUseInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	editFileInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	outputFormatting: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	modeInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	reminderInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	notebookInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	notebookFormatInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	fileLinkification: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	replaceStringInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	applyPatchInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	codebaseToolInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	codeSearchInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	codeSearchToolUseInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	vscodeAPIToolUseInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	vscodeCmdToolUseInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	searchExtensionToolUseInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	extensionSearchResponseRules: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	grounding: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	// Model-specific instruction tags
	gptAgentInstructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	coding_agent_instructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	// Workflow and planning instructions
	workflowGuidance: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	structuredWorkflow: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	taskTracking: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	planning: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	planning_instructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	task_execution: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	testing: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	validating_work: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	progress_updates: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	// Personality and communication style
	personality: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	communicationStyle: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	communicationExamples: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	communicationGuidelines: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	ambition_vs_precision: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	autonomy_and_persistence: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	contextManagement: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	// Final answer formatting
	final_answer_formatting: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	final_answer_instructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	final_answer_structure_and_style_guidelines: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	presenting_your_work_and_final_message: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	// Other system-level guidance
	tool_preambles: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	tool_use: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	parallel_tool_use_instructions: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	editing_constraints: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	exploration_and_reading_files: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	additional_notes: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	handling_errors_and_unexpected_outputs: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	special_user_requests: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	frontend_tasks: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	special_formatting: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	user_updates_spec: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	design_and_scope_constraints: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	long_context_handling: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	uncertainty_and_ambiguity: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	high_risk_self_check: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	patchFormat: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	responseTemplate: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },
	importantReminders: { category: PromptTokenCategory.System, label: PromptTokenLabel.SystemInstructions },

	// User Context category - Files (file-based context and attachments)
	attachment: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	attachments: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	file: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	editorContext: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	currentDocument: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	currentFile: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	resource: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	selection: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	documentFragment: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	languageServerContext: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	symbolDefinitions: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	symbol: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	// Code context
	codeToTest: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	testsFile: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	testExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	testDependencies: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	sampleTest: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	relatedTest: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	relatedSource: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	readme: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	// Git/diff context
	'original-code': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	'code-changes': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	changeDescription: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	currentChange: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	// Notebook cells
	cell: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	cellsAbove: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	cellsBelow: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	'cell-output': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	'notebook-cell-output': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	some_of_the_cells_after_edit: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	// Workspace and environment info (treated as file-like context)
	workspaceFolder: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },
	projectLabels: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Files },

	// User Context category - Tool Results (diagnostics and errors)
	error: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	errors: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	compileError: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	suggestedFix: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	testFailure: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	'cell-execution-error': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	stackFrame: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	feedback: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	analysis: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	criteria: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	invalidPatch: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	correctedEdit: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	actualOutput: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	expectedOutput: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },
	match: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.ToolResults },

	// User Context category - Messages (user input and conversation, also examples)
	// Note: tags not in this mapping default to Messages
	userRequest: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	UserRequest: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	userPrompt: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	user_query: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	prompt: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	context: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	environment_info: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	workspace_info: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	reminder: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	note: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	todoList: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	task: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	toolReferences: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	// Conversation/history elements
	user: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	assistant: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	tool: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	'conversation-summary': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	message: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	summary: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	// Examples (few-shot)
	example: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	examples: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	response: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	Response: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	request: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	// VS Code specific context
	settings: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	command: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	currentVSCodeVersion: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	releaseNotes: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	// Example tags for VS Code participant
	singleSettingExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	singleCommandExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	multipleSettingsExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	multipleCommandsExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	noSuchCommandExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	invalidQuestionExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	marketplaceSearchExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	extensionResponseExample: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	// File context hints
	'file-selection': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	'file-cursor-context': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	'additional-info': { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
	instruction: { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages },
};

/**
 * Default mapping for unknown tags
 */
const defaultTagMapping = { category: PromptTokenCategory.UserContext, label: PromptTokenLabel.Messages };

/**
 * Options for computing prompt token details
 */
export interface IPromptTokenDetailOptions {
	/** The messages that make up the prompt */
	messages: Raw.ChatMessage[];
	/** The tokenizer to use for counting tokens */
	tokenizer: ITokenizer;
	/** The total prompt token count (if already known, avoids recomputation) */
	totalPromptTokens?: number;
	/** The tools available to the model */
	tools?: readonly LanguageModelToolInformation[];
}

/**
 * Internal structure for accumulating token counts by category and label
 */
interface TokenCounts {
	[category: string]: {
		[label: string]: number;
	};
}

/**
 * Parses text content to extract token counts per tagged section.
 * Unknown tags default to User Context / Messages.
 */
async function parseTextContentTokens(
	text: string,
	tokenizer: ITokenizer,
	counts: TokenCounts
): Promise<number> {
	let accountedTokens = 0;

	// Find all XML tags in the text
	const allTagsRegex = /<([a-zA-Z_][\w.\-]*)[^>]*>[\s\S]*?<\/\1>/g;
	let tagMatch;
	const processedRanges: Array<{ start: number; end: number }> = [];

	while ((tagMatch = allTagsRegex.exec(text)) !== null) {
		const tagName = tagMatch[1];
		const fullMatch = tagMatch[0];
		const matchStart = tagMatch.index;
		const matchEnd = matchStart + fullMatch.length;

		// Check if this range overlaps with an already processed range (nested tag)
		const isNested = processedRanges.some(
			range => matchStart >= range.start && matchEnd <= range.end
		);

		if (!isNested) {
			const mapping = tagToLabelMapping[tagName] ?? defaultTagMapping;
			const tokens = await tokenizer.tokenLength(fullMatch);

			if (!counts[mapping.category]) {
				counts[mapping.category] = {};
			}
			counts[mapping.category][mapping.label] = (counts[mapping.category][mapping.label] || 0) + tokens;
			accountedTokens += tokens;

			processedRanges.push({ start: matchStart, end: matchEnd });
		}
	}

	return accountedTokens;
}

/**
 * Computes the prompt token detail breakdown showing percentage of tokens used
 * by different categories (System, Conversation, Context).
 *
 * @param options - Options containing messages, tokenizer, and optional pre-computed total
 * @returns Promise resolving to an array of ChatResultPromptTokenDetail with percentages
 */
export async function computePromptTokenDetails(
	options: IPromptTokenDetailOptions
): Promise<ChatResultPromptTokenDetail[]> {
	const { messages, tokenizer, tools } = options;

	// Compute token counts by category and label
	const counts: TokenCounts = {
		[PromptTokenCategory.System]: {},
		[PromptTokenCategory.UserContext]: {},
	};

	// Count tokens per message based on role and content
	for (const message of messages) {
		const messageTokens = await tokenizer.countMessageTokens(message);

		switch (message.role) {
			case Raw.ChatRole.System:
				counts[PromptTokenCategory.System][PromptTokenLabel.SystemInstructions] =
					(counts[PromptTokenCategory.System][PromptTokenLabel.SystemInstructions] || 0) + messageTokens;
				break;

			case Raw.ChatRole.User: {
				// Parse content parts for more granular categorization
				let accountedTokens = 0;

				for (const part of message.content) {
					if (part.type === Raw.ChatCompletionContentPartKind.Text) {
						// Parse tagged sections in text content
						const taggedTokens = await parseTextContentTokens(part.text, tokenizer, counts);
						accountedTokens += taggedTokens;
					} else if (part.type === Raw.ChatCompletionContentPartKind.Image || part.type === Raw.ChatCompletionContentPartKind.Document) {
						// Count image/document tokens as Files
						const partTokens = await tokenizer.tokenLength(part);
						counts[PromptTokenCategory.UserContext][PromptTokenLabel.Files] =
							(counts[PromptTokenCategory.UserContext][PromptTokenLabel.Files] || 0) + partTokens;
						accountedTokens += partTokens;
					}
				}

				// Any unaccounted tokens go to Messages
				const unaccountedTokens = messageTokens - accountedTokens;
				if (unaccountedTokens > 0) {
					counts[PromptTokenCategory.UserContext][PromptTokenLabel.Messages] =
						(counts[PromptTokenCategory.UserContext][PromptTokenLabel.Messages] || 0) + unaccountedTokens;
				}
				break;
			}

			case Raw.ChatRole.Tool:
				// Tool messages are tool results
				counts[PromptTokenCategory.UserContext][PromptTokenLabel.ToolResults] =
					(counts[PromptTokenCategory.UserContext][PromptTokenLabel.ToolResults] || 0) + messageTokens;
				break;

			case Raw.ChatRole.Assistant:
			default:
				// Assistant messages are part of conversation history
				counts[PromptTokenCategory.UserContext][PromptTokenLabel.Messages] =
					(counts[PromptTokenCategory.UserContext][PromptTokenLabel.Messages] || 0) + messageTokens;
				break;
		}
	}

	// Count tool tokens
	if (tools && tools.length > 0) {
		const toolTokens = await tokenizer.countToolTokens(tools);
		counts[PromptTokenCategory.System][PromptTokenLabel.Tools] = toolTokens;
	}

	// Calculate total tokens
	let totalTokens = options.totalPromptTokens;
	if (totalTokens === undefined) {
		totalTokens = await tokenizer.countMessagesTokens(messages);
		if (tools && tools.length > 0) {
			totalTokens += await tokenizer.countToolTokens(tools);
		}
	}

	// Convert counts to percentages
	const details: ChatResultPromptTokenDetail[] = [];

	for (const [category, labels] of Object.entries(counts)) {
		for (const [label, tokenCount] of Object.entries(labels)) {
			if (tokenCount > 0) {
				const percentage = totalTokens > 0
					? Math.round((tokenCount / totalTokens) * 100)
					: 0;
				if (percentage > 0) {
					details.push({
						category,
						label,
						percentageOfPrompt: percentage,
					});
				}
			}
		}
	}

	return details;
}
