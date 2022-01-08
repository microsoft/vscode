/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URITransformer, IURITransformer, IRawURITransformer } from 'vs/base/common/uriIpc';
import { FileAccess } from 'vs/base/common/network';

export const uriTransformerPath = FileAccess.asFileUri('vs/server/uriTransformer.js', require).fsPath;

export function createRemoteURITransformer(remoteAuthority: string): IURITransformer {
	const rawURITransformerFactory = <any>require.__$__nodeRequire(uriTransformerPath);
	const rawURITransformer = <IRawURITransformer>rawURITransformerFactory(remoteAuthority);
	return new URITransformer(rawURITransformer);
}
