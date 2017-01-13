/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lifecycle from 'vs/base/common/lifecycle';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { guessMimeTypes, MIME_TEXT } from 'vs/base/common/mime';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { DEBUG_SCHEME, IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

export class DebugContentProvider implements IWorkbenchContribution, ITextModelContentProvider {

	private modelsToDispose: IModel[];

	constructor(
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IDebugService private debugService: IDebugService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		textModelResolverService.registerTextModelContentProvider(DEBUG_SCHEME, this);
		this.modelsToDispose = [];
		this.debugService.onDidChangeState(() => {
			if (this.debugService.state === State.Inactive) {
				this.modelsToDispose = lifecycle.dispose(this.modelsToDispose);
			}
		});
	}

	public getId(): string {
		return 'debug.contentprovider';
	}

	public provideTextContent(resource: uri): TPromise<IModel> {
		const process = this.debugService.getViewModel().focusedProcess;
		if (!process) {
			return TPromise.as(null);
		}

		return process.session.source({ sourceReference: Source.getSourceReference(resource) }).then(response => {
			const mime = response.body.mimeType || guessMimeTypes(resource.toString())[0];
			const modePromise = this.modeService.getOrCreateMode(mime);
			const model = this.modelService.createModel(response.body.content, modePromise, resource);
			this.modelsToDispose.push(model);

			return model;
		}, (err: DebugProtocol.ErrorResponse) => {
			this.debugService.deemphasizeSource(resource);
			const modePromise = this.modeService.getOrCreateMode(MIME_TEXT);
			const model = this.modelService.createModel(err.message, modePromise, resource);

			return model;
		});
	}
}
