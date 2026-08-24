/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cdSpec: Fig.Spec = {
	name: 'cd',
	description: 'Change the shell working directory',
	args: {
		name: 'folder',
		template: 'folders',

		suggestions: [
			{
				name: '-',
				description: 'Switch to the last used folder',
				hidden: true,
			},
		],
	}
};

export default cdSpec;
