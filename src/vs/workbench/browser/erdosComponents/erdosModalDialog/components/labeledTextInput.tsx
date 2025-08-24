/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './labeledTextInput.css';

import React, { ChangeEventHandler, forwardRef } from 'react';

import { useDebouncedValidator, ValidatorFn } from './useDebouncedValidator.js';
import { erdosClassNames } from '../../../../../base/common/erdosUtilities.js';

export interface LabeledTextInputProps {
	label: string;
	value: string | number;
	autoFocus?: boolean;
	max?: number;
	min?: number;
	type?: 'text' | 'number' | 'password';
	error?: boolean;
	errorMsg?: string;
	validator?: ValidatorFn<string | number>;
	onChange?: ChangeEventHandler<HTMLInputElement>;
	maxLength?: number;
	disabled?: boolean;
}

export const LabeledTextInput = forwardRef<HTMLInputElement, LabeledTextInputProps>((props, ref) => {

	const validatorErrorMsg = useDebouncedValidator(props);

	const errorMsg = props.errorMsg || validatorErrorMsg;

	return (
		<div className={erdosClassNames('labeled-text-input', { 'disabled': props.disabled })}>
			<label className='label'>
				<span className='label-text'>{props.label}</span>
				<input
					ref={ref}
					autoFocus={props.autoFocus}
					className={erdosClassNames('text-input', { 'error': props.error })}
					disabled={props.disabled}
					max={props.max}
					maxLength={props.maxLength}
					min={props.min}
					type={props.type}
					value={props.value}
					onChange={props.onChange}
				/>
				{errorMsg ? <span className='error error-msg'>{errorMsg}</span> : null}
			</label>
		</div>
	);
});

LabeledTextInput.displayName = 'LabeledTextInput';
