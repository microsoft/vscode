/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chooseNewFolderWindowModalDialog.css';

import React, { useRef } from 'react';

import { localize } from '../../../nls.js';
import { VerticalStack } from '../erdosComponents/erdosModalDialog/components/verticalStack.js';
import { ErdosModalDialog } from '../erdosComponents/erdosModalDialog/erdosModalDialog.js';
import { Button } from '../../../base/browser/ui/erdosComponents/button/button.js';
import { URI } from '../../../base/common/uri.js';
import { ErdosModalReactRenderer } from '../../../base/browser/erdosModalReactRenderer.js';

export const showChooseNewFolderWindowModalDialog = (
	folderName: string,
	folderUri: URI,
	openInNewWindow: boolean,
) => {
	const renderer = new ErdosModalReactRenderer();

	renderer.render(
		<ChooseNewFolderWindowModalDialog
			chooseNewFolderWindowAction={async (openInNewWindow: boolean) => {
				await renderer.services.commandService.executeCommand(
					'vscode.openFolder',
					folderUri,
					{
						forceNewWindow: openInNewWindow,
						forceReuseWindow: !openInNewWindow
					}
				);
			}}
			folderName={folderName}
			openInNewWindow={openInNewWindow}
			renderer={renderer}
		/>
	);
};

interface ChooseNewFolderWindowModalDialogProps {
	renderer: ErdosModalReactRenderer;
	folderName: string;
	openInNewWindow: boolean;
	chooseNewFolderWindowAction: (openInNewWindow: boolean) => Promise<void>;
}

const ChooseNewFolderWindowModalDialog = (props: ChooseNewFolderWindowModalDialogProps) => {
	const openInNewWindow = useRef(props.openInNewWindow);

	const newWindowButtonConfig = {
		title: localize('erdos.newFolder.whereToOpen.newWindow', "New Window"),
		onClick: () => setWindowAndAccept(true)
	};
	const currentWindowButtonConfig = {
		title: localize('erdos.newFolder.whereToOpen.currentWindow', "Current Window"),
		onClick: () => setWindowAndAccept(false)
	};
	const defaultButtonConfig = props.openInNewWindow ? newWindowButtonConfig : currentWindowButtonConfig;
	const otherButtonConfig = props.openInNewWindow ? currentWindowButtonConfig : newWindowButtonConfig;

	const setWindowAndAccept = async (newWindow: boolean) => {
		openInNewWindow.current = newWindow;
		await accept();
	};

	const accept = async () => {
		props.renderer.dispose();
		await props.chooseNewFolderWindowAction(openInNewWindow.current);
	};

	return (
		<ErdosModalDialog
			height={220}
			renderer={props.renderer}
			title={(() =>
				localize(
					'erdos.newFolderCreated',
					'New Folder Created'
				))()}
			width={500}
		>
			<div className='choose-new-folder-window-modal-dialog'>
				<VerticalStack>
					<code>{props.folderName}</code>
					<div>
						{(() =>
							localize(
								'erdos.newFolderCreated.whereToOpen',
								"The folder has been created. Where would you like to open it?"
							))()}
					</div>
				</VerticalStack>
				<div className='folder-window-action-bar top-separator'>
					<Button className='button action-bar-button' onPressed={otherButtonConfig.onClick}>
						{otherButtonConfig.title}
					</Button>
					<Button className='button action-bar-button default' onPressed={defaultButtonConfig.onClick}>
						{defaultButtonConfig.title}
					</Button>
				</div>
			</div>
		</ErdosModalDialog>
	);
};
