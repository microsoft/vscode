/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './checkbox.css';

import React, { useRef, useState } from 'react';

import { generateUuid } from '../../../../../base/common/uuid.js';

interface CheckboxProps {
	label: string;
	initialChecked?: boolean;
	onChanged: (checked: boolean) => void;
}

export const Checkbox = ({ label, initialChecked, onChanged }: CheckboxProps) => {
	const [id] = useState(generateUuid());
	const [checked, setChecked] = useState(initialChecked ?? false);
	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	const clickHandler = () => {
		buttonRef.current.setAttribute('aria-checked', !checked ? 'true' : 'false');
		setChecked(!checked);
		onChanged(!checked);
	};

	return (
		<div className='checkbox'>
			<button ref={buttonRef} aria-checked='false' className='checkbox-button' id={id} role='checkbox' tabIndex={0} onClick={clickHandler}>
				{checked && <div className='check-indicator codicon codicon-check' />}
			</button>
			<label htmlFor={id}>{label}</label>
		</div>
	);
};
