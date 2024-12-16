/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { getMimeTypes } from '../../../../editor/common/services/languagesAssociations.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { DEBUG_SCHEME, IDebugService, IDebugSession } from './debug.js';
import { Source } from './debugSource.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';

/**
 * Debug URI format
 *
 * a debug URI represents a Source object and the debug session where the Source comes from.
 *
 *       debug:arbitrary_path?session=123e4567-e89b-12d3-a456-426655440000&ref=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   source.path                    session id            source.reference
 *
 * the arbitrary_path and the session id are encoded with 'encodeURIComponent'
 *
 */
export class DebugContentProvider implements IWorkbenchContribution, ITextModelContentProvider {

	private static INSTANCE: DebugContentProvider;

	private readonly pendingUpdates = new Map<string, CancellationTokenSource>();

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IDebugService private readonly debugService: IDebugService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService
	) {
		textModelResolverService.registerTextModelContentProvider(DEBUG_SCHEME, this);
		DebugContentProvider.INSTANCE = this;
	}

	dispose(): void {
		this.pendingUpdates.forEach(cancellationSource => cancellationSource.dispose());
	}

	provideTextContent(resource: uri): Promise<ITextModel> | null {
		return this.createOrUpdateContentModel(resource, true);
	}

	/**
	 * Reload the model content of the given resource.
	 * If there is no model for the given resource, this method does nothing.
	 */
	static refreshDebugContent(resource: uri): void {
		DebugContentProvider.INSTANCE?.createOrUpdateContentModel(resource, false);
	}

	/**
	 * Create or reload the model content of the given resource.
	 */
	private createOrUpdateContentModel(resource: uri, createIfNotExists: boolean): Promise<ITextModel> | null {

		const model = this.modelService.getModel(resource);
		if (!model && !createIfNotExists) {
			// nothing to do
			return null;
		}

		let session: IDebugSession | undefined;

		if (resource.query) {
			const data = Source.getEncodedDebugData(resource);
			session = this.debugService.getModel().getSession(data.sessionId);
		}

		if (!session) {
			// fallback: use focused session
			session = this.debugService.getViewModel().focusedSession;
		}

		if (!session) {
			return Promise.reject(new ErrorNoTelemetry(localize('unable', "Unable to resolve the resource without a debug session")));
		}
		const createErrModel = (errMsg?: string) => {
			this.debugService.sourceIsNotAvailable(resource);
			const languageSelection = this.languageService.createById(PLAINTEXT_LANGUAGE_ID);
			const message = errMsg
				? localize('canNotResolveSourceWithError', "Could not load source '{0}': {1}.", resource.path, errMsg)
				: localize('canNotResolveSource', "Could not load source '{0}'.", resource.path);
			return this.modelService.createModel(message, languageSelection, resource);
		};

		return session.loadSource(resource).then(response => {

			if (response && response.body) {

				if (model) {

					const newContent = response.body.content;

					// cancel and dispose an existing update
					const cancellationSource = this.pendingUpdates.get(model.id);
					cancellationSource?.cancel();

					// create and keep update token
					const myToken = new CancellationTokenSource();
					this.pendingUpdates.set(model.id, myToken);

					// update text model
					return this.editorWorkerService.computeMoreMinimalEdits(model.uri, [{ text: newContent, range: model.getFullModelRange() }]).then(edits => {

						// remove token
						this.pendingUpdates.delete(model.id);

						if (!myToken.token.isCancellationRequested && edits && edits.length > 0) {
							// use the evil-edit as these models show in readonly-editor only
							model.applyEdits(edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
						}
						return model;
					});
				} else {
					// create text model
					const mime = response.body.mimeType || getMimeTypes(resource)[0];
					const languageSelection = this.languageService.createByMimeType(mime);
					return this.modelService.createModel(response.body.content, languageSelection, resource);
				}
			}

			return createErrModel();

		}, (err: DebugProtocol.ErrorResponse) => createErrModel(err.message));
	}
}
