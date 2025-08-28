/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

type Value = string | number | undefined;
type Mapping = Record<string, unknown>;
type Argument = Value | Mapping;

export const pinToRange = (value: number, minimumValue: number, maximumValue: number) =>
	Math.min(Math.max(value, minimumValue), maximumValue);

export const optionalValue = (value: number | string | undefined, defaultValue: number | string) => {
	return value !== undefined ? value : defaultValue;
};

export const optionalBoolean = (value: boolean | undefined) => {
	return value !== undefined && value;
};

export const erdosClassNames = (...args: Argument[]) => {
	const classes: string[] = [];

	args.forEach(arg => {
		if (arg !== undefined) {
			if (typeof arg === 'string') {
				classes.push(arg);
			} else if (typeof arg === 'number') {
				classes.push(arg.toString());
			} else {
				for (const key in arg) {
					if (arg.hasOwnProperty(key) && arg[key]) {
						classes.push(key);
					}
				}
			}
		}
	});

	return classes.join(' ');
};
