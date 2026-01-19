/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type AICoreMode = 'chat' | 'inline' | 'edit' | 'agent';

export interface AICoreContextHint {
	location?: 'chat' | 'inline' | 'edit' | 'agent' | 'unknown';
}

export interface AICoreRequest {
	sessionId: string;
	message: string;
	mode?: AICoreMode;
	agentId?: string;
	modelId?: string;
	userContext?: AICoreContextHint;
}

export interface AICoreResponseMeta {
	source?: 'noop' | 'model';
	durationMs?: number;
	/** 应用的 Spec 规则数量 */
	specRulesApplied?: number;
}

export interface AICoreResponse {
	content: string;
	parts?: AICoreResponsePart[];
	toolPlan?: AICoreToolPlan;
	edits?: AICoreEdits;
	meta?: AICoreResponseMeta;
}

export type AICoreResponsePart =
	| { kind: 'markdown'; value: string }
	| { kind: 'code'; value: string; language?: string }
	| { kind: 'progress'; value: string }
	| { kind: 'tool'; value: AICoreToolInvocation }
	| { kind: 'edits'; value: AICoreEdits };

export interface AICoreFileContext {
	uri: string;
	content: string;
	languageId?: string;
	ranges?: Array<[number, number]>;
	isActive?: boolean;
}

export interface AICoreSymbol {
	name: string;
	kind: string;
	range: [number, number, number, number]; // startLine, startCol, endLine, endCol
	containerName?: string;
}

export interface AICoreContext {
	files: AICoreFileContext[];
	recentFiles?: AICoreFileContext[];
	symbols?: AICoreSymbol[];
	snippets?: Array<{ uri: string; snippet: string }>;
	search?: Array<{ uri: string; score: number; excerpt: string }>;
}

export interface AICoreToolPlan {
	steps: AICoreToolInvocation[];
}

export interface AICoreToolInvocation {
	id: string;
	toolId: string;
	input: unknown;
	requireConfirmation?: boolean;
}

export interface AICoreToolResult {
	results: Array<{ id: string; output: unknown }>;
}

export interface AICoreEdits {
	changes: Array<{
		uri: string;
		edits: Array<{ range: [number, number, number, number]; text: string }>;
	}>;
}

export interface AICoreEditResult {
	applied: boolean;
}
