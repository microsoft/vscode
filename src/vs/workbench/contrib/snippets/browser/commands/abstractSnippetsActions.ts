/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { Action2, IAction2Options } from 'vs/platform/actions/common/actions';

const defaultOptions = {
	category: localize2('snippets', "Snippets"),
} as const;

export abstract class SnippetsAction extends Action2 {

	constructor(desc: Readonly<IAction2Options>) {
		super({ ...defaultOptions, ...desc });
	}
}

export abstract class SnippetEditorAction extends EditorAction2 {

	constructor(desc: Readonly<IAction2Options>) {
		super({ ...defaultOptions, ...desc });
	}
}
