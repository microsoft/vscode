/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './topActionBarCommandCenter.css';

import React, { MouseEvent } from 'react';

import { localize } from '../../../../../nls.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { useRegisterWithActionBar } from '../../../../../platform/erdosActionBar/browser/useRegisterWithActionBar.js';

const erdosShowQuickAccess = localize('erdosShowQuickAccess', "Show Quick Access");

export const TopActionBarCommandCenter = () => {
	const services = useErdosReactServicesContext();

	const searchRef = React.useRef<HTMLButtonElement>(undefined!);
	const dropdownRef = React.useRef<HTMLButtonElement>(undefined!);

	useRegisterWithActionBar([searchRef, dropdownRef]);

	const clickHandler = (e: MouseEvent<HTMLElement>) => {
		e.preventDefault();
		e.stopPropagation();

		services.quickInputService.quickAccess.show(undefined, {
			providerOptions: {
				includeHelp: true,
			} as AnythingQuickAccessProviderRunOptions
		});
	};

	const dropDownClickHandler = (e: MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();

		services.quickInputService.quickAccess.show('?');
	};

	return (
		<div className='top-action-bar-command-center' onClick={(e) => clickHandler(e)}>
			<div className='left'>
				<div aria-hidden='true' className='codicon codicon-erdos-search' />
			</div>
			<div className='center'>
				<button ref={searchRef} className='search' onClick={(e) => clickHandler(e)}>
					<div className='action-bar-button-label'>Search</div>
				</button>
			</div>
			<div className='right'>
				<button ref={dropdownRef} aria-label={erdosShowQuickAccess} className='drop-down' onClick={(e) => dropDownClickHandler(e)} >
					<div aria-hidden='true' className='icon codicon codicon-chevron-down' />
				</button>
			</div>
		</div>
	);
};
