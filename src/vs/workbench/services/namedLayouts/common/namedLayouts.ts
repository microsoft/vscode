/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const INamedLayoutsService = createDecorator<INamedLayoutsService>('namedLayoutsService');

/**
 * Setting that enables named layouts.
 */
export const NAMED_LAYOUTS_ENABLED_SETTING = 'workbench.experimental.namedLayouts.enabled';

/**
 * Identifier of the built-in layout that is active when no named layout is active.
 * It does not define any settings, so user and workspace settings apply.
 */
export const DEFAULT_NAMED_LAYOUT_ID = 'default';

export interface INamedLayout {
	readonly id: string;
	readonly name: string;
}

/**
 * A participant owns one aspect of a named layout, for example the arrangement
 * of the workbench parts or of the editor groups. The settings of a named layout
 * are owned by the named layouts service itself.
 *
 * Participants are applied in the order in which they are registered, after
 * the settings of the layout have been applied.
 */
export interface INamedLayoutParticipant {

	/**
	 * A stable identifier. It is used to store the state of the participant
	 * as part of a named layout.
	 */
	readonly id: string;

	/**
	 * Returns a JSON serializable snapshot of the current state of the aspect
	 * the participant owns.
	 */
	capture(): unknown;

	/**
	 * Applies a snapshot previously returned by {@link capture}. Snapshots are
	 * persisted, so participants must validate them before applying them.
	 */
	apply(state: unknown): Promise<void>;

	/**
	 * Implemented by participants whose state the default layout shares with the
	 * other windows of the profile. Restores that shared state when the default
	 * layout becomes active. The state of such participants is not saved for the
	 * default layout, and {@link apply} is only called for named layouts.
	 */
	applyDefault?(): Promise<void>;
}

export interface INamedLayoutsService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires when named layouts were created or deleted.
	 */
	readonly onDidChangeLayouts: Event<void>;

	/**
	 * Fires when another layout became active in this window.
	 */
	readonly onDidChangeActiveLayout: Event<INamedLayout>;

	/**
	 * The default layout followed by all named layouts sorted by name.
	 */
	readonly layouts: readonly INamedLayout[];

	/**
	 * The layout that is active in this window.
	 */
	readonly activeLayout: INamedLayout;

	/**
	 * Registers a participant that captures and applies one aspect of named layouts.
	 * A participant that implements {@link INamedLayoutParticipant.applyDefault} is
	 * brought in line with the active layout when it registers.
	 */
	registerParticipant(participant: INamedLayoutParticipant): IDisposable;

	/**
	 * Creates a named layout from the current layout of this window and activates it.
	 */
	createLayout(name: string): Promise<INamedLayout>;

	/**
	 * Saves the active layout and applies the given layout to this window.
	 */
	switchLayout(layout: INamedLayout): Promise<void>;

	/**
	 * Deletes the given named layout. If it is active, the default layout is applied first.
	 * The default layout cannot be deleted.
	 */
	deleteLayout(layout: INamedLayout): Promise<void>;
}
