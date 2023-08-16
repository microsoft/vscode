/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { MultiGhostTextController } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';

export class ShowMultiGhostText extends EditorAction {
	constructor() {
		super({
			id: '_showMultiGhostText',
			label: 'Show Multi Ghost Text',
			alias: 'Show Multi Ghost Text',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, ghostTexts: { position: IPosition; text: string }[]): Promise<void> {
		console.log('Show Multi Ghost Text', JSON.stringify(ghostTexts, null, 2));
		console.log('Editor cursor', JSON.stringify(editor.getPosition()));
		const controller = MultiGhostTextController.get(editor);
		controller?.showGhostText(ghostTexts);
	}
}
