/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import os = require('os');
import { IProductConfiguration } from 'vs/platform/product';

export function generateNewIssueUrl(version: string, product: IProductConfiguration): string {
	let quality = process.env['VSCODE_DEV'] ? 'dev' : product.quality;
	let vscodeVersion = `${version}-${quality}`;
	if (product.commit || product.date) {
		vscodeVersion += ` (${product.commit || 'Unknown'}, ${product.date || 'Unknown'})`;
	}
	let osVersion = `${os.type()} ${os.arch()}`;
	let queryStringPrefix = product.reportIssueUrl.indexOf('?') === -1 ? '?' : '&';
	return `${product.reportIssueUrl}${queryStringPrefix}body=` +
		`- VSCode Version: ${vscodeVersion}%0A` +
		`- OS Version: ${osVersion}%0A%0A` +
		'Steps to Reproduce:%0A%0A1.%0A2.';
}