/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentMetadataSource } from '../metadata.js';

const sessionContextMetadataKey = 'vscode.agentHost.sessionContext';

export function hasSessionContextAttachmentMeta(source: IAgentMetadataSource): boolean {
	return source._meta?.[sessionContextMetadataKey] === true;
}

export function withSessionContextAttachmentMeta<T extends IAgentMetadataSource>(source: T): T {
	return { ...source, _meta: { ...source._meta, [sessionContextMetadataKey]: true } };
}
