/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
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

/**
 * Describes the extension that contributed a named layout.
 */
export interface INamedLayoutContribution {

	/**
	 * The identifier of the extension.
	 */
	readonly extensionId: string;

	/**
	 * The display name of the extension.
	 */
	readonly extensionName: string;

	/**
	 * The identifier of the layout within the contributions of the extension.
	 */
	readonly id: string;

	/**
	 * Whether the changes made to the layout are saved. Resetting the layout discards them.
	 */
	readonly canReset: boolean;
}

export interface INamedLayout {
	readonly id: string;
	readonly name: string;

	/**
	 * Set for layouts that extensions contribute.
	 */
	readonly contribution?: INamedLayoutContribution;
}

/**
 * The location of a view container in a {@link INamedLayoutDefinition}.
 */
export type NamedLayoutViewContainerLocation = 'sideBar' | 'panel' | 'secondarySideBar';

export interface INamedLayoutPartDefinition {
	readonly visible?: boolean;

	/**
	 * The size as a fraction of the size of the window: the width for the side bars
	 * and a vertical panel, the height for a horizontal panel.
	 */
	readonly size?: number;

	/**
	 * The identifier of the view container that is open in the part.
	 */
	readonly activeViewContainer?: string;
}

export interface INamedLayoutPanelDefinition extends INamedLayoutPartDefinition {
	readonly position?: 'bottom' | 'top' | 'left' | 'right';
	readonly alignment?: 'left' | 'center' | 'right' | 'justify';
	readonly maximized?: boolean;
}

export interface INamedLayoutSecondarySideBarDefinition extends INamedLayoutPartDefinition {
	readonly maximized?: boolean;
}

export interface INamedLayoutViewContainerDefinition {
	readonly location?: NamedLayoutViewContainerLocation;

	/**
	 * Whether the view container is shown in the bar of its location.
	 */
	readonly visible?: boolean;

	/**
	 * View containers with an order are placed first in their bar, in ascending order.
	 */
	readonly order?: number;
}

export interface INamedLayoutViewDefinition {
	readonly visible?: boolean;

	/**
	 * Views with an order are placed first in their view container, in ascending order.
	 */
	readonly order?: number;
}

export interface INamedLayoutEditorGroupDefinition {

	/**
	 * The size relative to the other groups of the same level.
	 */
	readonly size?: number;
	readonly groups?: readonly INamedLayoutEditorGroupDefinition[];
}

export interface INamedLayoutEditorDefinition {
	readonly orientation?: 'horizontal' | 'vertical';
	readonly groups?: readonly INamedLayoutEditorGroupDefinition[];
	readonly centered?: boolean;
}

/**
 * The declarative description of a layout that extensions contribute. All
 * properties are optional, aspects that a definition does not specify are taken
 * from the default layout. Unknown view containers and views are ignored.
 */
export interface INamedLayoutDefinition {

	/**
	 * Values of layout overridable settings.
	 */
	readonly settings?: Readonly<IStringDictionary<unknown>>;
	readonly sideBar?: INamedLayoutPartDefinition;
	readonly panel?: INamedLayoutPanelDefinition;
	readonly secondarySideBar?: INamedLayoutSecondarySideBarDefinition;
	readonly viewContainers?: Readonly<IStringDictionary<INamedLayoutViewContainerDefinition>>;
	readonly views?: Readonly<IStringDictionary<INamedLayoutViewDefinition>>;
	readonly editor?: INamedLayoutEditorDefinition;
}

/**
 * A layout that an extension contributes.
 */
export interface IContributedNamedLayout {
	readonly extensionId: string;
	readonly extensionName: string;

	/**
	 * The identifier of the layout within the contributions of the extension.
	 */
	readonly id: string;
	readonly label: string;
	readonly definition: INamedLayoutDefinition;
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

	/**
	 * Applies the definition of a layout contributed by an extension when that layout
	 * becomes active for the first time. Aspects the definition does not specify are
	 * taken from the given state of the default layout, which is `undefined` if it is
	 * not known. Participants that do not implement this apply the default state.
	 */
	applyDefinition?(definition: INamedLayoutDefinition, defaultState: unknown): Promise<void>;

	/**
	 * Describes the current state of the aspect the participant owns as part of a
	 * {@link INamedLayoutDefinition}. The descriptions of all participants are merged.
	 */
	captureDefinition?(): INamedLayoutDefinition;
}

export interface INamedLayoutsService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires when named layouts were created, deleted or reset, or when the layouts
	 * contributed by extensions changed.
	 */
	readonly onDidChangeLayouts: Event<void>;

	/**
	 * Fires when another layout became active in this window.
	 */
	readonly onDidChangeActiveLayout: Event<INamedLayout>;

	/**
	 * The default layout followed by all named layouts sorted by name and the
	 * layouts contributed by extensions sorted by extension and name.
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
	 * The default layout and layouts contributed by extensions cannot be deleted.
	 */
	deleteLayout(layout: INamedLayout): Promise<void>;

	/**
	 * Sets the layouts that extensions contribute, replacing the previously set ones.
	 * A layout contributed by an extension starts from its definition the first time it
	 * becomes active, after that changes made while it is active are saved like for other
	 * named layouts. If the active layout is no longer contributed, the default layout
	 * is applied. Its saved changes are kept in case the extension contributes it again.
	 */
	setContributedLayouts(layouts: readonly IContributedNamedLayout[]): void;

	/**
	 * Discards the saved changes of the given layout contributed by an extension.
	 * If the layout is active, its definition is applied again.
	 */
	resetLayout(layout: INamedLayout): Promise<void>;

	/**
	 * Describes the current layout of this window in the format of layouts that
	 * extensions contribute. The description is not complete, for example it does not
	 * contain the sizes of views or views moved into other view containers.
	 */
	captureDefinition(): INamedLayoutDefinition;
}
