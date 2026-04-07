/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export function rewriteObject(value: any, transform: (obj: object) => object | undefined): any {
	if (!value) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(x => rewriteObject(x, transform));
	}

	if (typeof value === 'object') {
		const t = transform(value);
		if (t) {
			return t;
		}

		const newValue: { [key: string]: any } = {};
		for (const key in value) {
			newValue[key] = rewriteObject(value[key], transform);
		}
		return newValue;
	}

	return value;
}
