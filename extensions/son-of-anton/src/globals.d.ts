/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ambient declarations for Node.js globals available in the extension host
declare var process: {
	env: Record<string, string | undefined>;
	platform: string;
};
