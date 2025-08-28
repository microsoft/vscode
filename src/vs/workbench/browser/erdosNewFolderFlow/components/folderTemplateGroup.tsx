/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './folderTemplateGroup.css';

import React, { PropsWithChildren, useState } from 'react';

import { FolderTemplatePicker } from './folderTemplatePicker.js';
import { FolderTemplate } from '../../../services/erdosNewFolder/common/erdosNewFolder.js';

interface FolderTemplateGroupProps {
	name: string;
	folderTemplates: FolderTemplate[];
	selectedFolderTemplate?: string;
	labelledBy?: string;
	describedBy?: string;
	onSelectionChanged: (folderTemplate: FolderTemplate) => void;
}

export const FolderTemplateGroup = (props: PropsWithChildren<FolderTemplateGroupProps>) => {
	const [currentSelection, setCurrentSelection] = useState(props.selectedFolderTemplate);
	const [activeIndexId, setActiveIndexId] = useState(props.selectedFolderTemplate ?? props.folderTemplates[0] ?? '');

	const onSelectionChanged = (folderTemplate: FolderTemplate) => {
		setCurrentSelection(folderTemplate);
		setActiveIndexId(folderTemplate);
		props.onSelectionChanged(folderTemplate);
	};

	return (
		<div
			aria-describedby={props.describedBy}
			aria-labelledby={props.labelledBy}
			className='folder-template-group'
			role='radiogroup'
		>
			{props.folderTemplates.map((folderTemplate, index) => {
				return (
					<FolderTemplatePicker
						key={index}
						activeTabIndex={folderTemplate === activeIndexId}
						groupName={props.name}
						identifier={folderTemplate}
						selected={folderTemplate === currentSelection}
						onSelected={() => onSelectionChanged(folderTemplate)}
					/>
				);
			})}
		</div>
	);
};
