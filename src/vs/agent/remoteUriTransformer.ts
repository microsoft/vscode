/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URITransformer, IURITransformer, IRawURITransformer } from 'vs/base/common/uriIpc';
import { getPathFromAmdModule } from 'vs/base/common/amd';

export const uriTransformerPath = getPathFromAmdModule(require, 'vs/agent/uriTransformer.js');

export function createRemoteURITransformer(remoteAuthority: string): IURITransformer {
	const rawURITransformerFactory = <any>require.__$__nodeRequire(uriTransformerPath);
	const rawURITransformer = <IRawURITransformer>rawURITransformerFactory(remoteAuthority);
	return new URITransformer(rawURITransformer);
}
