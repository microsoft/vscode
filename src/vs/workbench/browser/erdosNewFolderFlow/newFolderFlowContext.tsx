/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';

import { NewFolderFlowStateManager, NewFolderFlowStateConfig } from './newFolderFlowState.js';

const NewFolderFlowContext = createContext<NewFolderFlowStateManager | undefined>(undefined);

export const NewFolderFlowContextProvider = (props: PropsWithChildren<NewFolderFlowStateConfig>) => {
	const state = new NewFolderFlowStateManager(props);

	return (
		<NewFolderFlowContext.Provider value={state}>
			{props.children}
		</NewFolderFlowContext.Provider>
	);
};

export const useNewFolderFlowContext = () => {
	const state = useContext(NewFolderFlowContext);
	if (!state) {
		throw new Error('No New Folder Flow context provided');
	}
	return state;
};
