/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';


export function asWebviewUri(
	environmentService: IWorkbenchEnvironmentService,
	uuid: string,
	resource: URI,
): URI {
	const uri = environmentService.webviewResourceRoot
		// Make sure we preserve the scheme of the resource but convert it into a normal path segment
		// The scheme is important as we need to know if we are requesting a local or a remote resource.
		.replace('{{uuid}}', uuid);

	const uri2 = URI.parse(uri);
	return uri2.with({
		path: uri2.path.replace('{{resource}}', resource.scheme + withoutScheme(resource))
	});
}

function withoutScheme(resource: URI): string {
	return resource.toString().replace(/^\S+?:/, '');
}
