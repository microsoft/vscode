/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ConfigurationChangedEvent, IComputedEditorOptions, IEditorOptions } from './editorOptions.js';
import { IDimension } from '../core/dimension.js';
import { MenuId } from '../../../platform/actions/common/actions.js';

export interface IEditorConfiguration extends IDisposable {
	/**
	 * Is this a simple widget (not a real code editor)?
	 */
	readonly isSimpleWidget: boolean;
	/**
	 * The context menu id for the editor.
	 */
	readonly contextMenuId: MenuId;
	/**
	 * Computed editor options.
	 */
	readonly options: IComputedEditorOptions;
	/**
	 * The `options` have changed (quick event)
	 */
	onDidChangeFast: Event<ConfigurationChangedEvent>;
	/**
	 * The `options` have changed (slow event)
	 */
	onDidChange: Event<ConfigurationChangedEvent>;
	/**
	 * Get the raw options as they were passed in to the editor
	 * and merged with all calls to `updateOptions`.
	 */
	getRawOptions(): IEditorOptions;
	/**
	 * Update the options with new partial options. All previous
	 * options will be kept and only present keys will be overwritten.
	 */
	updateOptions(newOptions: Readonly<IEditorOptions>): void;
	/**
	 * Recompute options with new reference element dimensions.
	 */
	observeContainer(dimension?: IDimension): void;
	/**
	 * Set if the current model is dominated by long lines.
	 */
	setIsDominatedByLongLines(isDominatedByLongLines: boolean): void;
	/**
	 * Set the current model line count.
	 */
	setModelLineCount(modelLineCount: number): void;
	/**
	 * Set the current view model line count.
	 */
	setViewLineCount(viewLineCount: number): void;
	/**
	 * Set reserved height above.
	 */
	setReservedHeight(reservedHeight: number): void;
	/**
	 * Set the number of decoration lanes to be rendered in the glyph margin.
	 */
	setGlyphMarginDecorationLaneCount(decorationLaneCount: number): void;
}
