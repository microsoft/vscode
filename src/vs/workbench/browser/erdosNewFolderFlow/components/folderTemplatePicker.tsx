/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './folderTemplatePicker.css';

import React, { useRef } from 'react';

import { LogoRProject } from './logos/logoRProject.js';
import { LogoEmptyProject } from './logos/logoEmptyProject.js';
import { LogoPythonProject } from './logos/logoPythonProject.js';
import { LogoJupyterNotebook } from './logos/logoJupyterNotebook.js';
import { useNewFolderFlowContext } from '../newFolderFlowContext.js';
import { FolderTemplate } from '../../../services/erdosNewFolder/common/erdosNewFolder.js';

interface FolderTemplatePickerProps {
	identifier: FolderTemplate;
	selected: boolean;
	groupName: string;
	activeTabIndex: boolean;
	onSelected: () => void;
}

export const FolderTemplatePicker = (props: FolderTemplatePickerProps) => {
	const { folderTemplate } = useNewFolderFlowContext();
	const inputRef = useRef<HTMLInputElement>(undefined!);

	const onSelected = () => {
		inputRef.current.focus();
		props.onSelected();
	};

	return (
		<div
			className={
				'folder-template' +
				(props.selected ? ' folder-template-selected' : '')
			}
			onClick={onSelected}
		>
			<div className='folder-template-icon'>
				{props.identifier === FolderTemplate.PythonProject ? (
					<LogoPythonProject />
				) : props.identifier === FolderTemplate.JupyterNotebook ? (
					<LogoJupyterNotebook />
				) : props.identifier === FolderTemplate.RProject ? (
					<LogoRProject />
				) : props.identifier === FolderTemplate.EmptyProject ? (
					<LogoEmptyProject />
				) : null}
			</div>
			<input
				ref={inputRef}
				autoFocus={folderTemplate && props.activeTabIndex}
				checked={props.selected}
				className='folder-template-input'
				id={props.identifier}
				name={props.groupName}
				tabIndex={props.activeTabIndex ? 0 : -1}
				type='radio'
				value={props.identifier}
			/>
			<label htmlFor={props.identifier}>{props.identifier}</label>
		</div>
	);
};
