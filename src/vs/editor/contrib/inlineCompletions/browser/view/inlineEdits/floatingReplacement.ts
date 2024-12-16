/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { ContentWidgetPositionPreference } from '../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { SingleTextEdit } from '../../../../../common/core/textEdit.js';
import { n } from './utils.js';
import './view.css';


export class FloatingReplacement extends Disposable {
	static _widgetCounter = 0;

	private readonly _domNode = n.div({
		class: 'floatingReplacement',
	}, [
		this._edit.map(edit => edit.text)
	]).keepUpdated(this._store);

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _edit: IObservable<SingleTextEdit>,
	) {
		super();
		this._register(this._editorObs.createContentWidget({
			domNode: this._domNode.element,
			position: this._edit.map(edit => ({
				preference: [ContentWidgetPositionPreference.ABOVE],
				position: edit.range.getStartPosition()
			})),
			allowEditorOverflow: false
		}));
	}
}
