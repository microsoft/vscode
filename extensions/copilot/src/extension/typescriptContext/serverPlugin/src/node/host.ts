/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';

import { Hash, Host } from '../common/host';
import path from 'node:path';

export class NodeHost implements Host {

	public readonly path: Host['path'];

	public constructor() {
		this.path = Object.freeze({
			basename: (pathStr: string, ext?: string): string => {
				return path.basename(pathStr, ext);
			}
		});
	}

	public createHash(algorithm: string): Hash {
		return crypto.createHash(algorithm);
	}

	public isDebugging(): boolean {
		return process.execArgv.some((arg) => /^--(?:inspect|debug)(?:-brk)?(?:=\d+)?$/i.test(arg));
	}
}
