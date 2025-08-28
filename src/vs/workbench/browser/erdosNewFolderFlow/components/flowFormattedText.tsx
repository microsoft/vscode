/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './flowFormattedText.css';

import React, { PropsWithChildren } from 'react';

export enum FlowFormattedTextType {
	Info = 'info',
	Warning = 'warning',
	Error = 'error'
}

export interface FlowFormattedTextItem {
	type: FlowFormattedTextType;
	text: string;
}

export interface FlowFormattedTextProps {
	type: FlowFormattedTextType;
	id?: string;
}

export const FlowFormattedText = (props: PropsWithChildren<FlowFormattedTextProps>) => {
	const iconClass = props.type !== FlowFormattedTextType.Info
		? `codicon codicon-${props.type}`
		: undefined;

	return (
		<div className={`flow-formatted-text flow-formatted-text-${props.type}`} id={props.id}>
			{iconClass && <div className={`flow-formatted-text-icon ${iconClass}`}></div>}
			{props.children}
		</div>
	);
};
