/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';

import { ErdosConsoleState, useErdosConsoleState } from './erdosConsoleState.js';

const erdosConsoleContext = createContext<ErdosConsoleState>(undefined!);

export const ErdosConsoleContextProvider = (props: PropsWithChildren<{}>) => {
	const erdosConsoleState = useErdosConsoleState();

	return (
		<erdosConsoleContext.Provider value={erdosConsoleState}>
			{props.children}
		</erdosConsoleContext.Provider>
	);
};

export const useErdosConsoleContext = () => useContext(erdosConsoleContext);
