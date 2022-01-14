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

/**
 * An object that keeps track of additional capabilities and their implementations for features that
 * are not available for all terminals.
 */
export interface ITerminalCapabilityStore {
	/**
	 * An iterable of all capabilities in the store.
	 */
	readonly items: IterableIterator<TerminalCapability>;

	/**
	 * Fired when a capability is added.
	 */
	readonly onDidAddCapability: Event<TerminalCapability>;

	/**
	 * Fired when a capability is removed.
	 */
	readonly onDidRemoveCapability: Event<TerminalCapability>;

	/**
	 * Gets whether the capability exists in the store.
	 */
	has(capability: TerminalCapability): boolean;

	/**
	 * Gets the implementation of a capability if it has been added to the store.
	 */
	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined;
}

/**
 * Maps capability types to their implementation, enabling strongly typed fetching of
 * implementations.
 */
export interface ITerminalCapabilityImplMap {
	[TerminalCapability.CwdDetection]: InstanceType<typeof CwdDetectionCapability>;
	[TerminalCapability.CommandDetection]: InstanceType<typeof CommandDetectionCapability>;
	[TerminalCapability.NaiveCwdDetection]: InstanceType<typeof NaiveCwdDetectionCapability>;
	[TerminalCapability.PartialCommandDetection]: InstanceType<typeof PartialCommandDetectionCapability>;
}
