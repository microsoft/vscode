/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { startExtensionHostProcess } from 'vs/workbench/services/extensions/node/extensionHostProcessSetup';
import { createRemoteURITransformer } from 'vs/agent/remoteUriTransformer';
import { ISchemeTransformer } from 'vs/workbench/api/common/extHostLanguageFeatures';

class SchemeTransformer implements ISchemeTransformer {
	transformOutgoing(scheme: string): string {
		if (scheme === 'file') {
			return 'vscode-remote';
		} else if (scheme === 'vscode-local') {
			return 'file';
		}
		return scheme;
	}
}

startExtensionHostProcess(
	initData => initData.remoteAuthority ? createRemoteURITransformer(initData.remoteAuthority) : null,
	initData => initData.remoteAuthority ? new SchemeTransformer() : null,
	initData => initData.remoteAuthority ? nls.localize('remote extension host Log', "Remote Extension Host") : nls.localize('extension host Log', "Extension Host")
).catch((err) => console.log(err));
