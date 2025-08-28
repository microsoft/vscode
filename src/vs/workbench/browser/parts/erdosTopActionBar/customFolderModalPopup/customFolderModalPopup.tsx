/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './customFolderModalPopup.css';

import React from 'react';

import { CustomFolderMenuItems } from './customFolderMenuItems.js';
import { IRecentlyOpened } from '../../../../../platform/workspaces/common/workspaces.js';
import { ErdosModalReactRenderer } from '../../../../../base/browser/erdosModalReactRenderer.js';
import { ErdosModalPopup } from '../../../erdosComponents/erdosModalPopup/erdosModalPopup.js';

interface CustomFolderModalPopupProps {
	anchorElement: HTMLElement;
	recentlyOpened: IRecentlyOpened;
	renderer: ErdosModalReactRenderer;
}

export const CustomFolderModalPopup = (props: CustomFolderModalPopupProps) => {
	return (
		<ErdosModalPopup
			anchorElement={props.anchorElement}
			height={'auto'}
			keyboardNavigationStyle='menu'
			minWidth={275}
			popupAlignment='right'
			popupPosition='bottom'
			renderer={props.renderer}
			width={'auto'}
		>
			<CustomFolderMenuItems
				recentlyOpened={props.recentlyOpened}
				onMenuItemSelected={() => props.renderer.dispose()}
			/>
		</ErdosModalPopup>
	);
};
