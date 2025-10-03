/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, Connection, Disposable } from 'vscode-languageserver/node';
import { formatError } from '../utils/runner';
import { RequestService, RuntimeEnvironment, startServer } from '../jsonServer';

import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import { URI as Uri } from 'vscode-uri';
import { promises as fs } from 'fs';
import * as l10n from '@vscode/l10n';

// Create a connection for the server.
const connection: Connection = createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

process.on('unhandledRejection', (e: any) => {
	connection.console.error(formatError(`Unhandled exception`, e));
});

function getHTTPRequestService(): RequestService {
	return {
		getContent(uri: string, _encoding?: string) {
			const headers = { 'Accept-Encoding': 'gzip, deflate' };
			return xhr({ url: uri, followRedirects: 5, headers }).then(response => {
				return response.responseText;
			}, (error: XHRResponse) => {
				return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
			});
		}
	};
}

function getFileRequestService(): RequestService {
	return {
		async getContent(location: string, encoding?: BufferEncoding) {
			try {
				const uri = Uri.parse(location);
				return (await fs.readFile(uri.fsPath, encoding)).toString();
			} catch (e) {
				if (e.code === 'ENOENT') {
					throw new Error(l10n.t('Schema not found: {0}', location));
				} else if (e.code === 'EISDIR') {
					throw new Error(l10n.t('{0} is a directory, not a file', location));
				}
				throw e;
			}
		}
	};
}

const runtime: RuntimeEnvironment = {
	timer: {
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): Disposable {
			const handle = setImmediate(callback, ...args);
			return { dispose: () => clearImmediate(handle) };
		},
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): Disposable {
			const handle = setTimeout(callback, ms, ...args);
			return { dispose: () => clearTimeout(handle) };
		}
	},
	file: getFileRequestService(),
	http: getHTTPRequestService(),
	configureHttpRequests
};



startServer(connection, runtime);
