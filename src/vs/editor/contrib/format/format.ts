/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry, FormattingOptions, TextEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { first } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class NoProviderError extends Error {

	static is(thing: any): thing is NoProviderError {
		return thing instanceof Error && thing.name === NoProviderError._name;
	}

	private static readonly _name = 'NOPRO';

	constructor(message?: string) {
		super();
		this.name = NoProviderError._name;
		if (message) {
			this.message = message;
		}
	}
}

export function getDocumentRangeFormattingEdits(
	telemetryService: ITelemetryService,
	workerService: IEditorWorkerService,
	model: ITextModel,
	range: Range,
	options: FormattingOptions,
	token: CancellationToken
): Promise<TextEdit[] | undefined | null> {

	const allProvider = DocumentRangeFormattingEditProviderRegistry.ordered(model);

	/* __GDPR__
		"formatterInfo" : {
			"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"language" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		}
	 */
	telemetryService.publicLog('formatterInfo', {
		type: 'range',
		language: model.getLanguageIdentifier().language,
		count: allProvider.length,
	});

	if (allProvider.length === 0) {
		return Promise.reject(new NoProviderError());
	}

	return first(allProvider.map(provider => () => {
		return Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token)).catch(onUnexpectedExternalError);
	}), isNonEmptyArray).then(edits => {
		// break edits into smaller edits
		return workerService.computeMoreMinimalEdits(model.uri, edits);
	});
}

export function getDocumentFormattingEdits(
	telemetryService: ITelemetryService,
	workerService: IEditorWorkerService,
	model: ITextModel,
	options: FormattingOptions,
	token: CancellationToken
): Promise<TextEdit[] | null | undefined> {

	const providers = DocumentFormattingEditProviderRegistry.ordered(model);

	/* __GDPR__
		"formatterInfo" : {
			"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"language" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		}
	 */
	telemetryService.publicLog('formatterInfo', {
		type: 'document',
		language: model.getLanguageIdentifier().language,
		count: providers.length,
	});

	// try range formatters when no document formatter is registered
	if (providers.length === 0) {
		return getDocumentRangeFormattingEdits(telemetryService, workerService, model, model.getFullModelRange(), options, token);
	}

	return first(providers.map(provider => () => {
		// first with result wins...
		return Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token)).catch(onUnexpectedExternalError);
	}), isNonEmptyArray).then(edits => {
		// break edits into smaller edits
		return workerService.computeMoreMinimalEdits(model.uri, edits);
	});
}

export function getOnTypeFormattingEdits(
	telemetryService: ITelemetryService,
	workerService: IEditorWorkerService,
	model: ITextModel,
	position: Position,
	ch: string,
	options: FormattingOptions
): Promise<TextEdit[] | null | undefined> {

	const providers = OnTypeFormattingEditProviderRegistry.ordered(model);

	/* __GDPR__
		"formatterInfo" : {
			"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"language" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		}
	 */
	telemetryService.publicLog('formatterInfo', {
		type: 'ontype',
		language: model.getLanguageIdentifier().language,
		count: providers.length,
	});

	if (providers.length === 0) {
		return Promise.resolve(undefined);
	}

	if (providers[0].autoFormatTriggerCharacters.indexOf(ch) < 0) {
		return Promise.resolve(undefined);
	}

	return Promise.resolve(providers[0].provideOnTypeFormattingEdits(model, position, ch, options, CancellationToken.None)).catch(onUnexpectedExternalError).then(edits => {
		return workerService.computeMoreMinimalEdits(model.uri, edits);
	});
}

registerLanguageCommand('_executeFormatRangeProvider', function (accessor, args) {
	const { resource, range, options } = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getDocumentRangeFormattingEdits(accessor.get(ITelemetryService), accessor.get(IEditorWorkerService), model, Range.lift(range), options, CancellationToken.None);
});

registerLanguageCommand('_executeFormatDocumentProvider', function (accessor, args) {
	const { resource, options } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return getDocumentFormattingEdits(accessor.get(ITelemetryService), accessor.get(IEditorWorkerService), model, options, CancellationToken.None);
});

registerLanguageCommand('_executeFormatOnTypeProvider', function (accessor, args) {
	const { resource, position, ch, options } = args;
	if (!(resource instanceof URI) || !Position.isIPosition(position) || typeof ch !== 'string') {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return getOnTypeFormattingEdits(accessor.get(ITelemetryService), accessor.get(IEditorWorkerService), model, Position.lift(position), ch, options);
});
