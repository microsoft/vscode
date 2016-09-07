/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMirrorModel, IWorkerContext} from 'vs/editor/common/services/editorSimpleWorker';
import {OutputWorker, IResourceCreator} from 'vs/workbench/parts/output/common/outputWorker';
import {ILink} from 'vs/editor/common/modes';
import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');

export interface ICreateData {
	workspaceResourceUri: string;
}

export class OutputLinkComputer {

	private _ctx:IWorkerContext;
	private _patterns: RegExp[];
	private _workspaceResource: URI;

	constructor(ctx:IWorkerContext, createData:ICreateData) {
		this._ctx = ctx;
		this._workspaceResource = URI.parse(createData.workspaceResourceUri);
		this._patterns = OutputWorker.createPatterns(this._workspaceResource);
	}

	private _getModel(uri:string): IMirrorModel {
		let models = this._ctx.getMirrorModels();
		for (let i = 0; i < models.length; i++) {
			let model = models[i];
			if (model.uri.toString() === uri) {
				return model;
			}
		}
		return null;
	}

	public computeLinks(uri:string): TPromise<ILink[]> {
		let model = this._getModel(uri);
		if (!model) {
			return;
		}

		let links: ILink[] = [];

		let resourceCreator: IResourceCreator = {
			toResource: (workspaceRelativePath: string): URI => {
				if (typeof workspaceRelativePath === 'string') {
					return URI.file(paths.join(this._workspaceResource.fsPath, workspaceRelativePath));
				}
				return null;
			}
		};

		let lines = model.getValue().split(/\r\n|\r|\n/);
		for (let i = 0, len = lines.length; i < len; i++) {
			links.push(...OutputWorker.detectLinks(lines[i], i + 1, this._patterns, resourceCreator));
		}

		return TPromise.as(links);
	}
}

export function create(ctx:IWorkerContext, createData:ICreateData): OutputLinkComputer {
	return new OutputLinkComputer(ctx, createData);
}
