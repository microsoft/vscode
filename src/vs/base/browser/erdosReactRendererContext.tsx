/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext } from 'react';

// Other dependencies.
import { ErdosReactServices } from './erdosReactServices.js';

/**
 * ErdosReactServicesContext.
 */
export const ErdosReactServicesContext = createContext<ErdosReactServices>(undefined!);

/**
 * useErdosReactServicesContext hook.
 * @returns The Erdos React services context.
 */
export const useErdosReactServicesContext = () => useContext(ErdosReactServicesContext);