/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWillInstantiateEditorPaneEvent } from '../../../common/editor.js';
import { Event } from '../../../../base/common/event.js';

export const IEditorPaneService = createDecorator<IEditorPaneService>('editorPaneService');

export interface IEditorPaneService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted when an editor pane is about to be instantiated.
	 */
	readonly onWillInstantiateEditorPane: Event<IWillInstantiateEditorPaneEvent>;

	/**
	 * Returns whether a editor pane with the given type id has been instantiated.
	 */
	didInstantiateEditorPane(typeId: string): boolean;
}
