/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OPTIONS, type Option } from '../../platform/environment/node/argv.js';

export function hasAgentCommand(args: readonly string[]): boolean {
	let valueForOption = false;
	for (const arg of args) {
		if (valueForOption) {
			valueForOption = false;
			continue;
		}
		if (arg === '--') {
			return false;
		}
		if (arg === 'agent') {
			return true;
		}
		const option = getOption(arg);
		if (option?.type === 'string' || option?.type === 'string[]') {
			valueForOption = true;
		}
	}
	return false;
}

function getOption(arg: string): Option<'boolean'> | Option<'string'> | Option<'string[]'> | undefined {
	if (!arg.startsWith('-') || arg.includes('=')) {
		return undefined;
	}
	const id = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);
	for (const [optionId, option] of Object.entries(OPTIONS)) {
		if (option.type !== 'subcommand' && (id === option.alias || id === optionId)) {
			return option;
		}
	}
	for (const [optionId, option] of Object.entries(OPTIONS['agent'].options)) {
		if (id === option.alias || id === optionId) {
			return option;
		}
	}
	return undefined;
}
