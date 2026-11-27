/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NativeParsedArgs } from '../../../../environment/common/argv.js';
import { RemoteConnectionTokenFile, WindowRemoteConnectionTokens } from '../../../node/remoteConnectionToken.js';

const tokens = new WindowRemoteConnectionTokens<object>();
const window = {};

process.on('message', async (args: NativeParsedArgs) => {
	try {
		const token = await RemoteConnectionTokenFile.read(args);
		tokens.bind(window, args.remote, token);
		process.send?.({ authenticated: (await tokens.get(window, args.remote!)) !== undefined, isolated: (await tokens.get({}, args.remote!)) === undefined });
	} catch {
		process.send?.({ rejected: true });
	}
});
