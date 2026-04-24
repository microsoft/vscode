/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir, tmpdir } from 'os';
import { memoize } from '../../../base/common/decorators.js';
import { INodeProcess } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { NativeParsedArgs } from '../common/argv.js';
import { IDebugParams } from '../common/environment.js';
import { AbstractNativeEnvironmentService, parseDebugParams } from '../common/environmentService.js';
import { getUserDataPath } from './userDataPath.js';
import { IProductService } from '../../product/common/productService.js';

export class NativeEnvironmentService extends AbstractNativeEnvironmentService {

	constructor(args: NativeParsedArgs, productService: IProductService) {
		super(args, {
			homeDir: homedir(),
			tmpDir: tmpdir(),
			userDataDir: getUserDataPath(args, productService.nameShort)
		}, productService);
	}

	@memoize
	get hostUserRoamingDataHome(): URI | undefined {
		if (!(process as INodeProcess).isEmbeddedApp) {
			return undefined;
		}
		if (!this.isBuilt) {
			return undefined;
		}
		const quality = this.productService.quality;
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
		const hostUserDataPath = getUserDataPath(this.args, hostProductName);
		return joinPath(URI.file(hostUserDataPath), 'User').with({ scheme: Schemas.vscodeUserData });
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
