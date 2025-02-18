/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Option, Subcommand } from './convert';

function makeSingleOrArray<T>(arr: T[]): Fig.SingleOrArray<T> {
	return arr.length === 1 ? (arr[0] as Fig.SingleOrArray<T>) : (arr as Fig.SingleOrArray<T>);
}

function revertOption<ArgT extends Fig.Arg, OptionT>(option: Option<ArgT, OptionT>): Fig.Option {
	const { name, args } = option;

	return {
		name: makeSingleOrArray(name),
		args,
	};
}

export function revertSubcommand<ArgT extends Fig.Arg, OptionT, SubcommandT>(
	subcommand: Subcommand<ArgT, OptionT, SubcommandT>,
	postProcessingFn: (
		oldSub: Subcommand<ArgT, OptionT, SubcommandT>,
		newSub: Fig.Subcommand
	) => Fig.Subcommand
): Fig.Subcommand {
	const { name, subcommands, options, persistentOptions, args } = subcommand;

	const newSubcommand: Fig.Subcommand = {
		name: makeSingleOrArray(name),
		subcommands:
			Object.values(subcommands).length !== 0
				? Object.values(subcommands).map((sub) => revertSubcommand(sub, postProcessingFn))
				: undefined,
		options:
			Object.values(options).length !== 0
				? [
					...Object.values(options).map((option) => revertOption(option)),
					...Object.values(persistentOptions).map((option) => revertOption(option)),
				]
				: undefined,
		args: Object.values(args).length !== 0 ? makeSingleOrArray(Object.values(args)) : undefined,
	};
	return postProcessingFn(subcommand, newSubcommand);
}
