/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITerminalIdentifier } from 'vs/workbench/contrib/terminal/browser/terminal';

export function parseTerminalUri(resource: URI): ITerminalIdentifier {
	const [, workspaceId, instanceId] = resource.path.split('/');
	return { workspaceId, instanceId: Number.parseInt(instanceId) };
}
