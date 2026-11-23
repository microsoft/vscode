/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'yaserver' {
	import type { IncomingMessage, ServerResponse } from 'http';

	export function createServer(options: { rootDir: string }): Promise<{ handle(request: IncomingMessage, response: ServerResponse): void }>;
}
