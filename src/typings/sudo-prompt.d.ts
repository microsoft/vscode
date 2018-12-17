/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'sudo-prompt' {

	export function exec(cmd: string, options: { name?: string, icns?: string }, callback: (error: string, stdout: string, stderr: string) => void);
}