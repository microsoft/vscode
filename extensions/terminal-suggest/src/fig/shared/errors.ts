/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const createErrorInstance = (name: string) =>
	class extends Error {
		constructor(message?: string) {
			super(message);
			this.name = `Fig.${name}`;
		}
	};
