/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare namespace NodeJS {

	export interface Process {

		/**
		 * The lazy enviroment is a promise that resolves to `process.env`
		 * once the process is resolved. The use-case is VS Code running
		 * on Linux/macOS when being launched via a launcher. Then the env
		 * (as defined in .bashrc etc) isn't properly set and needs to be
		 * resolved lazy.
		 */
		lazyEnv: Thenable<typeof process.env> | undefined;
	}
}
