/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ToolInputSchema {
	readonly type: 'object';
	readonly properties: Record<string, ToolInputProperty>;
	readonly required?: ReadonlyArray<string>;
}

export interface ToolInputProperty {
	readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
	readonly description?: string;
	readonly items?: ToolInputProperty;
	readonly enum?: ReadonlyArray<string | number>;
}

export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: ToolInputSchema;
}

export interface ToolExecutionResult {
	readonly content: string;
	readonly isError?: boolean;
}

export interface ToolExecutionContext {
	readonly workspaceRoot: string | undefined;
	readonly readFile: (relPath: string) => Promise<string>;
	readonly readDir: (relPath: string) => Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>>;
	readonly searchTextInWorkspace: (query: string, maxMatches: number) => Promise<ReadonlyArray<{ relPath: string; line: number; preview: string }>>;
	readonly writeFile: (relPath: string, content: string) => Promise<{ written: boolean; reason?: string }>;
	readonly runCommand: (command: string, args: ReadonlyArray<string>, opts: { cwd?: string; timeoutMs?: number }) => Promise<{ ran: boolean; reason?: string; stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean }>;
}

export interface Tool {
	readonly definition: ToolDefinition;
	execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}
