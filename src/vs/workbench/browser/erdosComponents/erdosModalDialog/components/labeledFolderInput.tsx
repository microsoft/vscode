/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './labeledFolderInput.css';

import React, { ChangeEventHandler } from 'react';

import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';
import { checkIfPathExists, checkIfPathValid } from './fileInputValidators.js';
import { useDebouncedValidator } from './useDebouncedValidator.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

export interface LabeledFolderInputProps {
	label: string;
	value: string;
	error?: boolean;
	errorMsg?: string;
	skipValidation?: boolean;
	placeholder?: string;
	readOnlyInput?: boolean;
	inputRef?: React.RefObject<HTMLInputElement>;
	onBrowse: VoidFunction;
	onChange: ChangeEventHandler<HTMLInputElement>;
}

interface LabeledExistingFolderInputProps extends LabeledFolderInputProps {
	mustExist: true;
	fileService: IFileService;
}

export const LabeledFolderInput = ({ skipValidation = false, ...props }: LabeledFolderInputProps | LabeledExistingFolderInputProps) => {

	const validatorFn = skipValidation ?
		noOpValidator :
		'mustExist' in props ?
			(path: string | number) => checkIfPathExists(path, props.fileService) :
			checkIfPathValid;
	const validatorErrorMsg = useDebouncedValidator({ value: props.value, validator: validatorFn });
	const errorMsg = props.errorMsg || validatorErrorMsg;

	return (
		<div className='labeled-folder-input'>
			<label>
				{props.label}
				<div className='folder-input'>
					<input className='text-input' maxLength={255} placeholder={props.placeholder} readOnly={props.readOnlyInput} type='text' value={props.value} onChange={props.onChange} />
					<Button className='browse-button' onPressed={props.onBrowse}>
						{localize('erdosFolderInputBrowse', 'Browse...')}
					</Button>
				</div>
				{errorMsg ? <span className='error error-msg'>{errorMsg}</span> : null}
			</label>
		</div>
	);
};

function noOpValidator() { return undefined; }
