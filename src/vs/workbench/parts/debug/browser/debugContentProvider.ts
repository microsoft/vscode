/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { guessMimeTypes, MIME_TEXT } from 'vs/base/common/mime';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { DEBUG_SCHEME, IDebugService, IProcess } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

/**
 * Debug URI format
 *
 * a debug URI represents a Source object and the debug session where the Source comes from.
 *
 *       debug:arbitrary_path?session=123e4567-e89b-12d3-a456-426655440000&ref=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   source.path                    session id            source.referencequery
 *
 * the arbitrary_path and the session id are encoded with 'encodeURIComponent'
 *
 */
export class DebugContentProvider implements IWorkbenchContribution, ITextModelContentProvider {

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IDebugService private debugService: IDebugService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		textModelResolverService.registerTextModelContentProvider(DEBUG_SCHEME, this);
	}

	public provideTextContent(resource: uri): TPromise<IModel> {

		let process: IProcess;
		let sourceRef: number;

		if (resource.query) {
			const data = Source.getEncodedDebugData(resource);
			process = this.debugService.getModel().getProcesses().filter(p => p.getId() === data.processId).pop();
			sourceRef = data.sourceReference;
		}

		if (!process) {
			// fallback: use focused process
			process = this.debugService.getViewModel().focusedProcess;
		}

		if (!process) {
			return TPromise.wrapError<IModel>(new Error(localize('unable', "Unable to resolve the resource without a debug session")));
		}
		const source = process.sources.get(resource.toString());
		let rawSource: DebugProtocol.Source;
		if (source) {
			rawSource = source.raw;
			if (!sourceRef) {
				sourceRef = source.reference;
			}
		} else {
			// create a Source
			rawSource = {
				path: resource.with({ scheme: '', query: '' }).toString(true),	// Remove debug: scheme
				sourceReference: sourceRef
			};
		}

		return process.session.source({ sourceReference: sourceRef, source: rawSource }).then(response => {

			const mime = response.body.mimeType || guessMimeTypes(resource.path)[0];
			const modePromise = this.modeService.getOrCreateMode(mime);
			const model = this.modelService.createModel(response.body.content, modePromise, resource);

			return model;
		}, (err: DebugProtocol.ErrorResponse) => {

			this.debugService.sourceIsNotAvailable(resource);
			const modePromise = this.modeService.getOrCreateMode(MIME_TEXT);
			const model = this.modelService.createModel(err.message, modePromise, resource);

			return model;
		});
	}
}
