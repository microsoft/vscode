/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './customFolderRecentlyUsedMenuItem.css';

import React from 'react';

import { KeyboardModifiers, Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';

interface CustomFolderRecentlyUsedMenuItemProps {
	enabled: boolean;
	label: string;
	onOpen: (e: KeyboardModifiers) => void;
	onOpenInNewWindow: (e: KeyboardModifiers) => void;
}

export const CustomFolderRecentlyUsedMenuItem = (props: CustomFolderRecentlyUsedMenuItemProps) => {
	return (
		<Button className='custom-folder-recently-used-menu-item' onPressed={props.onOpen}>
			<div className='title' title={props.label}>
				{props.label}
			</div>
			<Button className='open-in-new-window' onPressed={props.onOpenInNewWindow}>
				<div className='codicon codicon-erdos-open-in-new-window' title={props.label} />
			</Button>
		</Button>
	);
};
