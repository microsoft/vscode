/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'mocha-junit-reporter' {
	import type { Runner } from 'mocha';

	class MochaJUnitReporter {
		constructor(runner: Runner, options?: { reporterOptions?: { testsuitesTitle?: string; mochaFile?: string } });
	}
	export = MochaJUnitReporter;
}
