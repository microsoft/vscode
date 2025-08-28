/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './topActionBarCustomFolderMenu.css';

import React, { useRef } from 'react';

import { localize } from '../../../../../nls.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { useErdosTopActionBarContext } from '../erdosTopActionBarContext.js';
import { CustomFolderModalPopup } from '../customFolderModalPopup/customFolderModalPopup.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { useRegisterWithActionBar } from '../../../../../platform/erdosActionBar/browser/useRegisterWithActionBar.js';
import { ErdosModalReactRenderer } from '../../../../../base/browser/erdosModalReactRenderer.js';

const erdosFolderSelector = localize('erdos.folderSelector', "Folder Selector");

export const TopActionBarCustomFolderMenu = () => {
	const services = useErdosReactServicesContext();
	const context = useErdosTopActionBarContext();

	const ref = useRef<HTMLButtonElement>(undefined!);

	useRegisterWithActionBar([ref]);

	const showPopup = async () => {
		const recentlyOpened = await services.workspacesService.getRecentlyOpened();

		const renderer = new ErdosModalReactRenderer({
			container: services.workbenchLayoutService.getContainer(DOM.getWindow(ref.current)),
			parent: ref.current
		});

		renderer.render(
			<CustomFolderModalPopup
				anchorElement={ref.current}
				recentlyOpened={recentlyOpened}
				renderer={renderer}
			/>
		);
	};

	return (
		<ActionBarButton
			ref={ref}
			aria-haspopup='menu'
			aria-label={erdosFolderSelector}
			tooltip={erdosFolderSelector}
			onPressed={async () => await showPopup()}
		>
			<div className='top-action-bar-custom-folder-menu'>
				<div aria-hidden='true' className='left'>
					<div className='label'>
						<div className={'action-bar-button-icon codicon codicon-folder'} />
						{context.workspaceFolder &&
							<div className='label-text' id='top-action-bar-current-working-folder'>
								{context.workspaceFolder ? context.workspaceFolder.name : ''}
							</div>
						}
					</div>
				</div>
				<div aria-hidden='true' className='right'>
					<div className='chevron codicon codicon-chevron-down' />
				</div>
			</div>
		</ActionBarButton>
	);
};
