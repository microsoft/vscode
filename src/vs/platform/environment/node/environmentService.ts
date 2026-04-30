/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir, tmpdir } from 'os';
import { NativeParsedArgs } from '../common/argv.js';
import { IDebugParams } from '../common/environment.js';
import { AbstractNativeEnvironmentService, parseDebugParams } from '../common/environmentService.js';
import { getUserDataPath } from './userDataPath.js';
import { IProductService } from '../../product/common/productService.js';
import { INodeProcess } from '../../../base/common/platform.js';
import { join } from '../../../base/common/path.js';
import { env } from '../../../base/common/process.js';

export class NativeEnvironmentService extends AbstractNativeEnvironmentService {

	constructor(args: NativeParsedArgs, productService: IProductService) {
		const homeDir = homedir();
		super(args, {
			homeDir,
			tmpDir: tmpdir(),
			userDataDir: getUserDataPath(args, productService.nameShort),
			parentAppUserDataDir: getParentAppUserDataDir(args, productService),
			parentAppUserHomeDir: getParentAppUserHomeDir(homeDir, productService)
		}, productService);
	}
}

export function parsePtyHostDebugPort(args: NativeParsedArgs, isBuilt: boolean): IDebugParams {
	return parseDebugParams(args['inspect-ptyhost'], args['inspect-brk-ptyhost'], 5877, isBuilt, args.extensionEnvironment);
}

export function parseAgentHostDebugPort(args: NativeParsedArgs, isBuilt: boolean): IDebugParams {
	return parseDebugParams(args['inspect-agenthost'], args['inspect-brk-agenthost'], 5878, isBuilt, args.extensionEnvironment);
}

export function parseSharedProcessDebugPort(args: NativeParsedArgs, isBuilt: boolean): IDebugParams {
	return parseDebugParams(args['inspect-sharedprocess'], args['inspect-brk-sharedprocess'], 5879, isBuilt, args.extensionEnvironment);
}


function getParentAppUserDataDir(args: NativeParsedArgs, productService: IProductService): string | undefined {
	if (!(process as INodeProcess).isEmbeddedApp) {
		return undefined;
	}
	if (env['VSCODE_DEV']) {
		return undefined;
	}
	const quality = productService.quality;
	let hostProductName: string;
	if (quality === 'stable') {
		hostProductName = 'Code';
	} else if (quality === 'insider') {
		hostProductName = 'Code - Insiders';
	} else if (quality === 'exploration') {
		hostProductName = 'Code - Exploration';
	} else {
		return undefined;
	}

	// Honor the same env-var overrides that the host VS Code itself uses
	// (portable mode and VSCODE_APPDATA), but intentionally skip --user-data-dir
	// because that CLI arg belongs to the Agents app, not the host.
	const hostUserDataPath = getUserDataPath(args, hostProductName);
	return join(hostUserDataPath, 'User');
}

function getParentAppUserHomeDir(homeDir: string, productService: IProductService): string | undefined {
	if (!(process as INodeProcess).isEmbeddedApp) {
		return undefined;
	}
	if (env['VSCODE_DEV']) {
		return undefined;
	}
	const quality = productService.quality;
	let hostDataFolderName: string;
	if (quality === 'stable') {
		hostDataFolderName = '.vscode';
	} else if (quality === 'insider') {
		hostDataFolderName = '.vscode-insiders';
	} else if (quality === 'exploration') {
		hostDataFolderName = '.vscode-exploration';
	} else {
		return undefined;
	}
	return join(homeDir, hostDataFolderName);
}
