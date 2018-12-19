/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class OpenerService implements IOpenerService {

	_serviceBrand: any;

	constructor(
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		//
	}

	open(resource: URI, options?: { openToSide?: boolean }): Promise<any> {

		const { scheme, path, query, fragment } = resource;
		let promise: Promise<any> | undefined = undefined;

		if (scheme === Schemas.http || scheme === Schemas.https || scheme === Schemas.mailto) {
			// open http or default mail application
			dom.windowOpenNoOpener(resource.toString(true));
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
			let selection: {
				startLineNumber: number;
				startColumn: number;
			} | undefined = undefined;
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

			if (!resource.scheme) {
				// we cannot handle those
				return Promise.resolve(undefined);

			} else if (resource.scheme === Schemas.file) {
				resource = resources.normalizePath(resource); // workaround for non-normalized paths (https://github.com/Microsoft/vscode/issues/12954)
			}
			promise = this._editorService.openCodeEditor({ resource, options: { selection, } }, this._editorService.getFocusedCodeEditor(), options && options.openToSide);
		}

		return Promise.resolve(promise);
	}
}
