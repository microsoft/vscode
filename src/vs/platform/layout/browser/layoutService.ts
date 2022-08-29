/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILayoutService = createDecorator<ILayoutService>('layoutService');

export interface ILayoutOffsetInfo {
	/**
	 * Generic top offset
	 */
	readonly top: number;
	/**
	 * Quick pick specific top offset.
	 */
	readonly quickPickTop: number;
}

export interface ILayoutService {

	readonly _serviceBrand: undefined;

	/**
	 * The dimensions of the container.
	 */
	readonly dimension: IDimension;

	/**
	 * Does the application have a single container?
	 */
	readonly hasContainer: boolean;

	/**
	 * Container of the application.
	 *
	 * **NOTE**: In the standalone editor case, multiple editors can be created on a page.
	 * Therefore, in the standalone editor case, there are multiple containers, not just
	 * a single one. If you ship code that needs a "container" for the standalone editor,
	 * please use `ICodeEditorService` to get the current focused code editor and use its
	 * container if necessary. You can also instantiate `EditorScopedLayoutService`
	 * which implements `ILayoutService` but is not a part of the service collection because
	 * it is code editor instance specific.
	 *
	 */
	readonly container: HTMLElement;

	/**
	 * An offset to use for positioning elements inside the container.
	 */
	readonly offset: ILayoutOffsetInfo;

	/**
	 * An event that is emitted when the container is layed out. The
	 * event carries the dimensions of the container as part of it.
	 */
	readonly onDidLayout: Event<IDimension>;

	/**
	 * Focus the primary component of the container.
	 */
	focus(): void;
}
