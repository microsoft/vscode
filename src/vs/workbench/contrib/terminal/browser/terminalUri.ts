/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ITerminalInstance, TerminalDataTransfers } from './terminal.js';

export interface ITerminalUriMetadata {
	title?: string;
	commandId?: string;
	commandLine?: string;
}

export function parseTerminalUri(resource: URI): ITerminalIdentifier {
	const [, workspaceId, instanceId] = resource.path.split('/');
	if (!workspaceId || !Number.parseInt(instanceId)) {
		throw new Error(`Could not parse terminal uri for resource ${resource}`);
	}
	return { workspaceId, instanceId: Number.parseInt(instanceId) };
}

export function getTerminalUri(workspaceId: string, instanceId: number, title?: string, commandId?: string): URI;
export function getTerminalUri(workspaceId: string, instanceId: number, metadata?: ITerminalUriMetadata): URI;
export function getTerminalUri(workspaceId: string, instanceId: number, arg?: string | ITerminalUriMetadata, commandIdLegacy?: string): URI {
	let metadata: ITerminalUriMetadata | undefined;
	if (typeof arg === 'string') {
		metadata = { title: arg, commandId: commandIdLegacy };
	} else {
		metadata = arg;
		if (commandIdLegacy) {
			metadata = {
				...metadata,
				commandId: metadata?.commandId ?? commandIdLegacy
			};
		}
	}

	const title = metadata?.title;
	const params = new URLSearchParams();
	if (metadata?.commandId) {
		params.set('command', metadata.commandId);
	}
	if (metadata?.commandLine) {
		params.set('commandLine', metadata.commandLine);
	}
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${workspaceId}/${instanceId}`,
		fragment: title || undefined,
		query: params.toString() || undefined
	});
}

export interface ITerminalIdentifier {
	workspaceId: string;
	instanceId: number | undefined;
}

export interface IPartialDragEvent {
	dataTransfer: Pick<DataTransfer, 'getData'> | null;
}

export function getTerminalResourcesFromDragEvent(event: IPartialDragEvent): URI[] | undefined {
	const resources = event.dataTransfer?.getData(TerminalDataTransfers.Terminals);
	if (resources) {
		const json = JSON.parse(resources);
		const result = [];
		for (const entry of json) {
			result.push(URI.parse(entry));
		}
		return result.length === 0 ? undefined : result;
	}
	return undefined;
}

export function getInstanceFromResource<T extends Pick<ITerminalInstance, 'resource'>>(instances: T[], resource: URI | undefined): T | undefined {
	if (resource) {
		for (const instance of instances) {
			// Note that the URI's workspace and instance id might not originally be from this window
			// Don't bother checking the scheme and assume instances only contains terminals
			if (instance.resource.path === resource.path) {
				return instance;
			}
		}
	}
	return undefined;
}
