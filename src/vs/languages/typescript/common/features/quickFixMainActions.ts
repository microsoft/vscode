/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import winjs = require('vs/base/common/winjs.base');
import http = require('vs/base/common/http');
import {IFileService} from 'vs/platform/files/common/files';
import {IRequestService} from 'vs/platform/request/common/request';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class QuickFixMainActions {

	private _requestService: IRequestService;
	private _fileService: IFileService;
	private _contextService: IWorkspaceContextService;

	constructor(
		@IRequestService requestService: IRequestService,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this._requestService = requestService;
		this._fileService = fileService;
		this._contextService = contextService;
	}

	public evaluate(resource: URI, range: EditorCommon.IRange, quickFix: Modes.IQuickFix) : winjs.TPromise<Modes.IQuickFixResult> {
		var [command] = quickFix.command.arguments;
		switch (command.type) {
			case 'typedefinitions': {
				return this.evaluateAddTypeDefinitionProposal(command.name, resource);
			}
		}
		return winjs.TPromise.as(null);
	}

	public evaluateAddTypeDefinitionProposal(typingsReference: string, resource: URI): winjs.TPromise<Modes.IQuickFixResult> {
		var dtsFile = 'typings/' + typingsReference;
		var dtsFileResource = this._contextService.toResource(dtsFile);
		var jsConfigResource = this._contextService.toResource('jsconfig.json');
		if (!dtsFileResource || !jsConfigResource) {
			return winjs.TPromise.as(null);
		}

		var resourcePath = this._contextService.toWorkspaceRelativePath(resource);
		if (!resourcePath) {
			resourcePath = resource.fsPath;
		}

		return this._fileService.resolveFile(dtsFileResource).then(file => {
			// file exists already
			return {
				message: nls.localize('typingsReference.already.exists', '{0} already exists. Make sure the file is included in the project\'s jsconfig.json', dtsFile)
			};
		},(error) => {
			var url = 'https://raw.githubusercontent.com/borisyankov/DefinitelyTyped/master/' + typingsReference;
			return this._requestService.makeRequest({ url: url, followRedirects: 5 }).then((response) => {
				return this._fileService.createFile(dtsFileResource, response.responseText).then((file) => {
					return this._fileService.resolveFile(jsConfigResource).then(stat => {
						return {
							message: nls.localize('typingsReference.success.withjsconfig', '{0} successfully downloaded. Make sure the d.ts file is included your project\'s \'jsconfig.json\'.', dtsFile)
						};
					}, error => {
						return {
							message: nls.localize('typingsReference.success.nojsconfig', '{0} successfully downloaded', dtsFile)
						};
					});
				}, (error) => {
					return {
						message: nls.localize('typingsReference.error.write', 'Problem creating {0}: {1}', dtsFile, error.toString())
					};
				});
			}, (error: http.IXHRResponse) => {
				return {
					message: nls.localize('typingsReference.error.download', 'Unable to fetch d.ts file at {0}: {1}', url, error.responseText)
				};
			});
		});
	}


}
