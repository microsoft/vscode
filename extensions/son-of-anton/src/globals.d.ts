/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ambient declarations for Node.js globals available in the extension host
declare var process: {
	env: Record<string, string | undefined>;
	platform: string;
	memoryUsage(): {
		rss: number;
		heapTotal: number;
		heapUsed: number;
		external: number;
		arrayBuffers: number;
	};
	cpuUsage(previousValue?: { user: number; system: number }): {
		user: number;
		system: number;
	};
};
