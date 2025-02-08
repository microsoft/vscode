/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';

export const joinLines = (...args: string[]) =>
	args.join(os.platform() === 'win32' ? '\r\n' : '\n');
