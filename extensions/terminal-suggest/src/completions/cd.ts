/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
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
			{
				name: '~',
				description: 'Switch to the home directory',
				hidden: true,
			},
		],
	}
};

export default cdSpec;
