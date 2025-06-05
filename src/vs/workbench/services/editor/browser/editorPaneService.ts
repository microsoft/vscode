/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorPaneService } from '../common/editorPaneService.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class EditorPaneService implements IEditorPaneService {

	declare readonly _serviceBrand: undefined;

	readonly onWillInstantiateEditorPane = EditorPaneDescriptor.onWillInstantiateEditorPane;

	didInstantiateEditorPane(typeId: string): boolean {
		return EditorPaneDescriptor.didInstantiateEditorPane(typeId);
	}
}

registerSingleton(IEditorPaneService, EditorPaneService, InstantiationType.Delayed);
