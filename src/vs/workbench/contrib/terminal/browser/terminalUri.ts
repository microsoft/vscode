/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

export function parseTerminalUri(resource: URI): ITerminalIdentifier {
	const [, workspaceId, instanceId] = resource.path.split('/');
	if (!workspaceId || !Number.parseInt(instanceId)) {
		throw new Error(`Could not parse terminal uri for resource ${resource}`);
	}
	return { workspaceId, instanceId: Number.parseInt(instanceId) };
}

export function getTerminalUri(workspaceId: string, instanceId: number, title?: string): URI {
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${workspaceId}/${instanceId}`,
		fragment: title || undefined,
	});
}

export interface ITerminalIdentifier {
	workspaceId: string;
	instanceId: number | undefined;
}
