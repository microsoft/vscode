/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export interface IStatusBarEntryLocation {

	/**
	 * The identifier and priority of another status bar
	 * entry to position relative to. If the referenced
	 * entry does not exist, the priority will be used.
	 */
	location: {
		id: string;
		priority: number;
	};

	/**
	 * The alignment of the status bar entry relative
	 * to the referenced entry.
	 */
	alignment: StatusBarAlignment;

	/**
	 * Whether to move the entry close to the location
	 * so that it appears as if both this entry and
	 * the location belong to each other.
	 */
	compact?: boolean;
}

export function isStatusBarEntryLocation(thing: unknown): thing is IStatusBarEntryLocation {
	const candidate = thing as IStatusBarEntryLocation | undefined;

	return typeof candidate?.location?.id === 'string' && typeof candidate.alignment === 'number';
}

export function asStatusBarItemIdentifier(extension: ExtensionIdentifier, id: string): string {
	return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
