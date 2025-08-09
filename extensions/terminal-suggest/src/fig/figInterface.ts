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
import { TokenType } from '../tokens';
import type { ICompletionResource } from '../types';
import { osIsWindows } from '../helpers/os';
import { removeAnyFileExtension } from '../helpers/file';
import type { EnvironmentVariable } from './api-bindings/types';
import { asArray, availableSpecs } from '../terminalSuggestMain';
import { IFigExecuteExternals } from './execute';

export interface IFigSpecSuggestionsResult {
	filesRequested: boolean;
	foldersRequested: boolean;
	fileExtensions?: string[];
	hasCurrentArg: boolean;
	items: vscode.TerminalCompletionItem[];
}

export async function getFigSuggestions(
	specs: Fig.Spec[],
	terminalContext: { commandLine: string; cursorPosition: number },
	availableCommands: ICompletionResource[],
	currentCommandAndArgString: string,
	tokenType: TokenType,
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	name: string,
	executeExternals: IFigExecuteExternals,
	token?: vscode.CancellationToken,
): Promise<IFigSpecSuggestionsResult> {
	const result: IFigSpecSuggestionsResult = {
		filesRequested: false,
		foldersRequested: false,
		hasCurrentArg: false,
		items: [],
	};
	const currentCommand = currentCommandAndArgString.split(' ')[0];

	// Assemble a map to allow O(1) access to the available command from a spec
	// label. The label does not include an extension on Windows.
	const specLabelToAvailableCommandMap = new Map<string, ICompletionResource>();
	for (const command of availableCommands) {
		let label = typeof command.label === 'string' ? command.label : command.label.label;
		if (osIsWindows()) {
			label = removeAnyFileExtension(label);
		}
		specLabelToAvailableCommandMap.set(label, command);
	}

	for (const spec of specs) {
		const specLabels = getFigSuggestionLabel(spec);

		if (!specLabels) {
			continue;
		}
		for (const specLabel of specLabels) {
			const availableCommand = specLabelToAvailableCommandMap.get(specLabel);
			if (!availableCommand || (token && token.isCancellationRequested)) {
				continue;
			}

			// push it to the completion items
			if (tokenType === TokenType.Command) {
				if (availableCommand.kind !== vscode.TerminalCompletionItemKind.Alias) {
					const description = getFixSuggestionDescription(spec);
					result.items.push(createCompletionItem(
						terminalContext.cursorPosition,
						currentCommandAndArgString,
						{
							label: { label: specLabel, description },
							kind: vscode.TerminalCompletionItemKind.Method
						},
						description,
						availableCommand.detail
					));
				}
				continue;
			}

			const commandAndAliases = (osIsWindows()
				? availableCommands.filter(command => specLabel === removeAnyFileExtension(command.definitionCommand ?? (typeof command.label === 'string' ? command.label : command.label.label)))
				: availableCommands.filter(command => specLabel === (command.definitionCommand ?? (typeof command.label === 'string' ? command.label : command.label.label))));
			if (
				!(osIsWindows()
					? commandAndAliases.some(e => currentCommand === (removeAnyFileExtension((typeof e.label === 'string' ? e.label : e.label.label))))
					: commandAndAliases.some(e => currentCommand === (typeof e.label === 'string' ? e.label : e.label.label)))
			) {
				continue;
			}

			const actualSpec = availableCommand.definitionCommand ? availableSpecs.find(s => s.name === availableCommand.definitionCommand) : spec;
			if (!actualSpec) {
				continue;
			}
			const completionItemResult = await getFigSpecSuggestions(actualSpec, terminalContext, currentCommandAndArgString, shellIntegrationCwd, env, name, executeExternals, token);
			result.hasCurrentArg ||= !!completionItemResult?.hasCurrentArg;
			if (completionItemResult) {
				result.filesRequested ||= completionItemResult.filesRequested;
				result.foldersRequested ||= completionItemResult.foldersRequested;
				result.fileExtensions ||= completionItemResult.fileExtensions;
				if (completionItemResult.items) {
					result.items = result.items.concat(completionItemResult.items);
				}
			}
		}
	}
	return result;
}

async function getFigSpecSuggestions(
	spec: Fig.Spec,
	terminalContext: { commandLine: string; cursorPosition: number },
	prefix: string,
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	name: string,
	executeExternals: IFigExecuteExternals,
	token?: vscode.CancellationToken,
): Promise<IFigSpecSuggestionsResult | undefined> {
	let filesRequested = false;
	let foldersRequested = false;
	let fileExtensions: string[] | undefined;

	const command = getCommand(terminalContext.commandLine, {}, terminalContext.cursorPosition);
	if (!command || !shellIntegrationCwd) {
		return;
	}
	const shellContext: Fig.ShellContext = {
		environmentVariables: env,
		currentWorkingDirectory: shellIntegrationCwd.fsPath,
		sshPrefix: '',
		currentProcess: name,
		// TODO: pass in aliases
	};
	const parsedArguments: ArgumentParserResult = await parseArguments(command, shellContext, spec, executeExternals);

	const items: vscode.TerminalCompletionItem[] = [];
	// TODO: Pass in and respect cancellation token
	const completionItemResult = await collectCompletionItemResult(command, parsedArguments, prefix, terminalContext, shellIntegrationCwd, env, items, executeExternals);
	if (token?.isCancellationRequested) {
		return undefined;
	}

	if (completionItemResult) {
		filesRequested = completionItemResult.filesRequested;
		foldersRequested = completionItemResult.foldersRequested;
		fileExtensions = completionItemResult.fileExtensions;
	}

	return {
		filesRequested,
		foldersRequested,
		fileExtensions,
		hasCurrentArg: !!parsedArguments.currentArg,
		items,
	};
}

export type SpecArg = Fig.Arg | Fig.Suggestion | Fig.Option | string;

export async function collectCompletionItemResult(
	command: Command,
	parsedArguments: ArgumentParserResult,
	prefix: string,
	terminalContext: { commandLine: string; cursorPosition: number },
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	items: vscode.TerminalCompletionItem[],
	executeExternals: IFigExecuteExternals
): Promise<{ filesRequested: boolean; foldersRequested: boolean; fileExtensions: string[] | undefined } | undefined> {
	let filesRequested = false;
	let foldersRequested = false;
	let fileExtensions: string[] | undefined;

	const addSuggestions = async (specArgs: SpecArg[] | Record<string, SpecArg> | undefined, kind: vscode.TerminalCompletionItemKind, parsedArguments?: ArgumentParserResult) => {
		if (kind === vscode.TerminalCompletionItemKind.Argument && parsedArguments?.currentArg?.generators) {
			const generators = parsedArguments.currentArg.generators;
			const initialFigState: FigState = {
				buffer: terminalContext.commandLine,
				cursorLocation: terminalContext.cursorPosition,
				cwd: shellIntegrationCwd?.fsPath ?? null,
				processUserIsIn: null,
				sshContextString: null,
				aliases: {},
				environmentVariables: env,
				shellContext: {
					currentWorkingDirectory: shellIntegrationCwd?.fsPath,
					environmentVariables: convertEnvRecordToArray(env),
				},
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
			const s = createGeneratorState(state, executeExternals);
			const generatorResults = s.triggerGenerators(parsedArguments, executeExternals);
			for (const generatorResult of generatorResults) {
				for (const item of (await generatorResult?.request) ?? []) {
					if (item.type === 'file') {
						filesRequested = true;
						foldersRequested = true;
						fileExtensions = item._internal?.fileExtensions as string[] | undefined;
					}
					if (item.type === 'folder') {
						foldersRequested = true;
					}

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
			}
		}
		if (!specArgs) {
			return { filesRequested, foldersRequested };
		}
		const flagsToExclude = kind === vscode.TerminalCompletionItemKind.Flag ? parsedArguments?.passedOptions.map(option => option.name).flat() : undefined;

		function addItem(label: string, item: SpecArg) {
			if (flagsToExclude?.includes(label)) {
				return;
			}

			let itemKind = kind;
			const lastArgType: string | undefined = parsedArguments?.annotations.at(-1)?.type;
			if (lastArgType === 'subcommand_arg') {
				if (typeof item === 'object' && 'args' in item && (asArray(item.args ?? [])).length > 0) {
					itemKind = vscode.TerminalCompletionItemKind.Option;
				}
			}
			else if (lastArgType === 'option_arg') {
				itemKind = vscode.TerminalCompletionItemKind.OptionValue;
			}

			// Add <argName> for every argument
			let detail: string | undefined;
			if (typeof item === 'object' && 'args' in item) {
				const args = asArray(item.args);
				if (args.every(e => !!e?.name)) {
					if (args.length > 0) {
						detail = ' ' + args.map(e => {
							let result = `<${e!.name}>`;
							if (e?.isOptional) {
								result = `[${result}]`;
							}
							return result;
						}).join(' ');
					}
				}
			}

			items.push(
				createCompletionItem(
					terminalContext.cursorPosition,
					prefix,
					{
						label: detail ? { label, detail } : label
					},
					undefined,
					typeof item === 'string' ? item : item.description,
					itemKind,
				)
			);
		}

		if (Array.isArray(specArgs)) {
			for (const item of specArgs) {
				const suggestionLabels = getFigSuggestionLabel(item);
				if (!suggestionLabels?.length) {
					continue;
				}
				for (const label of suggestionLabels) {
					addItem(label, item);
				}
			}
		} else {
			for (const [label, item] of Object.entries(specArgs)) {
				addItem(label, item);
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
		await addSuggestions(parsedArguments.completionObj.options, vscode.TerminalCompletionItemKind.Flag, parsedArguments);
	}

	return { filesRequested, foldersRequested, fileExtensions };
}

function convertEnvRecordToArray(env: Record<string, string>): EnvironmentVariable[] {
	return Object.entries(env).map(([key, value]) => ({ key, value }));
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
