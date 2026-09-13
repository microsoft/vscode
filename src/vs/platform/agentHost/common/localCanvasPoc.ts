/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';

export function localCanvasPocWorkspaceMessage(expected: URI, actual: readonly URI[] | undefined): string {
	return localize('localCanvasPoc.workspaceMismatch',
		"The local canvas demo can only materialize or execute sessions in its dedicated workspace.\nExpected workspace: {0}\nCurrent workspace: {1}\nOpen a new session in the demo workspace to continue.",
		expected.fsPath,
		actual?.length ? actual.map(uri => uri.scheme === Schemas.file ? uri.fsPath : uri.toString()).join(', ') : localize('localCanvasPoc.noWorkspace', "No folder selected"),
	);
}
