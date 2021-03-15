/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir, tmpdir } from 'os';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { getUserDataPath } from 'vs/platform/environment/node/userDataPath';
import { AbstractNativeEnvironmentService } from 'vs/platform/environment/common/environmentService';

export class NativeEnvironmentService extends AbstractNativeEnvironmentService {

	constructor(args: NativeParsedArgs) {
		super(args, {
			homeDir: homedir(),
			tmpDir: tmpdir(),
			userDataDir: getUserDataPath(args)
		});
	}
}
