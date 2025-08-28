/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext } from 'react';

import { ErdosReactServices } from './erdosReactServices.js';

export const ErdosReactServicesContext = createContext<ErdosReactServices>(undefined!);

export const useErdosReactServicesContext = (): ErdosReactServices => useContext(ErdosReactServicesContext);