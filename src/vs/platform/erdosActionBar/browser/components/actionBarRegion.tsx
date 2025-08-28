/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBarRegion.css';

import React, { PropsWithChildren } from 'react';

import { optionalValue, erdosClassNames } from '../../../../base/common/erdosUtilities.js';

interface ActionBarRegionProps {
	gap?: number;
	width?: number;
	location: 'left' | 'center' | 'right';
	justify?: 'left' | 'center' | 'right';
}

export const ActionBarRegion = (props: PropsWithChildren<ActionBarRegionProps>) => {
	const classNames = erdosClassNames(
		`action-bar-region action-bar-region-${props.location}`,
		`action-bar-region-justify-${props.justify || props.location}`
	);

	return (
		<div
			className={classNames}
			style={{
				gap: optionalValue(props.gap, 0),
				width: optionalValue(props.width, 'auto'),
				minWidth: optionalValue(props.width, 'auto')
			}}>
			{props.children}
		</div>
	);
};