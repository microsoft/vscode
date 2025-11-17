/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Subcommand, convertSubcommand, Initializer } from './convert';
import { makeArray, SpecLocationSource } from './utils';

type FigLoadSpecFn = Fig.LoadSpec extends infer U ? (U extends Function ? U : never) : never;
export type LoadSpec<ArgT = ArgMeta, OptionT = OptionMeta, SubcommandT = SubcommandMeta> =
	| Fig.SpecLocation[]
	| Subcommand<ArgT, OptionT, SubcommandT>
	| ((
		...args: Parameters<FigLoadSpecFn>
	) => Promise<Fig.SpecLocation[] | Subcommand<ArgT, OptionT, SubcommandT>>);

export type OptionMeta = Omit<Fig.Option, 'args' | 'name'>;
export type ArgMeta = Omit<Fig.Arg, 'template' | 'generators' | 'loadSpec'> & {
	generators: Fig.Generator[];
	loadSpec?: LoadSpec<ArgMeta, OptionMeta, SubcommandMeta>;
};

type SubcommandMetaExcludes =
	| 'subcommands'
	| 'options'
	| 'loadSpec'
	| 'persistentOptions'
	| 'args'
	| 'name';
export type SubcommandMeta = Omit<Fig.Subcommand, SubcommandMetaExcludes> & {
	loadSpec?: LoadSpec<ArgMeta, OptionMeta, SubcommandMeta>;
};

export function convertLoadSpec<ArgT, OptionT, SubcommandT>(
	loadSpec: Fig.LoadSpec,
	initialize: Initializer<ArgT, OptionT, SubcommandT>
): LoadSpec<ArgT, OptionT, SubcommandT> {
	if (typeof loadSpec === 'string') {
		return [{ name: loadSpec, type: SpecLocationSource.GLOBAL }];
	}

	if (typeof loadSpec === 'function') {
		return (...args) =>
			loadSpec(...args).then((result) => {
				if (Array.isArray(result)) {
					return result;
				}
				if ('type' in result) {
					return [result];
				}
				return convertSubcommand(result, initialize);
			});
	}

	return convertSubcommand(loadSpec, initialize);
}

function initializeOptionMeta(option: Fig.Option): OptionMeta {
	return option;
}

// Default initialization functions:
function initializeArgMeta(arg: Fig.Arg): ArgMeta {
	const { template, ...rest } = arg;
	const generators = template ? [{ template }] : makeArray(arg.generators ?? []);
	return {
		...rest,
		loadSpec: arg.loadSpec
			? convertLoadSpec(arg.loadSpec, {
				option: initializeOptionMeta,
				subcommand: initializeSubcommandMeta,
				arg: initializeArgMeta,
			})
			: undefined,
		generators: generators.map((generator) => {
			let { trigger, getQueryTerm } = generator;
			if (generator.template) {
				const templates = makeArray(generator.template);
				if (templates.includes('folders') || templates.includes('filepaths')) {
					trigger = trigger ?? '/';
					getQueryTerm = getQueryTerm ?? '/';
				}
			}
			return { ...generator, trigger, getQueryTerm };
		}),
	};
}

function initializeSubcommandMeta(subcommand: Fig.Subcommand): SubcommandMeta {
	return {
		...subcommand,
		loadSpec: subcommand.loadSpec
			? convertLoadSpec(subcommand.loadSpec, {
				subcommand: initializeSubcommandMeta,
				option: initializeOptionMeta,
				arg: initializeArgMeta,
			})
			: undefined,
	};
}

export const initializeDefault: Initializer<ArgMeta, OptionMeta, SubcommandMeta> = {
	subcommand: initializeSubcommandMeta,
	option: initializeOptionMeta,
	arg: initializeArgMeta,
};
