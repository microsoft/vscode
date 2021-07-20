/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ITerminalIdentifier } from 'vs/workbench/contrib/terminal/browser/terminal';

export function parseTerminalUri(resource: URI): ITerminalIdentifier {
	const [, workspaceId, instanceId] = resource.path.split('/');
	return { workspaceId, instanceId: Number.parseInt(instanceId) };
}

export function getTerminalUri(workspaceId: string, instanceId: number, title?: string): URI {
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${workspaceId}/${instanceId}`,
		fragment: title || undefined,
	});
}
