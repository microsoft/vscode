/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../util/vs/base/common/uri';

export namespace ClaudeSessionUri {
	export const scheme = 'claude-code';

	export function forSessionId(sessionId: string): URI {
		return URI.from({ scheme: ClaudeSessionUri.scheme, path: '/' + sessionId });
	}

	export function getSessionId(resource: URI): string {
		if (resource.scheme !== ClaudeSessionUri.scheme) {
			throw new Error('Invalid resource scheme for Claude Code session');
		}

		return resource.path.slice(1);
	}
}
