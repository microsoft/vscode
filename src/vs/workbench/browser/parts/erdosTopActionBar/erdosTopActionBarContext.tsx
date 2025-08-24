/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';

import { ErdosTopActionBarState, useErdosTopActionBarState } from './erdosTopActionBarState.js';

const ErdosTopActionBarContext = createContext<ErdosTopActionBarState>(undefined!);

export const ErdosTopActionBarContextProvider = (props: PropsWithChildren<{}>) => {
	const erdosTopActionBarState = useErdosTopActionBarState();

	return (
		<ErdosTopActionBarContext.Provider value={erdosTopActionBarState}>
			{props.children}
		</ErdosTopActionBarContext.Provider>
	);
};

export const useErdosTopActionBarContext = () => useContext(ErdosTopActionBarContext);
