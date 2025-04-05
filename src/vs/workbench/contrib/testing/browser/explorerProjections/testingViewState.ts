/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestId } from '../../common/testId.js';

export interface ISerializedTestTreeCollapseState {
	collapsed?: boolean;
	children?: { [localId: string]: ISerializedTestTreeCollapseState };
}

/**
 * Gets whether the given test ID is collapsed.
 */
export function isCollapsedInSerializedTestTree(serialized: ISerializedTestTreeCollapseState, id: TestId | string): boolean | undefined {
	if (!(id instanceof TestId)) {
		id = TestId.fromString(id);
	}

	let node = serialized;
	for (const part of id.path) {
		if (!node.children?.hasOwnProperty(part)) {
			return undefined;
		}

		node = node.children[part];
	}

	return node.collapsed;
}
