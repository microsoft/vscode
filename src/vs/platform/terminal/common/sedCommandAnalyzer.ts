/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SedCommandAnalysis {
	Safe,
	RequiresConfirmation,
}

interface IShellWord {
	readonly value: string;
	readonly hasRuntimeExpansion: boolean;
}

const inPlaceLongOption = '--in-place';

export function analyzeSedCommand(commandText: string): SedCommandAnalysis {
	const words = tokenizeCommand(commandText);
	const executable = words[0];
	if (!executable || !/^sed\b/.test(executable.value)) {
		return SedCommandAnalysis.Safe;
	}
	if (executable.hasRuntimeExpansion) {
		return SedCommandAnalysis.RequiresConfirmation;
	}

	for (const word of words.slice(1)) {
		if (word.value === '--') {
			break;
		}
		if (word.hasRuntimeExpansion) {
			return SedCommandAnalysis.RequiresConfirmation;
		}
		if (word.value.startsWith('--')) {
			const optionName = word.value.split('=', 1)[0];
			if (optionName.length >= 3 && inPlaceLongOption.startsWith(optionName)) {
				return SedCommandAnalysis.RequiresConfirmation;
			}
			continue;
		}
		if (word.value.startsWith('-') && /[iI]/.test(word.value.slice(1))) {
			return SedCommandAnalysis.RequiresConfirmation;
		}
	}
	return SedCommandAnalysis.Safe;
}

function tokenizeCommand(commandText: string): IShellWord[] {
	const words: IShellWord[] = [];
	let value = '';
	let hasRuntimeExpansion = false;
	let quote: '\'' | '"' | undefined;
	let escaping = false;
	let wordStarted = false;

	const pushWord = () => {
		words.push({ value, hasRuntimeExpansion });
		value = '';
		hasRuntimeExpansion = false;
		wordStarted = false;
	};

	for (const char of commandText) {
		if (escaping) {
			wordStarted = true;
			if (char !== '\n') {
				value += char;
			}
			escaping = false;
			continue;
		}
		if (char === '\\' && quote !== '\'') {
			wordStarted = true;
			escaping = true;
			continue;
		}
		if (char === quote) {
			quote = undefined;
			continue;
		}
		if (!quote && (char === '\'' || char === '"')) {
			wordStarted = true;
			quote = char;
			continue;
		}
		if (!quote && /\s/.test(char)) {
			if (wordStarted) {
				pushWord();
			}
			continue;
		}
		if (quote !== '\'' && (char === '$' || char === '`' || (!quote && /[*?[{()}]/.test(char)))) {
			hasRuntimeExpansion = true;
		}
		wordStarted = true;
		value += char;
	}

	if (wordStarted) {
		if (quote || escaping) {
			hasRuntimeExpansion = true;
		}
		pushWord();
	}
	return words;
}
