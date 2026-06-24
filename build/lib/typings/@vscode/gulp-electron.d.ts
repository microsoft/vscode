/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module '@vscode/gulp-electron' {

	interface MainFunction {
		(options: any): NodeJS.ReadWriteStream;
		dest(destination: string, options: any): NodeJS.ReadWriteStream;
	}

	const main: MainFunction;
	export default main;
}
