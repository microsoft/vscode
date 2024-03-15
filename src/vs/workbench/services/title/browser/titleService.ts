/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAuxiliaryTitlebarPart, ITitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { IEditorGroupsContainer } from 'vs/workbench/services/editor/common/editorGroupsService';

export const ITitleService = createDecorator<ITitleService>('titleService');

export interface ITitleService extends ITitlebarPart {

	readonly _serviceBrand: undefined;

	/**
	 * Get the status bar part that is rooted in the provided container.
	 */
	getPart(container: HTMLElement): ITitlebarPart;

	/**
	 * Creates a new auxililary title bar part in the provided container.
	 */
	createAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer): IAuxiliaryTitlebarPart;
}
