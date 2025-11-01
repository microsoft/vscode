/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as minimist from 'minimist';

const [, , ...args] = process.argv;
export const opts = minimist(args, {
	string: [
		'browser',
		'build',
		'stable-build',
		'wait-time',
		'test-repo',
		'electronArgs'
	],
	boolean: [
		'verbose',
		'remote',
		'web',
		'headless',
		'video',
		'autostart'
	],
	default: {
		verbose: false
	}
}) as {
	verbose?: boolean;
	remote?: boolean;
	headless?: boolean;
	web?: boolean;
	build?: string;
	'stable-build'?: string;
	browser?: 'chromium' | 'webkit' | 'firefox' | 'chromium-msedge' | 'chromium-chrome' | undefined;
	electronArgs?: string;
	video?: boolean;
	autostart?: boolean;
};
