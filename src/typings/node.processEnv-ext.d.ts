/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare namespace NodeJS {

	export interface Process {

		/**
		 * VS Code specific extension of a delayed
		 * process enviroment.
		 */
		delayedEnv: Thenable<typeof process.env> | undefined;
	}
}
