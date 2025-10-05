/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyConsole.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { LANGUAGE_RUNTIME_START_NEW_SESSION_ID } from '../../../languageRuntime/browser/languageRuntimeActions.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

const noSessionRunning = localize('erdos.console.empty.noSessionRunning', "There is no session running.");
const useWord = localize('erdos.useWord', "Use");
const startSession = localize('erdos.console.startSession', "Start Session");
const toStartOne = localize('erdos.toStartOne', "to start one.");

export const EmptyConsole = () => {
	const services = useErdosReactServicesContext();

	const handlePressed = () => {
		services.commandService.executeCommand(LANGUAGE_RUNTIME_START_NEW_SESSION_ID);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.code === 'Space' || e.code === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			handlePressed();
		}
	};

	return (
		<div className='empty-console'>
			<div className='title'>
				<span>{noSessionRunning} {useWord} </span>
				<div
					className='link'
					role='button'
					tabIndex={0}
					onClick={handlePressed}
					onKeyDown={handleKeyDown}
				>
					{startSession}
				</div>
				<span> {toStartOne}</span>
			</div>
		</div>
	);
};
