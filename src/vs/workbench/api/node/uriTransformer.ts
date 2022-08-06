/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URITransformer, IURITransformer } from 'vs/base/common/uriIpc';
import { createRemoteRawURITransformer } from 'vs/workbench/api/common/uriTransformer';


export function createURITransformer(remoteAuthority: string): IURITransformer {
	return new URITransformer(createRemoteRawURITransformer(remoteAuthority));
}
