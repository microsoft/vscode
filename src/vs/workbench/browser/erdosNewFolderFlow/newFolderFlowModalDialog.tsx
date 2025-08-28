/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

import { localize } from '../../../nls.js';
import { NewFolderFlowContextProvider, useNewFolderFlowContext } from './newFolderFlowContext.js';
import { NewFolderFlowState } from './newFolderFlowState.js';
import { NewFolderFlowStepContainer } from './newFolderFlowStepContainer.js';
import { ErdosModalDialog } from '../erdosComponents/erdosModalDialog/erdosModalDialog.js';
import { NewFolderConfiguration } from '../../services/erdosNewFolder/common/erdosNewFolder.js';
import { NewFolderFlowStep } from './interfaces/newFolderFlowEnums.js';
import { showChooseNewFolderWindowModalDialog } from './chooseNewFolderWindowModalDialog.js';
import { URI } from '../../../base/common/uri.js';
import { ErdosModalReactRenderer } from '../../../base/browser/erdosModalReactRenderer.js';

export const showNewFolderFlowModalDialog = async (): Promise<void> => {
	const renderer = new ErdosModalReactRenderer()

	renderer.render(
		<NewFolderFlowContextProvider
			initialStep={NewFolderFlowStep.FolderTemplateSelection}
			parentFolder={await renderer.services.fileDialogService.defaultFolderPath()}
		>
			<NewFolderFlowModalDialog
				createFolder={async result => {
					const folder = URI.joinPath(result.parentFolder, result.folderName);
					const existingFolder = await renderer.services.fileService.exists(folder);
					if (!existingFolder) {
						await renderer.services.fileService.createFolder(folder);
					}

					if (result.installIpykernel) {
						const pythonPath =
							result.selectedRuntime?.extraRuntimeData
								?.pythonPath ??
							result.selectedRuntime?.runtimePath ??
							undefined;
						if (!pythonPath) {
							renderer.services.logService.error(
								'Could not determine python path to install ipykernel via New Folder Flow'
							);
						} else {
							await renderer.services.commandService.executeCommand(
								'python.installIpykernel',
								String(pythonPath)
							);
						}
					}

					const newFolderConfig: NewFolderConfiguration = {
						folderScheme: folder.scheme,
						folderAuthority: folder.authority,
						runtimeMetadata: result.selectedRuntime || undefined,
						folderTemplate: result.folderTemplate || '',
						folderPath: folder.path,
						folderName: result.folderName,
						initGitRepo: result.initGitRepo,
						createPyprojectToml: result.createPyprojectToml,
						pythonEnvProviderId: result.pythonEnvProviderId,
						pythonEnvProviderName: result.pythonEnvProviderName,
						installIpykernel: result.installIpykernel,
						condaPythonVersion: result.condaPythonVersion,
						uvPythonVersion: result.uvPythonVersion,
						useRenv: result.useRenv,
					};

					renderer.services.erdosNewFolderService.storeNewFolderConfig(newFolderConfig);

					if (!existingFolder) {
						renderer.services.workspaceTrustManagementService.setUrisTrust([folder], true);
					}

					showChooseNewFolderWindowModalDialog(
						folder.path,
						folder,
						result.openInNewWindow
					);
				}}
				renderer={renderer}
			/>
		</NewFolderFlowContextProvider>
	);
};

interface NewFolderFlowModalDialogProps {
	renderer: ErdosModalReactRenderer;
	createFolder: (result: NewFolderFlowState) => Promise<void>;
}

const NewFolderFlowModalDialog = (props: NewFolderFlowModalDialogProps) => {
	const context = useNewFolderFlowContext();

	const acceptHandler = async () => {
		props.renderer.dispose();
		await props.createFolder(context.getState());
	};

	const cancelHandler = () => {
		props.renderer.dispose();
	};

	return (
		<ErdosModalDialog
			height={520}
			renderer={props.renderer} title={(() => localize('erdos.newFolderFromTemplate', "New Folder From Template"))()}
			width={700}
			onCancel={cancelHandler}
		>
			<NewFolderFlowStepContainer accept={acceptHandler} cancel={cancelHandler} />
		</ErdosModalDialog>
	);
};
