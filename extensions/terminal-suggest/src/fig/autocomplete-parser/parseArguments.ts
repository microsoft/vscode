/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { filepaths, folders } from '@fig/autocomplete-generators';
import * as Internal from '../shared/internal';
import {
	firstMatchingToken,
	makeArray,
	SpecLocationSource,
	SuggestionFlag,
	SuggestionFlags,
} from '../shared/utils';
// import {
// 	executeCommand,
// 	executeLoginShell,
// 	getSetting,
// 	isInDevMode,
// 	SETTINGS,
// } from '../../api-bindings-wrappers/src';
import {
	Command,
	substituteAlias,
} from '../shell-parser';
// import {
// 	getSpecPath,
// 	loadSubcommandCached,
// 	serializeSpecLocation,
// } from './loadSpec.js';
import {
	ParseArgumentsError,
	ParsingHistoryError,
	UpdateStateError,
} from './errors.js';
import { convertSubcommand, initializeDefault } from '../fig-autocomplete-shared';
import { exec, type ExecException } from 'child_process';
import type { IFigExecuteExternals } from '../execute';

type ArgArrayState = {
	args: Array<Internal.Arg> | null;
	index: number;
	variadicCount?: number;
};

export enum TokenType {
	None = 'none',
	Subcommand = 'subcommand',
	Option = 'option',
	OptionArg = 'option_arg',
	SubcommandArg = 'subcommand_arg',

	// Option chain or option passed with arg in a single token.
	Composite = 'composite',
}

export type BasicAnnotation =
	| {
		text: string;
		type: Exclude<TokenType, TokenType.Composite>;

		// Same as text, unless in CompositeAnnotation, where, e.g. in ls -lah
		// the "a" token has text: "a" but tokenName: -a
		tokenName?: string;
	}
	| {
		text: string;
		type: TokenType.Subcommand;
		spec: Internal.Subcommand;
		specLocation: Internal.SpecLocation;
	};

type CompositeAnnotation = {
	text: string;
	type: TokenType.Composite;
	subtokens: BasicAnnotation[];
};

export type Annotation = BasicAnnotation | CompositeAnnotation;

export type ArgumentParserState = {
	completionObj: Internal.Subcommand;

	optionArgState: ArgArrayState;
	subcommandArgState: ArgArrayState;
	annotations: Annotation[];
	passedOptions: Internal.Option[];

	commandIndex: number;
	// Used to exclude subcommand suggestions after user has entered a subcommand arg.
	haveEnteredSubcommandArgs: boolean;
	isEndOfOptions: boolean;
};

// Result with derived completionObj/currentArg from cached state.
export type ArgumentParserResult = {
	completionObj: Internal.Subcommand;
	currentArg: Internal.Arg | null;
	passedOptions: Internal.Option[];
	searchTerm: string;
	commandIndex: number;
	suggestionFlags: SuggestionFlags;
	annotations: Annotation[];
};

export const createArgState = (args?: Internal.Arg[]): ArgArrayState => {
	const updatedArgs: Internal.Arg[] = [];

	for (const arg of args ?? []) {
		const updatedGenerators = new Set<Fig.Generator>();
		for (let i = 0; i < arg.generators.length; i += 1) {
			const generator = arg.generators[i];
			const templateArray = makeArray(generator.template ?? []);

			let updatedGenerator: Fig.Generator | undefined;
			// TODO: Pass templates out as a result
			if (templateArray.includes('filepaths') && templateArray.includes('folders')) {
				updatedGenerator = { template: ['filepaths', 'folders'] };
			} else if (templateArray.includes('filepaths')) {
				updatedGenerator = { template: 'filepaths' };
			} else if (templateArray.includes('folders')) {
				updatedGenerator = { template: 'folders' };
			}

			if (updatedGenerator && typeof generator !== 'string' && generator.filterTemplateSuggestions) {
				updatedGenerator.filterTemplateSuggestions =
					generator.filterTemplateSuggestions;
			}
			updatedGenerators.add(updatedGenerator ?? generator);
		}

		updatedArgs.push({
			...arg,
			generators: [...updatedGenerators],
		});
	}
	return {
		args: updatedArgs.length > 0 ? updatedArgs : null,
		index: 0,
	};
};

export const flattenAnnotations = (
	annotations: Annotation[],
): BasicAnnotation[] => {
	const result: BasicAnnotation[] = [];
	for (let i = 0; i < annotations.length; i += 1) {
		const annotation = annotations[i];
		if (annotation.type === TokenType.Composite) {
			result.push(...annotation.subtokens);
		} else {
			result.push(annotation);
		}
	}
	return result;
};

export const optionsAreEqual = (a: Internal.Option, b: Internal.Option) =>
	a.name.some((name) => b.name.includes(name));

export const countEqualOptions = (
	option: Internal.Option,
	options: Internal.Option[],
) =>
	options.reduce(
		(count, opt) => (optionsAreEqual(option, opt) ? count + 1 : count),
		0,
	);

export const updateArgState = (argState: ArgArrayState): ArgArrayState => {
	// Consume an argument and update the arg state accordingly.
	const { args, index, variadicCount } = argState;

	if (args && args[index] && args[index].isVariadic) {
		return { args, index, variadicCount: (variadicCount || 0) + 1 };
	}

	if (args && args[index] && index < args.length - 1) {
		return { args, index: index + 1 };
	}

	return { args: null, index: 0 };
};

export const getCurrentArg = (argState: ArgArrayState): Internal.Arg | null =>
	(argState.args && argState.args[argState.index]) || null;

export const isMandatoryOrVariadic = (arg: Internal.Arg | null): boolean =>
	!!arg && (arg.isVariadic || !arg.isOptional);

const preferOptionArg = (state: ArgumentParserState): boolean =>
	isMandatoryOrVariadic(getCurrentArg(state.optionArgState)) ||
	!getCurrentArg(state.subcommandArgState);

const getArgState = (state: ArgumentParserState): ArgArrayState =>
	preferOptionArg(state) ? state.optionArgState : state.subcommandArgState;

const canConsumeOptions = (state: ArgumentParserState): boolean => {
	const {
		subcommandArgState,
		optionArgState,
		isEndOfOptions,
		haveEnteredSubcommandArgs,
		completionObj,
	} = state;

	if (
		haveEnteredSubcommandArgs &&
		completionObj.parserDirectives?.optionsMustPrecedeArguments === true
	) {
		return false;
	}

	if (isEndOfOptions) {
		return false;
	}
	const subcommandArg = getCurrentArg(subcommandArgState);
	const optionArg = getCurrentArg(optionArgState);

	if (isMandatoryOrVariadic(getCurrentArg(optionArgState))) {
		// If option arg is mandatory or variadic, we may still be able to consume
		// an option if options can break and we have already passed at least one
		// variadic option arg.
		if (
			optionArg?.isVariadic &&
			optionArgState.variadicCount &&
			optionArg.optionsCanBreakVariadicArg !== false
		) {
			return true;
		}
		return false;
	}

	if (
		subcommandArg &&
		subcommandArgState.variadicCount &&
		subcommandArg?.optionsCanBreakVariadicArg === false
	) {
		// If we are in the middle of a variadic subcommand arg, we cannot consume the
		// next token as an option if optionsCanBreakVariadicArg is false
		return false;
	}

	return true;
};

export const findOption = (
	spec: Internal.Subcommand,
	token: string,
): Internal.Option => {
	const option = spec.options[token] || spec.persistentOptions[token];
	if (!option) {
		throw new UpdateStateError(`Option not found: ${token}`);
	}
	return option;
};

export const findSubcommand = (
	spec: Internal.Subcommand,
	token: string,
): Internal.Subcommand => {
	const subcommand = spec.subcommands[token];
	if (!subcommand) {
		throw new UpdateStateError('Subcommand not found');
	}
	return subcommand;
};

const updateStateForSubcommand = (
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState => {
	const { completionObj, haveEnteredSubcommandArgs } = state;
	if (!completionObj.subcommands) {
		throw new UpdateStateError('No subcommands');
	}

	if (haveEnteredSubcommandArgs) {
		throw new UpdateStateError('Already entered subcommand args');
	}

	const newCompletionObj = findSubcommand(state.completionObj, token);

	const annotations: Annotation[] = [
		...state.annotations,
		{ text: token, type: TokenType.Subcommand },
	];

	if (isFinalToken) {
		return { ...state, annotations };
	}

	// Mutate for parser directives and persistent options: these are carried
	// down deterministically.
	if (!newCompletionObj.parserDirectives && completionObj.parserDirectives) {
		newCompletionObj.parserDirectives = completionObj.parserDirectives;
	}

	Object.assign(
		newCompletionObj.persistentOptions,
		completionObj.persistentOptions,
	);

	return {
		...state,
		annotations,
		// Inherit parserDirectives if not specified.
		completionObj: newCompletionObj,
		passedOptions: [],
		optionArgState: createArgState(),
		subcommandArgState: createArgState(newCompletionObj.args),
	};
};

const updateStateForOption = (
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState => {
	const option = findOption(state.completionObj, token);
	let { isRepeatable } = option;
	if (isRepeatable === false) {
		isRepeatable = 1;
	}
	if (isRepeatable !== true && isRepeatable !== undefined) {
		const currentRepetitions = countEqualOptions(option, state.passedOptions);
		if (currentRepetitions >= isRepeatable) {
			throw new UpdateStateError(
				`Cannot pass option again, already passed ${currentRepetitions} times, ` +
				`and can only be passed ${isRepeatable} times`,
			);
		}
	}

	const annotations: Annotation[] = [
		...state.annotations,
		{ text: token, type: TokenType.Option },
	];

	if (isFinalToken) {
		return { ...state, annotations };
	}

	return {
		...state,
		annotations,
		passedOptions: [...state.passedOptions, option],
		optionArgState: createArgState(option.args),
	};
};

const updateStateForOptionArg = (
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState => {
	if (!getCurrentArg(state.optionArgState)) {
		throw new UpdateStateError('Cannot consume option arg.');
	}

	const annotations: Annotation[] = [
		...state.annotations,
		{ text: token, type: TokenType.OptionArg },
	];

	if (isFinalToken) {
		return { ...state, annotations };
	}

	return {
		...state,
		annotations,
		optionArgState: updateArgState(state.optionArgState),
	};
};

const updateStateForSubcommandArg = (
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState => {
	// Consume token as subcommand arg if possible.
	if (!getCurrentArg(state.subcommandArgState)) {
		throw new UpdateStateError('Cannot consume subcommand arg.');
	}

	const annotations: Annotation[] = [
		...state.annotations,
		{ text: token, type: TokenType.SubcommandArg },
	];

	if (isFinalToken) {
		return { ...state, annotations };
	}

	return {
		...state,
		annotations,
		subcommandArgState: updateArgState(state.subcommandArgState),
		haveEnteredSubcommandArgs: true,
	};
};

const updateStateForChainedOptionToken = (
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState => {
	// Handle composite option tokens, accounting for different types of inputs.
	// https://en.wikipedia.org/wiki/Command-line_interface#Option_conventions_in_Unix-like_systems
	// See https://stackoverflow.com/a/10818697
	// Handle -- as special option flag.
	if (isFinalToken && ['-', '--'].includes(token)) {
		throw new UpdateStateError('Final token, not consuming as option');
	}

	if (token === '--') {
		return {
			...state,
			isEndOfOptions: true,
			annotations: [
				...state.annotations,
				{ text: token, type: TokenType.Option },
			],
			optionArgState: { args: null, index: 0 },
		};
	}

	const { parserDirectives } = state.completionObj;
	const isLongOption =
		parserDirectives?.flagsArePosixNoncompliant ||
		token.startsWith('--') ||
		!token.startsWith('-');

	if (isLongOption) {
		const optionSeparators = new Set(
			parserDirectives?.optionArgSeparators || '=',
		);
		const separatorMatches = firstMatchingToken(token, optionSeparators);

		if (separatorMatches) {
			// Handle long option with equals --num=10, -pnf=10, opt=10.
			const matchedSeparator = separatorMatches[0];
			const [flag, ...optionArgParts] = token.split(matchedSeparator);
			const optionArg = optionArgParts.join(matchedSeparator);
			const optionState = updateStateForOption(state, flag);

			if ((optionState.optionArgState.args?.length ?? 0) > 1) {
				throw new UpdateStateError(
					'Cannot pass argument with separator: option takes multiple args',
				);
			}

			const finalState = updateStateForOptionArg(
				optionState,
				optionArg,
				isFinalToken,
			);

			return {
				...finalState,
				annotations: [
					...state.annotations,
					{
						type: TokenType.Composite,
						text: token,
						subtokens: [
							{
								type: TokenType.Option,
								text: `${flag}${matchedSeparator}`,
								tokenName: flag,
							},
							{ type: TokenType.OptionArg, text: optionArg },
						],
					},
				],
			};
		}

		// Normal long option
		const finalState = updateStateForOption(state, token, isFinalToken);
		const option = findOption(state.completionObj, token);
		return option.requiresEquals || option.requiresSeparator
			? { ...finalState, optionArgState: { args: null, index: 0 } }
			: finalState;
	}

	let optionState = state;
	let optionArg = '';
	const subtokens: BasicAnnotation[] = [];
	let { passedOptions } = state;

	for (let i = 1; i < token.length; i += 1) {
		const [optionFlag, remaining] = [`-${token[i]}`, token.slice(i + 1)];
		passedOptions = optionState.passedOptions;
		try {
			optionState = updateStateForOption(optionState, optionFlag);
		} catch (err) {
			if (i > 1) {
				optionArg = token.slice(i);
				break;
			}
			throw err;
		}

		subtokens.push({
			type: TokenType.Option,
			text: i === 1 ? optionFlag : token[i],
			tokenName: optionFlag,
		});

		if (isMandatoryOrVariadic(getCurrentArg(optionState.optionArgState))) {
			optionArg = remaining;
			break;
		}
	}

	if (optionArg) {
		if ((optionState.optionArgState.args?.length ?? 0) > 1) {
			throw new UpdateStateError(
				'Cannot chain option argument: option takes multiple args',
			);
		}

		optionState = updateStateForOptionArg(optionState, optionArg, isFinalToken);
		passedOptions = optionState.passedOptions;
		subtokens.push({ type: TokenType.OptionArg, text: optionArg });
	}

	return {
		...optionState,
		annotations: [
			...state.annotations,
			{
				type: TokenType.Composite,
				text: token,
				subtokens,
			},
		],
		passedOptions: isFinalToken ? passedOptions : optionState.passedOptions,
	};
};

const canConsumeSubcommands = (state: ArgumentParserState): boolean =>
	!isMandatoryOrVariadic(getCurrentArg(state.optionArgState)) &&
	!state.haveEnteredSubcommandArgs;

// State machine for argument parser.
function updateState(
	state: ArgumentParserState,
	token: string,
	isFinalToken = false,
): ArgumentParserState {
	if (canConsumeSubcommands(state)) {
		try {
			return updateStateForSubcommand(state, token, isFinalToken);
		} catch (_err) {
			// Continue to other token types if we can't consume subcommand.
		}
	}

	if (canConsumeOptions(state)) {
		try {
			return updateStateForChainedOptionToken(state, token, isFinalToken);
		} catch (_err) {
			// Continue to other token types if we can't consume option.
		}
	}

	if (preferOptionArg(state)) {
		try {
			return updateStateForOptionArg(state, token, isFinalToken);
		} catch (_err) {
			// Continue to other token types if we can't consume option arg.
		}
	}

	return updateStateForSubcommandArg(state, token, isFinalToken);
}

const getInitialState = (
	spec: Internal.Subcommand,
	text?: string,
	specLocation?: Internal.SpecLocation,
): ArgumentParserState => ({
	completionObj: spec,
	passedOptions: [],

	annotations:
		text && specLocation
			? [{ text, type: TokenType.Subcommand, spec, specLocation }]
			: [],
	commandIndex: 0,

	optionArgState: createArgState(),
	subcommandArgState: createArgState(spec.args),

	haveEnteredSubcommandArgs: false,
	isEndOfOptions: false,
});

const historyExecuteShellCommand: Fig.ExecuteCommandFunction = async () => {
	throw new ParsingHistoryError(
		'Cannot run shell command while parsing history',
	);
};

function getExecuteShellCommandFunction(
	isParsingHistory = false,
	executeExternals: IFigExecuteExternals,
) {
	if (isParsingHistory) {
		return historyExecuteShellCommand;
	}
	return executeExternals.executeCommand;
}

// const getGenerateSpecCacheKey = (
// 	completionObj: Internal.Subcommand,
// 	tokenArray: string[],
// ): string | undefined => {
// 	let cacheKey: string | undefined;

// 	const generateSpecCacheKey = completionObj?.generateSpecCacheKey;
// 	if (generateSpecCacheKey) {
// 		if (typeof generateSpecCacheKey === 'string') {
// 			cacheKey = generateSpecCacheKey;
// 		} else if (typeof generateSpecCacheKey === 'function') {
// 			cacheKey = generateSpecCacheKey({
// 				tokens: tokenArray,
// 			});
// 		} else {
// 			console.error(
// 				'generateSpecCacheKey must be a string or function',
// 				generateSpecCacheKey,
// 			);
// 		}
// 	}

// 	// Return this late to ensure any generateSpecCacheKey side effects still happen
// 	// if (isInDevMode()) {
// 	// 	return undefined;
// 	// }
// 	if (typeof cacheKey === 'string') {
// 		// Prepend the spec name to the cacheKey to avoid collisions between specs.
// 		return `${tokenArray[0]}:${cacheKey}`;
// 	}
// 	return undefined;
// };

// const generateSpecForState = async (
// 	state: ArgumentParserState,
// 	tokenArray: string[],
// 	isParsingHistory = false,
// 	// localconsole: console.console = console,
// ): Promise<ArgumentParserState> => {
// 	console.debug('generateSpec', { state, tokenArray });
// 	const { completionObj } = state;
// 	const { generateSpec } = completionObj;
// 	if (!generateSpec) {
// 		return state;
// 	}

// 	try {
// 		const cacheKey = getGenerateSpecCacheKey(completionObj, tokenArray);
// 		let newSpec;
// 		if (cacheKey && generateSpecCache.has(cacheKey)) {
// 			newSpec = generateSpecCache.get(cacheKey)!;
// 		} else {
// 			const exec = getExecuteShellCommandFunction(isParsingHistory);
// 			const spec = await generateSpec(tokenArray, exec);
// 			if (!spec) {
// 				throw new UpdateStateError('generateSpec must return a spec');
// 			}
// 			newSpec = convertSubcommand(
// 				spec,
// 				initializeDefault,
// 			);
// 			if (cacheKey) generateSpecCache.set(cacheKey, newSpec);
// 		}

// 		const keepArgs = completionObj.args.length > 0;

// 		return {
// 			...state,
// 			completionObj: {
// 				...completionObj,
// 				subcommands: { ...completionObj.subcommands, ...newSpec.subcommands },
// 				options: { ...completionObj.options, ...newSpec.options },
// 				persistentOptions: {
// 					...completionObj.persistentOptions,
// 					...newSpec.persistentOptions,
// 				},
// 				args: keepArgs ? completionObj.args : newSpec.args,
// 			},
// 			subcommandArgState: keepArgs
// 				? state.subcommandArgState
// 				: createArgState(newSpec.args),
// 		};
// 	} catch (err) {
// 		if (!(err instanceof ParsingHistoryError)) {
// 			console.error(
// 				`There was an error with spec (generator owner: ${completionObj.name
// 				}, tokens: ${tokenArray.join(', ')}) generateSpec function`,
// 				err,
// 			);
// 		}
// 	}
// 	return state;
// };

export const getResultFromState = (
	state: ArgumentParserState,
): ArgumentParserResult => {
	const { completionObj, passedOptions, commandIndex, annotations } = state;

	const lastAnnotation: Annotation | undefined =
		annotations[annotations.length - 1];
	let argState = getArgState(state);
	let searchTerm = lastAnnotation?.text ?? '';

	let onlySuggestArgs = state.isEndOfOptions;

	if (lastAnnotation?.type === TokenType.Composite) {
		argState = state.optionArgState;

		const lastSubtoken =
			lastAnnotation.subtokens[lastAnnotation.subtokens.length - 1];
		if (lastSubtoken.type === TokenType.OptionArg) {
			searchTerm = lastSubtoken.text;
			onlySuggestArgs = true;
		}
	}

	const currentArg = getCurrentArg(argState);

	// Determine what to suggest from final state, always suggest args.
	let suggestionFlags: SuggestionFlags = SuggestionFlag.Args;

	// Selectively enable options or subcommand suggestions if it makes sense.
	if (!onlySuggestArgs) {
		if (canConsumeSubcommands(state)) {
			suggestionFlags |= SuggestionFlag.Subcommands;
		}
		if (canConsumeOptions(state)) {
			suggestionFlags |= SuggestionFlag.Options;
		}
	}

	return {
		completionObj,
		passedOptions,
		commandIndex,
		annotations,

		currentArg,
		searchTerm,
		suggestionFlags,
	};
};

export const initialParserState = getResultFromState(
	getInitialState({
		name: [''],
		subcommands: {},
		options: {},
		persistentOptions: {},
		parserDirectives: {},
		args: [],
	}),
);

// const parseArgumentsCache = createCache<ArgumentParserState>();
// const parseArgumentsGenerateSpecCache = createCache<ArgumentParserState>();
// const figCaches = new Set<string>();
// export const clearFigCaches = () => {
// 	for (const cache of figCaches) {
// 		parseArgumentsGenerateSpecCache.delete(cache);
// 	}
// 	return { unsubscribe: false };
// };

// const getCacheKey = (
// 	tokenArray: string[],
// 	context: Fig.ShellContext,
// 	specLocation: Internal.SpecLocation,
// ): string =>
// 	[
// 		tokenArray.slice(0, -1).join(' '),
// 		// serializeSpecLocation(specLocation),
// 		context.currentWorkingDirectory,
// 		context.currentProcess,
// 	].join(',');

// Parse all arguments in tokenArray.
const parseArgumentsCached = async (
	command: Command,
	context: Fig.ShellContext,
	spec: Fig.Spec,
	executeExternals: IFigExecuteExternals,
	// authClient: AuthClient,
	isParsingHistory?: boolean,
	startIndex = 0,
	// localconsole: console.console = console,
): Promise<ArgumentParserState> => {
	// Route to cp.exec instead, we don't need to deal with ipc
	const exec = getExecuteShellCommandFunction(isParsingHistory, executeExternals);

	let currentCommand = command;
	let tokens = currentCommand.tokens.slice(startIndex);
	// const tokenText = tokens.map((token) => token.text);

	const specPath: Fig.SpecLocation = { type: 'global', name: 'fake' };

	// tokenTest[0] is the command and the spec they need
	// const locations = specLocations || [
	// 	await getSpecPath(tokenText[0], context.currentWorkingDirectory),
	// ];
	// console.debug({ locations });

	// let cacheKey = '';
	// for (let i = 0; i < locations.length; i += 1) {
	// 	cacheKey = getCacheKey(tokenText, context, locations[i]);
	// 	if (
	// 		// !isInDevMode() &&
	// 		(parseArgumentsCache.has(cacheKey) ||
	// 			parseArgumentsGenerateSpecCache.has(cacheKey))
	// 	) {
	// 		return (
	// 			(parseArgumentsGenerateSpecCache.get(
	// 				cacheKey,
	// 			) as ArgumentParserState) ||
	// 			(parseArgumentsCache.get(cacheKey) as ArgumentParserState)
	// 		);
	// 	}
	// }

	// let spec: Internal.Subcommand | undefined;
	// let specPath: Internal.SpecLocation | undefined;
	// for (let i = 0; i < locations.length; i += 1) {
	// 	specPath = locations[i];
	// 	if (isParsingHistory && specPath?.type === SpecLocationSource.LOCAL) {
	// 		continue;
	// 	}

	// 	spec = await withTimeout(
	// 		5000,
	// 		loadSubcommandCached(specPath, context, console),
	// 	);
	// 	if (!specPath) {
	// 		throw new Error('specPath is undefined');
	// 	}

	// 	if (!spec) {
	// 		const path =
	// 			specPath.type === SpecLocationSource.LOCAL ? specPath?.path : '';
	// 		console.warn(
	// 			`Failed to load spec ${specPath.name} from ${specPath.type} ${path}`,
	// 		);
	// 	} else {
	// 		cacheKey = getCacheKey(tokenText, context, specPath);
	// 		break;
	// 	}
	// }

	if (!spec || !specPath) {
		throw new UpdateStateError('Failed loading spec');
	}

	let state: ArgumentParserState = getInitialState(
		convertSubcommand(spec, initializeDefault),
		tokens[0].text,
		specPath,
	);

	// let generatedSpec = false;

	const substitutedAliases = new Set<string>();
	let aliasError: Error | undefined;

	// Returns true if we should return state immediately after calling.
	// const updateStateForLoadSpec = async (
	// 	loadSpec: typeof state.completionObj.loadSpec,
	// 	index: number,
	// 	token?: string,
	// ) => {
	// 	const loadSpecResult =
	// 		typeof loadSpec === 'function'
	// 			? token !== undefined
	// 				? await loadSpec(token, exec)
	// 				: undefined
	// 			: loadSpec;

	// 	if (Array.isArray(loadSpecResult)) {
	// 		state = await parseArgumentsCached(
	// 			currentCommand,
	// 			context,
	// 			// authClient,
	// 			loadSpecResult,
	// 			isParsingHistory,
	// 			startIndex + index,
	// 		);
	// 		state = { ...state, commandIndex: state.commandIndex + index };
	// 		return true;
	// 	}

	// 	if (loadSpecResult) {
	// 		state = {
	// 			...state,
	// 			completionObj: {
	// 				...loadSpecResult,
	// 				parserDirectives: {
	// 					...state.completionObj.parserDirectives,
	// 					...loadSpecResult.parserDirectives,
	// 				},
	// 			},
	// 			optionArgState: createArgState(),
	// 			passedOptions: [],
	// 			subcommandArgState: createArgState(loadSpecResult.args),
	// 			haveEnteredSubcommandArgs: false,
	// 		};
	// 	}

	// 	return false;
	// };

	// if (await updateStateForLoadSpec(state.completionObj.loadSpec, 0)) {
	// 	return state;
	// }

	for (let i = 1; i < tokens.length; i += 1) {
		// TODO: Investigate generate spec
		// if (state.completionObj.generateSpec) {
		// 	state = await generateSpecForState(
		// 		state,
		// 		tokens.map((token) => token.text),
		// 		isParsingHistory,
		// 	);
		// 	generatedSpec = true;
		// }

		if (i === tokens.length - 1) {
			// Don't update state for last token.
			break;
		}

		const token = tokens[i].text;

		const lastArgObject = getCurrentArg(getArgState(state));
		const lastArgType = preferOptionArg(state)
			? TokenType.OptionArg
			: TokenType.SubcommandArg;

		const lastState = state;

		state = updateState(state, token);
		console.debug('Parser state update', { state });

		const { annotations } = state;
		const lastAnnotation = annotations[annotations.length - 1];
		const lastType =
			lastAnnotation.type === TokenType.Composite
				? lastAnnotation.subtokens[lastAnnotation.subtokens.length - 1].type
				: lastAnnotation.type;

		if (
			lastType === lastArgType &&
			lastArgObject?.parserDirectives?.alias &&
			!substitutedAliases.has(token)
		) {
			const { alias } = lastArgObject.parserDirectives;
			try {
				const aliasValue =
					typeof alias === 'string' ? alias : await alias(token, exec);
				try {
					currentCommand = substituteAlias(command, tokens[i], aliasValue);
					// tokens[...i] should be the same, but tokens[i+1...] may be different.
					substitutedAliases.add(token);
					tokens = currentCommand.tokens.slice(startIndex);
					state = lastState;
					i -= 1;
					continue;
				} catch (err) {
					console.error('Error substituting alias:', err);
					throw err;
				}
			} catch (err) {
				if (substitutedAliases.size === 0) {
					throw err;
				}
				aliasError = err as Error;
			}
		}

		// TODO: Investigate whether we want to support loadSpec, vs just importing them directly
		// let loadSpec =
		// 	lastType === TokenType.Subcommand
		// 		? state.completionObj.loadSpec
		// 		: undefined;

		// Recurse for load spec or special arg
		// if (lastType === lastArgType && lastArgObject) {
		// 	const {
		// 		isCommand,
		// 		isModule,
		// 		isScript,
		// 		loadSpec: argLoadSpec,
		// 	} = lastArgObject;
		// 	if (argLoadSpec) {
		// 		loadSpec = argLoadSpec;
		// 	} else if (isCommand || isScript) {
		// 		// const specLocation = await getSpecPath(
		// 		// 	token,
		// 		// 	context.currentWorkingDirectory,
		// 		// 	Boolean(isScript),
		// 		// );
		// 		// loadSpec = [specLocation];
		// 	} else if (isModule) {
		// 		loadSpec = [
		// 			{
		// 				name: `${isModule}${token}`,
		// 				type: SpecLocationSource.GLOBAL,
		// 			},
		// 		];
		// 	}
		// }

		// if (await updateStateForLoadSpec(loadSpec, i, token)) {
		// 	return state;
		// }

		// If error with alias and corresponding arg was not used in a loadSpec,
		// throw the error.
		if (aliasError) {
			throw aliasError;
		}

		substitutedAliases.clear();
	}

	// if (generatedSpec) {
	// 	if (tokenText[0] === 'fig') figCaches.add(cacheKey);
	// 	parseArgumentsGenerateSpecCache.set(cacheKey, state);
	// } else {
	// 	parseArgumentsCache.set(cacheKey, state);
	// }

	return state;
};

const firstTokenSpec: Internal.Subcommand = {
	name: ['firstTokenSpec'],
	subcommands: {},
	options: {},
	persistentOptions: {},
	loadSpec: undefined,
	args: [
		{
			name: 'command',
			generators: [
				{
					custom: async (_tokens, _exec, context) => {
						let result: Fig.Suggestion[] = [];
						if (context?.currentProcess.includes('fish')) {
							const commands = await executeLoginShell({
								command: 'complete -C ""',
								executable: context.currentProcess,
							});
							result = commands.split('\n').map((commandString) => {
								const splitIndex = commandString.indexOf('\t');
								const name = commandString.slice(0, splitIndex + 1);
								const description = commandString.slice(splitIndex + 1);
								return { name, description, type: 'subcommand' };
							});
						} else if (context?.currentProcess.includes('bash')) {
							const commands = await executeLoginShell({
								command: 'compgen -c',
								executable: context.currentProcess,
							});
							result = commands
								.split('\n')
								.map((name) => ({ name, type: 'subcommand' }));
						} else if (context?.currentProcess.includes('zsh')) {
							const commands = await executeLoginShell({
								command: `for key in \${(k)commands}; do echo $key; done && alias +r`,
								executable: context.currentProcess,
							});
							result = commands
								.split('\n')
								.map((name) => ({ name, type: 'subcommand' }));
						}

						const names = new Set();
						return result.filter((suggestion) => {
							if (names.has(suggestion.name)) {
								return false;
							}
							names.add(suggestion.name);
							return true;
						});
					},
					cache: {
						strategy: 'stale-while-revalidate',
						ttl: 10 * 1000, // 10s
					},
				},
			],
		},
	],
	parserDirectives: {},
};

const executeLoginShell = async ({
	command,
	executable,
}: {
	command: string;
	executable: string;
}): Promise<string> => {
	return new Promise((resolve, reject) => {
		exec(`${executable} -c "${command}"`, (error: ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				reject(stderr);
			} else {
				resolve(stdout);
			}
		});
	});
};

export const parseArguments = async (
	command: Command | null,
	context: Fig.ShellContext,
	spec: Fig.Spec,
	executeExternals: IFigExecuteExternals,
	// authClient: AuthClient,
	isParsingHistory = false,
	// localconsole: console.console = console,
): Promise<ArgumentParserResult> => {
	const tokens = command?.tokens ?? [];
	if (!command || tokens.length === 0) {
		throw new ParseArgumentsError('Invalid token array');
	}

	if (tokens.length === 1) {
		const showFirstCommandCompletion = true;
		const spec = showFirstCommandCompletion
			? firstTokenSpec
			: { ...firstTokenSpec, args: [] };
		let specPath = { name: 'firstTokenSpec', type: SpecLocationSource.GLOBAL };
		if (tokens[0].text.includes('/')) {
			// special-case: Symfony has "bin/console" which can be invoked directly
			// and should not require a user to create script completions for it
			if (tokens[0].text === 'bin/console') {
				specPath = { name: 'php/bin-console', type: SpecLocationSource.GLOBAL };
			} else {
				specPath = { name: 'dotslash', type: SpecLocationSource.GLOBAL };
			}
			// spec = await loadSubcommandCached(specPath, context);
		}
		return getResultFromState(getInitialState(spec, tokens[0].text, specPath));
	}

	let state = await parseArgumentsCached(
		command,
		context,
		// authClient,
		spec,
		executeExternals,
		isParsingHistory,
		0,
	);

	const finalToken = tokens[tokens.length - 1].text;
	try {
		state = updateState(state, finalToken, true);
	} catch (_err) {
		state = {
			...state,
			annotations: [
				...state.annotations,
				{ type: TokenType.None, text: finalToken },
			],
		};
	}
	return getResultFromState(state);
};
