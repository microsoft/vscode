/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './folderTemplateStep.css';

import React, { PropsWithChildren, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { FolderTemplateGroup } from '../folderTemplateGroup.js';
import { checkFolderName } from '../../utilities/folderNameUtils.js';
import { useNewFolderFlowContext } from '../../newFolderFlowContext.js';
import { NewFolderFlowStep } from '../../interfaces/newFolderFlowEnums.js';
import { NewFolderFlowStepProps } from '../../interfaces/newFolderFlowStepProps.js';
import { FolderTemplate } from '../../../../services/erdosNewFolder/common/erdosNewFolder.js';
import { OKCancelBackNextActionBar } from '../../../erdosComponents/erdosModalDialog/components/okCancelBackNextActionBar.js';

const getDefaultFolderName = (templateType: FolderTemplate) => {
	return localize(
		'erdos.newFolderWizard.projectTypeStep.defaultFolderNamePrefix',
		"my"
	) + '-' + templateType.toLowerCase().replace(/\s/g, '-');
};

export const FolderTemplateStep = (props: PropsWithChildren<NewFolderFlowStepProps>) => {
	const context = useNewFolderFlowContext();

	const [selectedTemplateType, setSelectedTemplateType] = useState(context.folderTemplate);

	const nextStep = async () => {
		if (!selectedTemplateType) {
			return;
		}
		if (
			context.folderTemplate !== selectedTemplateType ||
			context.folderName === ''
		) {
			const defaultFolderName = getDefaultFolderName(selectedTemplateType);
			context.folderTemplate = selectedTemplateType;
			context.folderName = defaultFolderName;
			context.folderNameFeedback = await checkFolderName(
				defaultFolderName,
				context.parentFolder,
				context.services.fileService
			);
		}
		props.next(NewFolderFlowStep.FolderNameLocation);
	};

	return (
		<div className='folder-template-selection-step'>
			<div
				className='folder-template-selection-step-title'
				id='folder-template-selection-step-title'
			>
				{(() =>
					localize(
						'erdos.folderTemplate',
						"Folder Template"
					))()}
			</div>
			<FolderTemplateGroup
				describedBy='folder-template-selection-step-description'
				folderTemplates={context.availableFolderTemplates}
				labelledBy='folder-template-selection-step-title'
				name='templateType'
				selectedFolderTemplate={selectedTemplateType}
				onSelectionChanged={(templateType) =>
					setSelectedTemplateType(templateType)
				}
			/>
			<OKCancelBackNextActionBar
				cancelButtonConfig={{
					onClick: props.cancel,
				}}
				nextButtonConfig={{
					onClick: nextStep,
					disable: !selectedTemplateType,
				}}
			/>
		</div>
	);
};
