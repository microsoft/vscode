/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cdSpec: Fig.Spec = {
	name: 'Set-Location',
	description: 'Change the shell working directory',
	args: {
		name: 'folder',
		template: 'folders',
		suggestions: [
			{
				name: '-',
				description: 'Go to previous directory',
				hidden: true,
			},
			{
				name: '+',
				description: 'Go to next directory',
				hidden: true,
			},
		],
	}
};

export default cdSpec;
