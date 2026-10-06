/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IObservable } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMissionControlEnvironment } from './cloudSandboxAgentHost.js';

export interface IMissionControlHost extends IMissionControlEnvironment {
	readonly hidden?: boolean;
	readonly displayName?: string;
}

export const IMissionControlEnvironmentService = createDecorator<IMissionControlEnvironmentService>('missionControlEnvironmentService');

/** Account/profile-local inventory; discovery and local preferences never provision or attach compute. */
export interface IMissionControlEnvironmentService {
	readonly _serviceBrand: undefined;
	readonly hosts: IObservable<readonly IMissionControlHost[]>;
	readonly accountKey: string | undefined;
	readonly enabled: boolean;
	initialize(): Promise<void>;
	refresh(token: CancellationToken): Promise<void>;
	connect(id: string, token: CancellationToken): Promise<void>;
	disconnect(id: string): Promise<void>;
	hide(id: string): Promise<void>;
	restore(id: string): void;
	setDisplayName(id: string, name: string | undefined): void;
}
