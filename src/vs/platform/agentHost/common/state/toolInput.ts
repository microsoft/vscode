/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ContentEncoding, type ResourceReadResult } from './protocol/commands.js';
import type { ToolInput } from './protocol/state.js';

/** Returns tool input only when it is stored inline. */
export function getInlineToolInput(toolInput: ToolInput | undefined): string | undefined {
	return typeof toolInput === 'string' ? toolInput : undefined;
}

/** Resolves referenced tool input at the point where its contents are needed. */
export async function resolveToolInput(toolInput: ToolInput | undefined, resourceRead: (resource: URI) => Promise<ResourceReadResult>): Promise<string | undefined> {
	if (typeof toolInput === 'string' || toolInput === undefined) {
		return toolInput;
	}

	const result = await resourceRead(URI.parse(toolInput.uri));
	return result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data).toString() : result.data;
}
