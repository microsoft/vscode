/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../base/common/json.js';

export interface IPartialToolInput {
	readonly raw: string;
	readonly value: Record<string, unknown> | undefined;
}

export function parsePartialToolInput(raw: string): IPartialToolInput {
	const parsed: unknown = parse(raw);
	return {
		raw,
		value: parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: undefined,
	};
}
