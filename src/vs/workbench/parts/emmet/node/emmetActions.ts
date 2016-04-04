/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {EditorAccessor} from './editorAccessor';

export class ExpandAbbreviationAction extends EditorAction {
	static ID = 'editor.emmet.action.expandAbbreviation';

	private editorAccessor: EditorAccessor;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
		this.editorAccessor = new EditorAccessor(editor);
	}

	public run(): TPromise<boolean> {
		return new TPromise((c, e) => {
			require(['emmet'], (_module) => {
				try {
					if (!this.editorAccessor.isEmmetEnabledMode()) {
						this.editorAccessor.noExpansionOccurred();
						return;
					}
					if (!_module.run('expand_abbreviation', this.editorAccessor)) {
						this.editorAccessor.noExpansionOccurred();
					}
				} catch (err) {
					//
				} finally {
					this.editorAccessor.flushCache();
				}
			}, e);
		});
	}
}