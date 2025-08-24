/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './customFolderMenuItem.css';

import React from 'react';

import { KeyboardModifiers, Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';

interface CustomFolderMenuItemProps {
	enabled: boolean;
	label: string;
	onSelected: (e: KeyboardModifiers) => void;
}

export const CustomFolderMenuItem = (props: CustomFolderMenuItemProps) => {
	return (
		<Button className='custom-folder-menu-item' onPressed={props.onSelected}>
			<div className='title'>
				{props.label}
			</div>
		</Button>
	);
};
