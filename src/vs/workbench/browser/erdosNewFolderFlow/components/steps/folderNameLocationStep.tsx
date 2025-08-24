/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, useEffect, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { useNewFolderFlowContext } from '../../newFolderFlowContext.js';
import { NewFolderFlowStep } from '../../interfaces/newFolderFlowEnums.js';
import { NewFolderFlowStepProps } from '../../interfaces/newFolderFlowStepProps.js';
import { FlowFormattedText, FlowFormattedTextType } from '../flowFormattedText.js';
import { checkFolderName, getMaxFolderPathLength } from '../../utilities/folderNameUtils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FolderTemplate } from '../../../../services/erdosNewFolder/common/erdosNewFolder.js';
import { ActionBarButtonConfig, OKCancelBackNextActionBar } from '../../../erdosComponents/erdosModalDialog/components/okCancelBackNextActionBar.js';

interface OKButtonConfig {
	okButtonConfig: ActionBarButtonConfig;
}

interface NextButtonConfig {
	nextButtonConfig: ActionBarButtonConfig;
}

type OKNextButtonConfig = OKButtonConfig | NextButtonConfig;

export const FolderNameLocationStep = (props: PropsWithChildren<NewFolderFlowStepProps>) => {
	const context = useNewFolderFlowContext();
	const { fileDialogService, fileService, logService } = context.services;

	const [folderName, setFolderName] = useState(context.folderName);
	const [parentFolder, setParentFolder] = useState(() => context.parentFolder.path);
	const [folderNameFeedback, setFolderNameFeedback] = useState(context.folderNameFeedback);
	const [maxFolderPathLength, setMaxFolderPathLength] = useState(() => getMaxFolderPathLength(parentFolder.length));

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(context.onUpdateFolderPath(() => {
			setFolderName(context.folderName);
			setFolderNameFeedback(context.folderNameFeedback);
			setMaxFolderPathLength(() => getMaxFolderPathLength(context.parentFolder.path.length));
		}));

		return () => disposableStore.dispose();
	}, [context]);

	const browseHandler = async () => {
		const uri = await fileDialogService.showOpenDialog({
			defaultUri: context.parentFolder,
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
		});

		if (uri?.length) {
			setParentFolder(uri[0].path);
			context.parentFolder = uri[0];
		}
	};

	const onChangeProjectName = async (name: string) => {
		context.folderName = name.trim();
		context.folderNameFeedback = await checkFolderName(
			name,
			context.parentFolder,
			fileService
		);
		setFolderName(name);
		setFolderNameFeedback(context.folderNameFeedback);
	};

	const nextStep = async () => {
		switch (context.folderTemplate) {
			case FolderTemplate.RProject:
				props.next(NewFolderFlowStep.RConfiguration);
				break;
			case FolderTemplate.JupyterNotebook:
			case FolderTemplate.PythonProject:
				props.next(NewFolderFlowStep.PythonEnvironment);
				break;
			default:
				logService.error(
					'No next step found for project type: ' +
					context.folderTemplate
				);
				break;
		}
	};

	const okNextButtonDisabled = !folderName ||
		!parentFolder ||
		(folderNameFeedback && folderNameFeedback.type === FlowFormattedTextType.Error);

	const configurationNeeded = context.folderTemplate !== FolderTemplate.EmptyProject;

	let okNextButtonConfig: OKNextButtonConfig;
	if (configurationNeeded) {
		okNextButtonConfig = {
			nextButtonConfig: {
				onClick: nextStep,
				disable: okNextButtonDisabled,
				title: localize(
					'erdos.newFolderFlow.nextButtonTitle',
					"Next"
				)
			}
		};
	} else {
		okNextButtonConfig = {
			okButtonConfig: {
				onClick: props.accept,
				disable: okNextButtonDisabled,
				title: localize(
					'erdos.newFolderFlow.createButtonTitle',
					"Create"
				)
			}
		};
	}

	return (
		<div className='folder-name-location-step'>
			<div className='folder-name-location-step-title'>
				{localize(
					'folderNameLocationStep.title',
					"Folder Name and Location"
				)}
			</div>
			
			<div className='folder-name-section'>
				<label>
					{localize(
						'folderNameLocationSubStep.folderName.label',
						"Folder Name"
					)}
				</label>
				<input
					type='text'
					autoFocus
					maxLength={maxFolderPathLength}
					value={folderName}
					onChange={(e) => onChangeProjectName(e.target.value)}
				/>
				{folderNameFeedback && (
					<FlowFormattedText type={folderNameFeedback.type}>
						{folderNameFeedback.text}
					</FlowFormattedText>
				)}
			</div>

			<div className='parent-folder-section'>
				<label>
					{localize(
						'folderNameLocationSubStep.parentFolder.label',
						"Location"
					)}
				</label>
				<div className='folder-input-container'>
					<input
						type='text'
						value={parentFolder}
						onChange={(e) => setParentFolder(e.target.value)}
					/>
					<button onClick={browseHandler}>Browse</button>
				</div>
				<FlowFormattedText type={FlowFormattedTextType.Info}>
					{localize(
						'folderNameLocationSubStep.parentFolder.feedback',
						"New folder will be created at "
					)}
					{parentFolder}/{folderName}
				</FlowFormattedText>
			</div>

			<div className='options-section'>
				<label>
					<input
						type='checkbox'
						checked={context.initGitRepo}
						onChange={(e) => context.initGitRepo = e.target.checked}
					/>
					{localize(
						'folderNameLocationSubStep.initGitRepo.label',
						"Initialize Git repository"
					)}
				</label>
				{context.folderTemplate === FolderTemplate.PythonProject && (
					<label>
						<input
							type='checkbox'
							checked={context.createPyprojectToml}
							onChange={(e) => context.createPyprojectToml = e.target.checked}
						/>
						{localize(
							'folderNameLocationSubStep.createPyprojectToml.label',
							"Create pyproject.toml file"
						)}
					</label>
				)}
			</div>

			<OKCancelBackNextActionBar
				backButtonConfig={{ onClick: props.back }}
				cancelButtonConfig={{ onClick: props.cancel }}
				{...okNextButtonConfig}
			/>
		</div>
	);
};
