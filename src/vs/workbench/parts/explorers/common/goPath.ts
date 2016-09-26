/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import os = require('os');

let binPathCache: { [bin: string]: string; } = {};
let runtimePathCache: string = null;

export function getBinPath(binname: string) {
	binname = correctBinname(binname);
	if (binPathCache[binname]) return binPathCache[binname];

	// First search each GOPATH workspace's bin folder
	if (process.env['GOPATH']) {
		let workspaces = process.env['GOPATH'].split(path.delimiter);
		for (let i = 0; i < workspaces.length; i++) {
			let binpath = path.join(workspaces[i], 'bin', binname);
			if (fs.existsSync(binpath)) {
				binPathCache[binname] = binpath;
				return binpath;
			}
		}
	}

	// Then search PATH parts
	if (process.env['PATH']) {
		let pathparts = process.env['PATH'].split(path.delimiter);
		for (let i = 0; i < pathparts.length; i++) {
			let binpath = path.join(pathparts[i], binname);
			if (fs.existsSync(binpath)) {
				binPathCache[binname] = binpath;
				return binpath;
			}
		}
	}

	// Finally check GOROOT just in case
	if (process.env['GOROOT']) {
		let binpath = path.join(process.env['GOROOT'], 'bin', binname);
		if (fs.existsSync(binpath)) {
			binPathCache[binname] = binpath;
			return binpath;
		}
	}

	// Else return the binary name directly (this will likely always fail downstream)
	binPathCache[binname] = binname;
	return binname;
}

function correctBinname(binname: string) {
	if (process.platform === 'win32')
		return binname + '.exe';
	else
		return binname;
}

/**
 * Returns Go runtime binary path.
 *
 * @return the path to the Go binary.
 */
export function getGoRuntimePath(): string {
	if (runtimePathCache) return runtimePathCache;
	if (process.env['GOROOT']) {
		runtimePathCache = path.join(process.env['GOROOT'], 'bin', correctBinname('go'));
	} else if (process.env['PATH']) {
		let pathparts = (<string>process.env.PATH).split(path.delimiter);
		runtimePathCache = pathparts.map(dir => path.join(dir, correctBinname('go'))).filter(candidate => fs.existsSync(candidate))[0];
	}
	return runtimePathCache;
}