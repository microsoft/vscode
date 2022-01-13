/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/commandDetectionCapability';
import { CwdDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/cwdDetectionCapability';
import { NaiveCwdDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/naiveCwdDetectionCapability';
import { PartialCommandDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/partialCommandDetectionCapability';

export interface ITerminalCapabilityStore {
	readonly items: IterableIterator<TerminalCapability>;
	readonly onDidRemoveCapability: Event<TerminalCapability>;
	readonly onDidAddCapability: Event<TerminalCapability>;
	has(capability: TerminalCapability): boolean;
	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined;
}

export interface ITerminalCapabilityImplMap {
	[TerminalCapability.CwdDetection]: InstanceType<typeof CwdDetectionCapability>;
	[TerminalCapability.CommandDetection]: InstanceType<typeof CommandDetectionCapability>;
	[TerminalCapability.NaiveCwdDetection]: InstanceType<typeof NaiveCwdDetectionCapability>;
	[TerminalCapability.PartialCommandDetection]: InstanceType<typeof PartialCommandDetectionCapability>;
}
