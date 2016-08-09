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
import {ICommandService, CommandsRegistry} from 'vs/platform/commands/common/commands';
import {IOpenerService} from '../common/opener';

export class OpenerService implements IOpenerService {

	_serviceBrand: any;

	constructor(
		@IEditorService private _editorService: IEditorService,
		@ICommandService private _commandService: ICommandService
	) {
		//
	}

	open(resource: URI, options?: { openToSide?: boolean }): TPromise<any> {

		const {scheme, path, query, fragment} = resource;
		let promise: TPromise<any>;
		if (scheme === Schemas.http || scheme === Schemas.https) {
			// open http
			window.open(resource.toString(true));

		} else if (scheme === 'command' && CommandsRegistry.getCommand(path)) {
			// execute as command
			let args: any = [];
			try {
				args = parse(query);
				if (!Array.isArray(args)) {
					args = [args];
				}
			} catch (e) {
				//
			}
			promise = this._commandService.executeCommand(path, ...args);

		} else {
			promise = this._editorService.resolveEditorModel({ resource }).then(model => {
				if (!model) {
					return;
				}
				let selection: {
					startLineNumber: number;
					startColumn: number;
				};
				const match = /^L?(\d+)(?:,(\d+))?/.exec(fragment);
				if (match) {
					// support file:///some/file.js#73,84
					// support file:///some/file.js#L73
					selection = {
						startLineNumber: parseInt(match[1]),
						startColumn: match[2] ? parseInt(match[2]) : 1
					};
					// remove fragment
					resource = resource.with({ fragment: '' });
				}
				return this._editorService.openEditor({ resource, options: { selection, } }, options && options.openToSide);
			});
		}

		return TPromise.as(promise).then(undefined, err => { }); // !ignores all errors
	}
}
