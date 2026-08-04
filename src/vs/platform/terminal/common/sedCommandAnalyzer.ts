/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type SedCommandAnalysis =
	| { readonly kind: 'safe' }
	| { readonly kind: 'inPlace'; readonly fileWrites: readonly string[] }
	| { readonly kind: 'requiresConfirmation' };

interface IShellWord {
	readonly value: string;
	readonly hasRuntimeExpansion: boolean;
}

interface ISedParseResult {
	readonly kind: 'safe' | 'inPlace' | 'invalidInPlace' | 'requiresConfirmation';
	readonly fileWrites?: readonly string[];
}

const safe: SedCommandAnalysis = { kind: 'safe' };
const requiresConfirmation: SedCommandAnalysis = { kind: 'requiresConfirmation' };
const inPlaceLongOption = '--in-place';

export function analyzeSedCommand(commandText: string, shellDialect: 'bash' | 'powershell' = 'bash'): SedCommandAnalysis {
	const words = tokenizeCommand(commandText, shellDialect);
	const executable = words[0];
	if (!executable || !isSedExecutable(executable.value)) {
		return safe;
	}
	if (executable.hasRuntimeExpansion) {
		return requiresConfirmation;
	}

	const results = [parseSedArguments(words.slice(1), 'gnu'), parseSedArguments(words.slice(1), 'bsd')];
	if (results.some(result => result.kind === 'requiresConfirmation')) {
		return requiresConfirmation;
	}
	const inPlaceResults = results.filter((result): result is ISedParseResult & { kind: 'inPlace'; fileWrites: readonly string[] } => result.kind === 'inPlace');
	if (inPlaceResults.length === 0) {
		return results.some(result => result.kind === 'invalidInPlace') ? requiresConfirmation : safe;
	}
	const fileWrites = [...new Set(inPlaceResults.flatMap(result => result.fileWrites))];
	return fileWrites.length > 0 ? { kind: 'inPlace', fileWrites } : requiresConfirmation;
}

function parseSedArguments(arguments_: readonly IShellWord[], style: 'gnu' | 'bsd'): ISedParseResult {
	const operands: string[] = [];
	let inPlaceSuffix: string | undefined;
	let hasScriptOption = false;
	let hasUnknownOption = false;
	let hasDynamicOperand = false;
	let optionsEnded = false;

	for (let index = 0; index < arguments_.length; index++) {
		const word = arguments_[index];
		const argument = word.value;
		if (word.hasRuntimeExpansion) {
			if (!optionsEnded) {
				return requiresConfirmation;
			}
			hasDynamicOperand = true;
		}
		if (!optionsEnded && argument === '--') {
			optionsEnded = true;
			continue;
		}
		if (!optionsEnded && argument.startsWith('--')) {
			const optionName = argument.split('=', 1)[0];
			if (style === 'gnu' && optionName.length >= 3 && inPlaceLongOption.startsWith(optionName)) {
				if (inPlaceSuffix !== undefined) {
					return requiresConfirmation;
				}
				inPlaceSuffix = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : '';
				continue;
			}
			if (isLongOptionAbbreviation(optionName, '--expression', 3) || isLongOptionAbbreviation(optionName, '--file', 4)) {
				if (optionName !== '--expression' && optionName !== '--file') {
					hasUnknownOption = true;
				}
				hasScriptOption = true;
				if (!argument.includes('=')) {
					if (++index >= arguments_.length) {
						return requiresConfirmation;
					}
					if (arguments_[index].hasRuntimeExpansion) {
						return requiresConfirmation;
					}
				}
				continue;
			}
			if (!isKnownNoArgumentLongOption(optionName)) {
				hasUnknownOption = true;
			}
			continue;
		}
		if (!optionsEnded && argument.startsWith('-') && argument.length > 1) {
			const shortOption = parseShortOptions(argument.slice(1), style);
			if (shortOption.kind === 'requiresConfirmation') {
				return shortOption;
			}
			if (shortOption.inPlaceSuffix !== undefined) {
				if (inPlaceSuffix !== undefined) {
					return requiresConfirmation;
				}
				inPlaceSuffix = shortOption.inPlaceSuffix;
				if (shortOption.consumesNextAsSuffix) {
					if (++index >= arguments_.length) {
						return requiresConfirmation;
					}
					const suffixWord = arguments_[index];
					if (suffixWord.hasRuntimeExpansion) {
						return requiresConfirmation;
					}
					inPlaceSuffix = suffixWord.value;
				}
			}
			if (shortOption.hasScriptOption) {
				hasScriptOption = true;
				if (shortOption.consumesNextAsScript) {
					if (++index >= arguments_.length || arguments_[index].hasRuntimeExpansion) {
						return requiresConfirmation;
					}
				}
			}
			hasUnknownOption ||= shortOption.hasUnknownOption;
			continue;
		}
		operands.push(argument);
	}

	if (inPlaceSuffix === undefined) {
		return { kind: 'safe' };
	}
	if (hasUnknownOption || hasDynamicOperand) {
		return requiresConfirmation;
	}
	const fileTargets = hasScriptOption ? operands : operands.slice(1);
	if (fileTargets.length === 0) {
		return { kind: 'invalidInPlace' };
	}
	const fileWrites = fileTargets.flatMap(target => getInPlaceFileWrites(target, inPlaceSuffix, style));
	return { kind: 'inPlace', fileWrites };
}

function parseShortOptions(flags: string, style: 'gnu' | 'bsd'): {
	readonly kind: 'parsed';
	readonly inPlaceSuffix?: string;
	readonly consumesNextAsSuffix: boolean;
	readonly hasScriptOption: boolean;
	readonly consumesNextAsScript: boolean;
	readonly hasUnknownOption: boolean;
} | { readonly kind: 'requiresConfirmation' } {
	let hasUnknownOption = false;
	for (let index = 0; index < flags.length; index++) {
		const flag = flags[index];
		if (flag === 'e' || flag === 'f') {
			return {
				kind: 'parsed',
				consumesNextAsSuffix: false,
				hasScriptOption: true,
				consumesNextAsScript: index === flags.length - 1,
				hasUnknownOption,
			};
		}
		if (flag === 'i' || (style === 'bsd' && flag === 'I')) {
			return {
				kind: 'parsed',
				inPlaceSuffix: flags.slice(index + 1),
				consumesNextAsSuffix: style === 'bsd' && index === flags.length - 1,
				hasScriptOption: false,
				consumesNextAsScript: false,
				hasUnknownOption,
			};
		}
		if (!'nErsuzl'.includes(flag)) {
			hasUnknownOption = true;
		}
	}
	return {
		kind: 'parsed',
		consumesNextAsSuffix: false,
		hasScriptOption: false,
		consumesNextAsScript: false,
		hasUnknownOption,
	};
}

function getInPlaceFileWrites(target: string, suffix: string, style: 'gnu' | 'bsd'): string[] {
	if (!suffix) {
		return [target];
	}
	if (style === 'gnu' && suffix.includes('*')) {
		return [target, suffix.replaceAll('*', target)];
	}
	return [target, `${target}${suffix}`];
}

function isSedExecutable(value: string): boolean {
	return /(?:^|[/\\])sed(?:\.exe)?$/.test(value) || /^sed\b/.test(value);
}

function isLongOptionAbbreviation(optionName: string, fullName: string, minimumLength: number): boolean {
	return optionName.length >= minimumLength && fullName.startsWith(optionName);
}

function isKnownNoArgumentLongOption(optionName: string): boolean {
	return [
		'--debug',
		'--help',
		'--null-data',
		'--posix',
		'--quiet',
		'--regexp-extended',
		'--sandbox',
		'--separate',
		'--silent',
		'--unbuffered',
		'--version',
	].includes(optionName);
}

function tokenizeCommand(commandText: string, shellDialect: 'bash' | 'powershell'): IShellWord[] {
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

	for (let index = 0; index < commandText.length; index++) {
		const char = commandText[index];
		if (escaping) {
			wordStarted = true;
			if (char !== '\n') {
				value += char;
			}
			escaping = false;
			continue;
		}
		if (char === '\\' && shellDialect === 'bash' && quote !== '\'') {
			const next = commandText[index + 1];
			if (quote !== '"' || next === '$' || next === '`' || next === '"' || next === '\\' || next === '\n') {
				wordStarted = true;
				escaping = true;
				continue;
			}
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
