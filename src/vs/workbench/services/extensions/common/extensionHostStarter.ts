/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

export interface IExtensionHostStarter {
	readonly onCrashed: Event<[number, string | null]>;
	start(): Promise<IMessagePassingProtocol> | null;
	getInspectPort(): number | undefined;
	dispose(): void;
}
