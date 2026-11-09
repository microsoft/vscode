/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { FileAccess } from '../../../../base/common/network.js';
import { isNative } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';

export function fixtureResourceUri(path: string): URI {
	return isNative
		? URI.joinPath(FileAccess.asFileUri(''), '..', path)
		: URI.parse(new URL(`/${path}`, mainWindow.document.baseURI).href);
}

export function readFixtureTextResource(resource: URI): Promise<string> {
	return requestFixtureResource(resource, 'text').then(request => request.responseText);
}

export function readFixtureBinaryResource(resource: URI): Promise<ArrayBuffer> {
	return requestFixtureResource(resource, 'arraybuffer').then(request => request.response);
}

function requestFixtureResource(resource: URI, responseType: XMLHttpRequestResponseType): Promise<XMLHttpRequest> {
	return new Promise((resolve, reject) => {
		const request = new mainWindow.XMLHttpRequest();
		request.open('GET', resource.toString(true), true);
		request.responseType = responseType;
		request.onload = () => {
			if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
				resolve(request);
			} else {
				reject(new Error(`Failed to load fixture resource ${resource.toString()}: ${request.status} ${request.statusText}`));
			}
		};
		request.onerror = () => reject(new Error(`Failed to load fixture resource ${resource.toString()}: ${request.statusText}`));
		request.send();
	});
}
