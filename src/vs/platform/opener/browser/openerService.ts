/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { normalize } from 'vs/base/common/paths';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';

export class OpenerService implements IOpenerService {

	_serviceBrand: any;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ICommandService private readonly _commandService: ICommandService,
		@optional(ITelemetryService) private _telemetryService: ITelemetryService = NullTelemetryService
	) {
		//
	}

	open(resource: URI, options?: { openToSide?: boolean }): TPromise<any> {

		/* __GDPR__
			"openerService" : {
				"scheme" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('openerService', { scheme: resource.scheme });

		const { scheme, path, query, fragment } = resource;
		let promise: TPromise<any> = TPromise.wrap(void 0);

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

			if (!resource.scheme) {
				// we cannot handle those
				return TPromise.as(undefined);

			} else if (resource.scheme === Schemas.file) {
				resource = resource.with({ path: normalize(resource.path) }); // workaround for non-normalized paths (https://github.com/Microsoft/vscode/issues/12954)
			}
			promise = this._editorService.openEditor({ resource, options: { selection, } }, options && options.openToSide);
		}

		return promise;
	}
}
