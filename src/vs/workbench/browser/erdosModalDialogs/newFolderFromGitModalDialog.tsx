/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './newFolderFromGitModalDialog.css';

import React, { useRef, useState } from 'react';

import { localize } from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { combineLabelWithPathUri, pathUriToLabel } from '../utils/path.js';
import { Checkbox } from '../erdosComponents/erdosModalDialog/components/checkbox.js';
import { ErdosModalReactRenderer } from '../../../base/browser/erdosModalReactRenderer.js';
import { VerticalStack } from '../erdosComponents/erdosModalDialog/components/verticalStack.js';
import { useErdosReactServicesContext } from '../../../base/browser/erdosReactRendererContext.js';
import { VerticalSpacer } from '../erdosComponents/erdosModalDialog/components/verticalSpacer.js';
import { isInputEmpty } from '../erdosComponents/erdosModalDialog/components/fileInputValidators.js';
import { LabeledTextInput } from '../erdosComponents/erdosModalDialog/components/labeledTextInput.js';
import { OKCancelModalDialog } from '../erdosComponents/erdosModalDialog/erdosOKCancelModalDialog.js';
import { LabeledFolderInput } from '../erdosComponents/erdosModalDialog/components/labeledFolderInput.js';

interface NewFolderFromGitResult {
	readonly repo: string;
	readonly parentFolder: URI;
	readonly newWindow: boolean;
}

interface NewFolderFromGitModalDialogProps {
	renderer: ErdosModalReactRenderer;
	parentFolder: URI;
	createFolder: (result: NewFolderFromGitResult) => Promise<void>;
}

export const NewFolderFromGitModalDialog = (props: NewFolderFromGitModalDialogProps) => {
	const services = useErdosReactServicesContext();

	const folderNameRef = useRef<HTMLInputElement>(undefined!);

	const [parentFolderLabel, setParentFolderLabel] = useState(
		() => pathUriToLabel(props.parentFolder, services.labelService)
	);
	const [result, setResult] = useState<NewFolderFromGitResult>({
		repo: '',
		parentFolder: props.parentFolder,
		newWindow: false
	});

	const browseHandler = async () => {
		const parentFolderUri = await combineLabelWithPathUri(
			parentFolderLabel,
			props.parentFolder,
			services.pathService
		);

		const uri = await services.fileDialogService.showOpenDialog({
			defaultUri: parentFolderUri,
			canSelectFiles: false,
			canSelectFolders: true
		});

		if (uri?.length) {
			const pathLabel = pathUriToLabel(uri[0], services.labelService);
			setParentFolderLabel(pathLabel);
			setResult({ ...result, parentFolder: uri[0] });
			folderNameRef.current.focus();
		}
	};

	const onChangeParentFolder = async (folder: string) => {
		setParentFolderLabel(folder);
		const parentFolderUri = await combineLabelWithPathUri(
			folder,
			props.parentFolder,
			services.pathService
		);
		setResult({ ...result, parentFolder: parentFolderUri });
	};

	return (
		<OKCancelModalDialog
			catchErrors
			height={300}
			renderer={props.renderer}
			title={(() => localize(
				'erdosNewFolderFromGitModalDialogTitle',
				"New Folder from Git"
			))()}
			width={400}
			onAccept={async () => {
				if (isInputEmpty(result.repo)) {
					throw new Error(localize('erdos.gitRepoNotProvided', "A git repository URL was not provided."));
				}
				await props.createFolder(result);
				props.renderer.dispose();
			}}
			onCancel={() => props.renderer.dispose()}
		>
			<VerticalStack>
				<LabeledTextInput
					ref={folderNameRef}
					autoFocus
					label={(() => localize(
						'erdos.GitRepositoryURL',
						"Git repository URL"
					))()}
					value={result.repo}
					onChange={e => setResult({ ...result, repo: e.target.value })}
				/>
				<LabeledFolderInput
					label={(() => localize(
						'erdos.createFolderAsSubfolderOf',
						"Create folder as subfolder of"
					))()}
					value={parentFolderLabel}
					onBrowse={browseHandler}
					onChange={e => onChangeParentFolder(e.target.value)}
				/>
			</VerticalStack>
			<VerticalSpacer>
				<Checkbox
					label={(() => localize(
						'erdos.openInNewWindow',
						"Open in a new window"
					))()}
					onChanged={checked => setResult({ ...result, newWindow: checked })} />
			</VerticalSpacer>
		</OKCancelModalDialog>
	);
};

export const showNewFolderFromGitModalDialog = async (): Promise<void> => {
	const renderer = new ErdosModalReactRenderer();

	renderer.render(
		<NewFolderFromGitModalDialog
			createFolder={async result => {
				if (result.repo) {
					const kGitOpenAfterClone = 'git.openAfterClone';
					const prevOpenAfterClone = renderer.services.configurationService.getValue(kGitOpenAfterClone);
					renderer.services.configurationService.updateValue(
						kGitOpenAfterClone,
						result.newWindow ? 'alwaysNewWindow' : 'always'
					);
					const parentFolder = renderer.services.labelService.getUriLabel(
						result.parentFolder,
						{ noPrefix: true }
					);
					try {
						await renderer.services.commandService.executeCommand(
							'git.clone',
							result.repo,
							parentFolder
						);
					} finally {
						renderer.services.configurationService.updateValue(kGitOpenAfterClone, prevOpenAfterClone);
					}
				}
			}}
			parentFolder={await renderer.services.fileDialogService.defaultFolderPath()}
			renderer={renderer}
		/>
	);
};
