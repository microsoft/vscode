/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';

export namespace SessionIdForCLI {
	export function getResource(sessionId: string): Uri {
		return URI.from({ scheme: 'copilotcli', path: `/${sessionId}` }) as unknown as Uri;
	}

	export function parse(resource: Uri): string {
		return resource.path.slice(1);
	}

	export function isCLIResource(resource: Uri): boolean {
		return resource.scheme === 'copilotcli';
	}
}
