/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Match, FileMatch, FileMatchOrMatch, ISearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { BulkEdit, IResourceEdit, createBulkEdit } from 'vs/editor/common/services/bulkEdit';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';

export class ReplacePreviewContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		this.textModelResolverService.registerTextModelContentProvider(network.Schemas.internal, this);
	}

	public getId(): string {
		return 'replace.preview.contentprovider';
	}

	public provideTextContent(uri: URI): TPromise<IModel> {
		if (uri.fragment === 'preview') {
			return this.instantiationService.createInstance(ReplacePreviewModel).resolve(uri);
		}
		return null;
	}
}

class ReplacePreviewModel extends Disposable {
	constructor(
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IReplaceService private replaceService: IReplaceService,
		@ISearchWorkbenchService private searchWorkbenchService: ISearchWorkbenchService
	) {
		super();
	}

	resolve(replacePreviewUri: URI): TPromise<IModel> {
		const fileResource = replacePreviewUri.with({ scheme: network.Schemas.file, fragment: '' });
		const fileMatch = <FileMatch>this.searchWorkbenchService.searchModel.searchResult.matches().filter(match => match.resource().toString() === fileResource.toString())[0];
		return this.textModelResolverService.createModelReference(fileResource).then(ref => {
			ref = this._register(ref);
			const sourceModel = ref.object.textEditorModel;
			const sourceModelModeId = sourceModel.getLanguageIdentifier().language;
			const replacePreviewModel = this.modelService.createModel(sourceModel.getValue(), this.modeService.getOrCreateMode(sourceModelModeId), replacePreviewUri);
			this._register(fileMatch.onChange(modelChange => this.update(sourceModel, replacePreviewModel, fileMatch, modelChange)));
			this._register(this.searchWorkbenchService.searchModel.onReplaceTermChanged(() => this.update(sourceModel, replacePreviewModel, fileMatch)));
			this._register(fileMatch.onDispose(() => replacePreviewModel.dispose()));
			this._register(replacePreviewModel.onWillDispose(() => this.dispose()));
			this._register(sourceModel.onWillDispose(() => this.dispose()));
			return replacePreviewModel;
		});
	}

	private update(sourceModel: IModel, replacePreviewModel: IModel, fileMatch: FileMatch, override: boolean = false): void {
		if (!sourceModel.isDisposed() && !replacePreviewModel.isDisposed()) {
			this.replaceService.updateReplacePreview(fileMatch, override);
		}
	}
}

export class ReplaceService implements IReplaceService {

	public _serviceBrand: any;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ISearchWorkbenchService private searchWorkbenchService: ISearchWorkbenchService
	) {
	}

	public replace(match: Match): TPromise<any>
	public replace(files: FileMatch[], progress?: IProgressRunner): TPromise<any>
	public replace(match: FileMatchOrMatch, progress?: IProgressRunner, resource?: URI): TPromise<any>
	public replace(arg: any, progress: IProgressRunner = null, resource: URI = null): TPromise<any> {

		let bulkEdit: BulkEdit = createBulkEdit(this.textModelResolverService, null, this.fileService);
		bulkEdit.progress(progress);

		if (arg instanceof Match) {
			let match = <Match>arg;
			bulkEdit.add([this.createEdit(match, match.replaceString, resource)]);
		}

		if (arg instanceof FileMatch) {
			arg = [arg];
		}

		if (arg instanceof Array) {
			arg.forEach(element => {
				let fileMatch = <FileMatch>element;
				if (fileMatch.count() > 0) {
					fileMatch.matches().forEach(match => {
						bulkEdit.add([this.createEdit(match, match.replaceString, resource)]);
					});
				}
			});
		}

		return bulkEdit.finish();
	}

	public openReplacePreview(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		this.telemetryService.publicLog('replace.open.previewEditor');
		const fileMatch = element instanceof Match ? element.parent() : element;

		return this.editorService.openEditor({
			leftResource: fileMatch.resource(),
			rightResource: this.getReplacePreviewUri(fileMatch),
			label: nls.localize('fileReplaceChanges', "{0} ↔ {1} (Replace Preview)", fileMatch.name(), fileMatch.name()),
			options: {
				preserveFocus,
				pinned,
				revealIfVisible: true
			}
		}).then(editor => {
			this.updateReplacePreview(fileMatch).then(() => {
				let editorControl = (<IDiffEditor>editor.getControl());
				if (element instanceof Match) {
					editorControl.revealLineInCenter(element.range().startLineNumber);
				}
			});
		}, errors.onUnexpectedError);
	}

	public updateReplacePreview(fileMatch: FileMatch, override: boolean = false): TPromise<void> {
		const replacePreviewUri = this.getReplacePreviewUri(fileMatch);
		return TPromise.join([this.textModelResolverService.createModelReference(fileMatch.resource()), this.textModelResolverService.createModelReference(replacePreviewUri)])
			.then(([sourceModelRef, replaceModelRef]) => {
				const sourceModel = sourceModelRef.object.textEditorModel;
				const replaceModel = replaceModelRef.object.textEditorModel;
				let returnValue = TPromise.wrap(null);
				// If model is disposed do not update
				if (sourceModel && replaceModel) {
					if (override) {
						replaceModel.setValue(sourceModel.getValue());
					} else {
						replaceModel.undo();
					}
					returnValue = this.replace(fileMatch, null, replacePreviewUri);
				}
				return returnValue.then(() => {
					sourceModelRef.dispose();
					replaceModelRef.dispose();
				});
			});
	}

	private createEdit(match: Match, text: string, resource: URI = null): IResourceEdit {
		let fileMatch: FileMatch = match.parent();
		let resourceEdit: IResourceEdit = {
			resource: resource !== null ? resource : fileMatch.resource(),
			range: match.range(),
			newText: text
		};
		return resourceEdit;
	}

	private getReplacePreviewUri(fileMatch: FileMatch): URI {
		return fileMatch.resource().with({ scheme: network.Schemas.internal, fragment: 'preview' });
	}
}