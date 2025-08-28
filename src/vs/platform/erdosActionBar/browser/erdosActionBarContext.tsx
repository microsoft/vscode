/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';

import { ErdosActionBarState, useErdosActionBarState } from './erdosActionBarState.js';

const ErdosActionBarContext = createContext<ErdosActionBarState>(undefined!);

export const ErdosActionBarContextProvider = (props: PropsWithChildren<{}>) => {
	const erdosActionBarState = useErdosActionBarState();

	return (
		<ErdosActionBarContext.Provider value={erdosActionBarState}>
			{props.children}
		</ErdosActionBarContext.Provider>
	);
};

export const useErdosActionBarContext = () => useContext(ErdosActionBarContext);