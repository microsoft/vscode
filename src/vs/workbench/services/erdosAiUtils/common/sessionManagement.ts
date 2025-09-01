/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISessionManagement = createDecorator<ISessionManagement>('sessionManagement');

export interface ISessionManagement {
	readonly _serviceBrand: undefined;

	ensureRSession(): Promise<void>;
	ensurePythonSession(): Promise<void>;
}
