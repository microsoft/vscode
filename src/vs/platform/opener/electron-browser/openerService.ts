/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {parse} from 'vs/base/common/marshalling';
import {Schemas} from 'vs/base/common/network';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IOpenerService} from '../common/opener';

export class OpenerService implements IOpenerService {

	serviceId: any;

	constructor(
		@IEditorService private _editorService: IEditorService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		//
	}

	open(resource: URI): TPromise<any> {

		const {scheme, path, query, fragment} = resource;
		let promise: TPromise<any>;
		if (scheme === Schemas.http || scheme === Schemas.https) {
			// open http
			window.open(resource.toString(true));

		} else if (scheme === 'command' && this._keybindingService.hasCommand(path)) {
			// execute as command
			let args: any;
			try {
				args = parse(query);
				if (!Array.isArray(args)) {
					args = [args];
				}
			} catch (e) {
				//
			}
			promise = this._keybindingService.executeCommand(path, ...args);

		} else {
			promise = this._editorService.resolveEditorModel({ resource }).then(model => {
				if (!model) {
					return;
				}
				// support file:///some/file.js#L73
				let selection: {
					startLineNumber: number;
					startColumn: number;
				};
				if (/^L\d+$/.test(fragment)) {
					selection = {
						startLineNumber: parseInt(fragment.substr(1)),
						startColumn: 1
					};
				}
				return this._editorService.openEditor({ resource, options: { selection } });
			});
		}

		return TPromise.as(promise).then(undefined, err => { }); // !ignores all errors
	}
}
