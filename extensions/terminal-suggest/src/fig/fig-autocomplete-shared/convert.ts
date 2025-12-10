/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeArray } from './utils';

export type SuggestionType = Fig.SuggestionType | 'history' | 'auto-execute';

type Override<T, S> = Omit<T, keyof S> & S;
export type Suggestion = Override<Fig.Suggestion, { type?: SuggestionType }>;

export type Option<ArgT, OptionT> = OptionT & {
	name: string[];
	args: ArgT[];
};

export type Subcommand<ArgT, OptionT, SubcommandT> = SubcommandT & {
	name: string[];
	subcommands: Record<string, Subcommand<ArgT, OptionT, SubcommandT>>;
	options: Record<string, Option<ArgT, OptionT>>;
	persistentOptions: Record<string, Option<ArgT, OptionT>>;
	args: ArgT[];
};

const makeNamedMap = <T extends { name: string[] }>(items: T[] | undefined): Record<string, T> => {
	const nameMapping: Record<string, T> = {};
	if (!items) {
		return nameMapping;
	}

	for (let i = 0; i < items.length; i += 1) {
		items[i].name.forEach((name) => {
			nameMapping[name] = items[i];
		});
	}
	return nameMapping;
};

export type Initializer<ArgT, OptionT, SubcommandT> = {
	subcommand: (subcommand: Fig.Subcommand) => SubcommandT;
	option: (option: Fig.Option) => OptionT;
	arg: (arg: Fig.Arg) => ArgT;
};

function convertOption<ArgT, OptionT>(
	option: Fig.Option,
	initialize: Omit<Initializer<ArgT, OptionT, never>, 'subcommand'>
): Option<ArgT, OptionT> {
	return {
		...initialize.option(option),
		name: makeArray(option.name),
		args: option.args ? makeArray(option.args).map(initialize.arg) : [],
	};
}

export function convertSubcommand<ArgT, OptionT, SubcommandT>(
	subcommand: Fig.Subcommand,
	initialize: Initializer<ArgT, OptionT, SubcommandT>
): Subcommand<ArgT, OptionT, SubcommandT> {
	const { subcommands, options, args } = subcommand;
	return {
		...initialize.subcommand(subcommand),
		name: makeArray(subcommand.name),
		subcommands: makeNamedMap(subcommands?.map((s) => convertSubcommand(s, initialize))),
		options: makeNamedMap(
			options
				?.filter((option) => !option.isPersistent)
				?.map((option) => convertOption(option, initialize))
		),
		persistentOptions: makeNamedMap(
			options
				?.filter((option) => option.isPersistent)
				?.map((option) => convertOption(option, initialize))
		),
		args: args ? makeArray(args).map(initialize.arg) : [],
	};
}
