/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ArgumentParserResult, parseArguments } from './autocomplete-parser/parseArguments';
import type { FigState } from './autocomplete/fig/hooks';
import { createGeneratorState } from './autocomplete/state/generators';
import { Visibility, type AutocompleteState } from './autocomplete/state/types';
import { SuggestionFlag } from './shared/utils';
import { getCommand, type Command } from './shell-parser/command';
import { createCompletionItem } from '../helpers/completionItem';

export interface IFigSuggestionsResult {
	filesRequested: boolean;
	foldersRequested: boolean;
	items: vscode.TerminalCompletionItem[] | undefined;
}

export async function getFigSuggestions(
	spec: Fig.Spec,
	terminalContext: { commandLine: string; cursorPosition: number },
	prefix: string,
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	name: string,
	token?: vscode.CancellationToken
): Promise<IFigSuggestionsResult | undefined> {
	let filesRequested = false;
	let foldersRequested = false;

	const command = getCommand(terminalContext.commandLine, {}, terminalContext.cursorPosition);
	if (!command || !shellIntegrationCwd) {
		return;
	}
	const parsedArguments: ArgumentParserResult = await parseArguments(
		command,
		{ environmentVariables: env, currentWorkingDirectory: shellIntegrationCwd.fsPath, sshPrefix: '', currentProcess: name, /* TODO: pass in aliases */ },
		spec,
	);

	const items: vscode.TerminalCompletionItem[] = [];
	// TODO: Pass in and respect cancellation token
	const completionItemResult = await collectCompletionItemResult(command, parsedArguments, prefix, terminalContext, shellIntegrationCwd, items);
	if (token?.isCancellationRequested) {
		return undefined;
	}

	if (completionItemResult) {
		filesRequested = completionItemResult.filesRequested;
		foldersRequested = completionItemResult.foldersRequested;
	}

	return {
		items: items,
		filesRequested,
		foldersRequested
	};
}

export type SpecArg = Fig.Arg | Fig.Suggestion | Fig.Option | string;

export async function collectCompletionItemResult(
	command: Command,
	parsedArguments: ArgumentParserResult,
	prefix: string,
	terminalContext: { commandLine: string; cursorPosition: number },
	shellIntegrationCwd: vscode.Uri | undefined,
	items: vscode.TerminalCompletionItem[]
): Promise<{ filesRequested: boolean; foldersRequested: boolean } | undefined> {
	let filesRequested = false;
	let foldersRequested = false;

	const addSuggestions = async (specArgs: SpecArg[] | Record<string, SpecArg> | undefined, kind: vscode.TerminalCompletionItemKind, parsedArguments?: ArgumentParserResult) => {
		if (kind === vscode.TerminalCompletionItemKind.Argument && parsedArguments?.currentArg?.generators) {
			const generators = parsedArguments.currentArg.generators;
			for (const generator of generators) {
				// Only some templates are supported, these are applied generally before calling
				// into the general fig code for now
				if (generator.template) {
					const templates = Array.isArray(generator.template) ? generator.template : [generator.template];
					for (const template of templates) {
						if (template === 'filepaths') {
							filesRequested = true;
						} else if (template === 'folders') {
							foldersRequested = true;
						}
					}
				}

				const initialFigState: FigState = {
					buffer: terminalContext.commandLine,
					cursorLocation: terminalContext.cursorPosition,
					cwd: shellIntegrationCwd?.fsPath ?? null,
					processUserIsIn: null,
					sshContextString: null,
					aliases: {},
					environmentVariables: {},
					shellContext: undefined,
				};
				const state: AutocompleteState = {
					figState: initialFigState,
					parserResult: parsedArguments,
					generatorStates: [],
					command,

					visibleState: Visibility.HIDDEN_UNTIL_KEYPRESS,
					lastInsertedSuggestion: null,
					justInserted: false,

					selectedIndex: 0,
					suggestions: [],
					hasChangedIndex: false,

					historyModeEnabled: false,
					fuzzySearchEnabled: false,
					userFuzzySearchEnabled: false,
				};
				const s = createGeneratorState(state);
				const generatorResults = s.triggerGenerators(parsedArguments);
				for (const generatorResult of generatorResults) {
					for (const item of (await generatorResult?.request) ?? []) {
						if (!item.name) {
							continue;
						}
						const suggestionLabels = getFigSuggestionLabel(item);
						if (!suggestionLabels) {
							continue;
						}
						for (const label of suggestionLabels) {
							items.push(createCompletionItem(
								terminalContext.cursorPosition,
								prefix,
								{ label },
								undefined,
								typeof item === 'string' ? item : item.description,
								kind
							));
						}
					}
				}
			}
		}
		if (!specArgs) {
			return { filesRequested, foldersRequested };
		}

		if (Array.isArray(specArgs)) {
			for (const item of specArgs) {
				const suggestionLabels = getFigSuggestionLabel(item);
				if (!suggestionLabels) {
					continue;
				}
				for (const label of suggestionLabels) {
					items.push(
						createCompletionItem(
							terminalContext.cursorPosition,
							prefix,
							{ label },
							undefined,
							typeof item === 'string' ? item : item.description,
							kind
						)
					);
				}
			}
		} else {
			for (const [label, item] of Object.entries(specArgs)) {
				items.push(
					createCompletionItem(
						terminalContext.cursorPosition,
						prefix,
						{ label },
						undefined,
						typeof item === 'string' ? item : item.description,
						kind
					)
				);
			}
		}
	};

	if (parsedArguments.suggestionFlags & SuggestionFlag.Args) {
		await addSuggestions(parsedArguments.currentArg?.suggestions, vscode.TerminalCompletionItemKind.Argument, parsedArguments);
	}
	if (parsedArguments.suggestionFlags & SuggestionFlag.Subcommands) {
		await addSuggestions(parsedArguments.completionObj.subcommands, vscode.TerminalCompletionItemKind.Method);
	}
	if (parsedArguments.suggestionFlags & SuggestionFlag.Options) {
		await addSuggestions(parsedArguments.completionObj.options, vscode.TerminalCompletionItemKind.Flag);
	}

	return { filesRequested, foldersRequested };
}

export function getFixSuggestionDescription(spec: Fig.Spec): string {
	if ('description' in spec) {
		return spec.description ?? '';
	}
	return '';
}

export function getFigSuggestionLabel(spec: Fig.Spec | Fig.Arg | Fig.Suggestion | string): string[] | undefined {
	if (typeof spec === 'string') {
		return [spec];
	}
	if (typeof spec.name === 'string') {
		return [spec.name];
	}
	if (!Array.isArray(spec.name) || spec.name.length === 0) {
		return;
	}
	return spec.name;
}
