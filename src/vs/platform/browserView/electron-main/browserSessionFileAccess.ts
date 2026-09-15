/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import type { IBrowserViewLoadError } from '../common/browserView.js';

/** The process-wide file allowlist supplied by Workspace Trust. */
export class BrowserSessionFileAccess {
	private readonly roots = TernarySearchTree.forPaths<true>(!isLinux);
	private trustAllFiles = false;

	setTrustedFileRoots(roots: readonly string[], trustAllFiles: boolean): void {
		this.trustAllFiles = trustAllFiles;
		this.roots.clear();
		for (const root of roots) {
			if (root) {
				this.roots.set(normalize(root), true);
			}
		}
	}

	isAllowed(url: string): boolean {
		if (!url) {
			return true;
		}
		const resource = URI.parse(url);
		return resource.scheme !== Schemas.file || this.trustAllFiles || !!this.roots.findSubstr(normalize(resource.fsPath));
	}

	getError(url: string, errorCode = -10, errorDescription = 'ERR_ACCESS_DENIED'): IBrowserViewLoadError | undefined {
		return this.isAllowed(url) ? undefined : { url, errorCode, errorDescription, fileAccessDenied: true };
	}

	async handleRequest(request: Request, fetch: (request: Request) => Promise<Response>): Promise<Response> {
		if (!this.isAllowed(request.url)) {
			return Response.error();
		}
		const response = await fetch(request);
		if (!this.isAllowed(request.url)) {
			await response.body?.cancel();
			return Response.error();
		}
		return response;
	}
}
