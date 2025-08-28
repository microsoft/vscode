/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './runtimeStartupProgress.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { IRuntimeAutoStartEvent } from '../../../../services/runtimeStartup/common/runtimeStartupService.js';

export interface RuntimeStartupProgressProps {
	evt: IRuntimeAutoStartEvent;
}

const preparing = localize('erdos.runtimeStartup.newSession', "Preparing");
const reconnecting = localize('erdos.runtimeStartup.existingSession', "Reconnecting");

export const RuntimeStartupProgress = (props: RuntimeStartupProgressProps) => {
	return (
		<div className='runtime-startup-progress'>
			<img className='runtime-startup-progress-icon' src={`data:image/svg+xml;base64,${props.evt.runtime.base64EncodedIconSvg}`} />
			<div className='runtime-name'>{props.evt.runtime.runtimeName}</div>
			<div className='action'>{props.evt.newSession ? preparing : reconnecting}</div>
		</div>
	);
};
