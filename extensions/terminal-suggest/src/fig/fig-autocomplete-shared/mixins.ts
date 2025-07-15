/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeArray } from './utils';

export type SpecMixin =
	| Fig.Subcommand
	| ((currentSpec: Fig.Subcommand, context: Fig.ShellContext) => Fig.Subcommand);

type NamedObject = { name: Fig.SingleOrArray<string> };

const concatArrays = <T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined =>
	a && b ? [...a, ...b] : a || b;

const mergeNames = <T = string>(a: T | T[], b: T | T[]): T | T[] => [
	...new Set(concatArrays(makeArray(a), makeArray(b))),
];

const mergeArrays = <T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined =>
	a && b ? [...new Set(concatArrays(makeArray(a), makeArray(b)))] : a || b;

const mergeArgs = (arg: Fig.Arg, partial: Fig.Arg): Fig.Arg => ({
	...arg,
	...partial,
	suggestions: concatArrays<Fig.Suggestion | string>(arg.suggestions, partial.suggestions),
	generators:
		arg.generators && partial.generators
			? concatArrays(makeArray(arg.generators), makeArray(partial.generators))
			: arg.generators || partial.generators,
	template:
		arg.template && partial.template
			? mergeNames<Fig.TemplateStrings>(arg.template, partial.template)
			: arg.template || partial.template,
});

const mergeArgArrays = (
	args: Fig.SingleOrArray<Fig.Arg> | undefined,
	partials: Fig.SingleOrArray<Fig.Arg> | undefined
): Fig.SingleOrArray<Fig.Arg> | undefined => {
	if (!args || !partials) {
		return args || partials;
	}
	const argArray = makeArray(args);
	const partialArray = makeArray(partials);
	const result = [];
	for (let i = 0; i < Math.max(argArray.length, partialArray.length); i += 1) {
		const arg = argArray[i];
		const partial = partialArray[i];
		if (arg !== undefined && partial !== undefined) {
			result.push(mergeArgs(arg, partial));
		} else if (partial !== undefined || arg !== undefined) {
			result.push(arg || partial);
		}
	}
	return result.length === 1 ? result[0] : result;
};

const mergeOptions = (option: Fig.Option, partial: Fig.Option): Fig.Option => ({
	...option,
	...partial,
	name: mergeNames(option.name, partial.name),
	args: mergeArgArrays(option.args, partial.args),
	exclusiveOn: mergeArrays(option.exclusiveOn, partial.exclusiveOn),
	dependsOn: mergeArrays(option.dependsOn, partial.dependsOn),
});

const mergeNamedObjectArrays = <T extends NamedObject>(
	objects: T[] | undefined,
	partials: T[] | undefined,
	mergeItems: (a: T, b: T) => T
): T[] | undefined => {
	if (!objects || !partials) {
		return objects || partials;
	}
	const mergedObjects = objects ? [...objects] : [];

	const existingNameIndexMap: Record<string, number> = {};
	for (let i = 0; i < objects.length; i += 1) {
		makeArray(objects[i].name).forEach((name) => {
			existingNameIndexMap[name] = i;
		});
	}

	for (let i = 0; i < partials.length; i += 1) {
		const partial = partials[i];
		if (!partial) {
			throw new Error('Invalid object passed to merge');
		}
		const existingNames = makeArray(partial.name).filter((name) => name in existingNameIndexMap);
		if (existingNames.length === 0) {
			mergedObjects.push(partial);
		} else {
			const index = existingNameIndexMap[existingNames[0]];
			if (existingNames.some((name) => existingNameIndexMap[name] !== index)) {
				throw new Error('Names provided for option matched multiple existing options');
			}
			mergedObjects[index] = mergeItems(mergedObjects[index], partial);
		}
	}
	return mergedObjects;
};

function mergeOptionArrays(
	options: Fig.Option[] | undefined,
	partials: Fig.Option[] | undefined
): Fig.Option[] | undefined {
	return mergeNamedObjectArrays(options, partials, mergeOptions);
}

function mergeSubcommandArrays(
	subcommands: Fig.Subcommand[] | undefined,
	partials: Fig.Subcommand[] | undefined
): Fig.Subcommand[] | undefined {
	return mergeNamedObjectArrays(subcommands, partials, mergeSubcommands);
}

export function mergeSubcommands(
	subcommand: Fig.Subcommand,
	partial: Fig.Subcommand
): Fig.Subcommand {
	return {
		...subcommand,
		...partial,
		name: mergeNames(subcommand.name, partial.name),
		args: mergeArgArrays(subcommand.args, partial.args),
		additionalSuggestions: concatArrays<Fig.Suggestion | string>(
			subcommand.additionalSuggestions,
			partial.additionalSuggestions
		),
		subcommands: mergeSubcommandArrays(subcommand.subcommands, partial.subcommands),
		options: mergeOptionArrays(subcommand.options, partial.options),
		parserDirectives:
			subcommand.parserDirectives && partial.parserDirectives
				? { ...subcommand.parserDirectives, ...partial.parserDirectives }
				: subcommand.parserDirectives || partial.parserDirectives,
	};
}

export const applyMixin = (
	spec: Fig.Subcommand,
	context: Fig.ShellContext,
	mixin: SpecMixin
): Fig.Subcommand => {
	if (typeof mixin === 'function') {
		return mixin(spec, context);
	}
	const partial = mixin;
	return mergeSubcommands(spec, partial);
};
