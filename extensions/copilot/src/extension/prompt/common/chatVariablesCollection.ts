/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { sessionResourceToId } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { URI } from '../../../util/vs/base/common/uri';

export interface PromptVariable {
	readonly reference: vscode.ChatPromptReference;
	readonly originalName: string;
	readonly uniqueName: string;
	readonly value: string | vscode.Uri | vscode.Location | unknown;
	readonly range?: [start: number, end: number];
	readonly isMarkedReadonly: boolean | undefined;
}

export class ChatVariablesCollection {
	private _variables: PromptVariable[] | null = null;

	static merge(...collections: ChatVariablesCollection[]): ChatVariablesCollection {
		const allReferences: vscode.ChatPromptReference[] = [];
		const seen = new Set<string>();
		for (const collection of collections) {
			for (const variable of collection) {
				const ref = variable.reference;

				// simple dedupe
				let key: string;
				try {
					key = JSON.stringify(ref.value);
				} catch {
					key = ref.id + String(ref.value);
				}

				if (!seen.has(key)) {
					seen.add(key);
					allReferences.push(ref);
				}
			}
		}

		return new ChatVariablesCollection(allReferences);
	}

	constructor(
		private readonly _source: readonly vscode.ChatPromptReference[] = []
	) { }

	private _getVariables(): PromptVariable[] {
		if (!this._variables) {
			this._variables = [];
			for (let i = 0; i < this._source.length; i++) {
				const variable = this._source[i];
				// Rewrite the message to use the variable header name
				if (variable.value) {
					const originalName = variable.name;
					const uniqueName = this.uniqueFileName(originalName, this._source.slice(0, i));
					this._variables.push({ reference: variable, originalName, uniqueName, value: variable.value, range: variable.range, isMarkedReadonly: variable.isReadonly });
				}
			}
		}
		return this._variables;
	}

	public reverse() {
		const sourceCopy = this._source.slice(0);
		sourceCopy.reverse();
		return new ChatVariablesCollection(sourceCopy);
	}

	public find(predicate: (v: PromptVariable) => boolean): PromptVariable | undefined {
		return this._getVariables().find(predicate);
	}

	public filter(predicate: (v: PromptVariable) => boolean): ChatVariablesCollection {
		const resultingReferences: vscode.ChatPromptReference[] = [];
		for (const variable of this._getVariables()) {
			if (predicate(variable)) {
				resultingReferences.push(variable.reference);
			}
		}
		return new ChatVariablesCollection(resultingReferences);
	}

	public *[Symbol.iterator](): IterableIterator<PromptVariable> {
		yield* this._getVariables();
	}

	public substituteVariablesWithReferences(userQuery: string): string {
		// no rewriting at the moment
		return userQuery;
	}

	public hasVariables(): boolean {
		return this._getVariables().length > 0;
	}

	private uniqueFileName(name: string, variables: vscode.ChatPromptReference[]): string {
		const count = variables.filter(v => v.name === name).length;
		return count === 0 ? name : `${name}-${count}`;
	}

}

/**
 * Check if provided variable is a "prompt file".
 */
export function isPromptFile(variable: PromptVariable): variable is PromptVariable & { value: vscode.Uri } {
	return variable.reference.id.startsWith(PromptFileIdPrefix);
}

export const PromptFileIdPrefix = 'vscode.prompt.file';

/**
 * Check if provided variable is an "instruction file".
 */
export function isInstructionFile(variable: PromptVariable): variable is PromptVariable & { value: vscode.Uri } {
	return variable.reference.id.startsWith(InstructionFileIdPrefix);
}

export const InstructionFileIdPrefix = 'vscode.instructions.file';

/**
 * Check if provided variable is the workspace "customizations index" file.
 */
export function isCustomizationsIndex(variable: PromptVariable): variable is PromptVariable & { value: string } {
	return variable.reference.id === CustomizationsIndexId;
}

export const CustomizationsIndexId = 'vscode.customizations.index';

/**
 * URI schemes used for chat session references.
 */
export const SessionReferenceSchemes: ReadonlySet<string> = new Set(['vscode-chat-session', 'copilotcli', 'claude-code']);

/**
 * Check if a URI scheme identifies a chat session reference.
 */
export function isSessionReferenceScheme(scheme: string): boolean {
	return SessionReferenceSchemes.has(scheme);
}

/**
 * Check if provided variable is a session reference.
 */
export function isSessionReference(variable: PromptVariable): variable is PromptVariable & { value: vscode.Uri } {
	return URI.isUri(variable.value) && isSessionReferenceScheme(variable.value.scheme);
}

/**
 * Build the attributes for rendering a session reference as an `<attachment>` tag.
 * Callers can pass the result to `<Tag name='attachment' attrs={...} />`.
 */
export function sessionReferenceAttachmentAttrs(variable: PromptVariable & { value: vscode.Uri }): Record<string, string> {
	const attrs: Record<string, string> = {};
	if (variable.uniqueName) {
		attrs.id = `${variable.uniqueName} (${sessionResourceToId(variable.value)})`;
	}
	attrs.filePath = variable.value.toString();
	return attrs;
}

/**
 * Extract debug-target session IDs from chat prompt references.
 * Returns `undefined` when no session references are present.
 */
export function extractDebugTargetSessionIds(references: readonly vscode.ChatPromptReference[]): readonly string[] | undefined {
	const sessionRefs = references.filter(ref => URI.isUri(ref.value) && isSessionReferenceScheme(ref.value.scheme));
	return sessionRefs.length > 0 ? sessionRefs.map(ref => sessionResourceToId(ref.value as URI)) : undefined;
}

export interface PromptFileSlashCommandId {
	readonly name: string;
	readonly id: string;
}

/**
 * Extracts the effective slash command ID and display name for a prompt file variable.
 * - For skills (SKILL.md), the ID is the parent folder name.
 * - For prompt files (.prompt.md), the ID is the filename without the .prompt.md extension.
 * - Otherwise, the ID is the reference name.
 */
export function getPromptFileSlashCommandId(variable: PromptVariable): PromptFileSlashCommandId {
	const name = variable.reference.name;
	const uri = variable.value;
	const pathSegments = URI.isUri(uri) ? uri.path.split('/').filter(Boolean) : [];
	const lastSegment = pathSegments[pathSegments.length - 1];
	const isSkillFile = lastSegment?.toLowerCase() === 'skill.md';
	let id: string;
	if (isSkillFile && pathSegments.length >= 2) {
		id = pathSegments[pathSegments.length - 2];
	} else if (lastSegment?.endsWith('.prompt.md')) {
		id = lastSegment.slice(0, -'.prompt.md'.length);
	} else {
		id = name;
	}
	return { name, id };
}

export interface ParsedSlashCommand {
	/** The matched prompt file slash command ID. */
	readonly promptFile: PromptFileSlashCommandId;
	/** The matched PromptVariable (the prompt file reference). */
	readonly variable: PromptVariable;
	/** The raw slash command string parsed from the query (without the leading `/`). */
	readonly command: string;
	/** Any trailing arguments after the slash command. */
	readonly args: string;
}

/**
 * Parses a query for a `/command` pattern and matches it against prompt file references.
 * Returns the matched prompt file and parsed arguments, or `undefined` if no match.
 */
export function parseSlashCommand(query: string, chatVariables: ChatVariablesCollection): ParsedSlashCommand | undefined {
	const slashCommandMatch = query.match(/^\s*\/(?<command>\S+)(?:\s+(?<args>.*))?$/s);
	const slashCommand = slashCommandMatch?.groups?.command;
	if (!slashCommand) {
		return undefined;
	}
	const args = slashCommandMatch?.groups?.args?.trim() ?? '';
	for (const variable of chatVariables) {
		if (!isPromptFile(variable)) {
			continue;
		}
		const promptFile = getPromptFileSlashCommandId(variable);
		if (promptFile.id === slashCommand) {
			return { promptFile, variable, command: slashCommand, args };
		}
	}
	return undefined;
}
