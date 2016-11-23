/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import * as Map from 'vs/base/common/map';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { EditorInput } from 'vs/workbench/common/editor';
import { IEditorService, IEditorInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEventService } from 'vs/platform/event/common/event';
import { Match, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { BulkEdit, IResourceEdit, createBulkEdit } from 'vs/editor/common/services/bulkEdit';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

class EditorInputCache {

	private cache: Map.LinkedMap<URI, TPromise<DiffEditorInput>>;

	constructor(
		private replaceService: ReplaceService,
		private editorService: IWorkbenchEditorService,
		private modelService: IModelService,
		private textModelResolverService: ITextModelResolverService
	) {
		this.cache = new Map.LinkedMap<URI, TPromise<DiffEditorInput>>();
	}

	public hasInput(fileMatch: FileMatch): boolean {
		return this.cache.has(fileMatch.resource());
	}

	public getInput(fileMatch: FileMatch): TPromise<DiffEditorInput> {
		let editorInputPromise = this.cache.get(fileMatch.resource());
		if (!editorInputPromise) {
			editorInputPromise = this.createInput(fileMatch);
			this.cache.set(fileMatch.resource(), editorInputPromise);
			this.refreshInput(fileMatch, true);
			fileMatch.onDispose(() => this.disposeInput(fileMatch));
			fileMatch.onChange((modelChange) => this.refreshInput(fileMatch, modelChange));
		}
		return editorInputPromise;
	}

	public refreshInput(fileMatch: FileMatch, reloadFromSource: boolean = false): void {
		let editorInputPromise = this.cache.get(fileMatch.resource());
		if (editorInputPromise) {
			editorInputPromise.done(() => {
				if (reloadFromSource) {
					this.textModelResolverService.createModelReference(fileMatch.resource()).done(ref => {
						const model = ref.object;
						if (model.textEditorModel) {
							let replaceResource = this.getReplaceResource(fileMatch.resource());
							this.modelService.getModel(replaceResource).setValue(model.textEditorModel.getValue());
							this.replaceService.replace(fileMatch, null, replaceResource);
							ref.dispose();
						}
					});
				} else {
					let replaceResource = this.getReplaceResource(fileMatch.resource());
					this.modelService.getModel(replaceResource).undo();
					this.replaceService.replace(fileMatch, null, replaceResource);
				}
			});
		}
	}

	public disposeInput(fileMatch: FileMatch): void
	public disposeInput(resource: URI): void
	public disposeInput(arg: any): void {
		let resourceUri = arg instanceof URI ? arg : arg instanceof FileMatch ? arg.resource() : null;
		if (resourceUri) {
			let editorInputPromise = this.cache.get(resourceUri);
			if (editorInputPromise) {
				editorInputPromise.done((diffInput) => {
					this.cleanInput(resourceUri);
					diffInput.dispose();
				});
			}
		}
	}

	public disposeAll(): void {
		this.cache.keys().forEach(resource => this.disposeInput(resource));
	}

	private createInput(fileMatch: FileMatch): TPromise<DiffEditorInput> {
		return TPromise.join([this.createLeftInput(fileMatch),
		this.createRightInput(fileMatch)]).then(inputs => {
			const [left, right] = inputs;
			let editorInput = new DiffEditorInput(nls.localize('fileReplaceChanges', "{0} ↔ {1} (Replace Preview)", fileMatch.name(), fileMatch.name()), undefined, <EditorInput>left, <EditorInput>right);
			editorInput.onDispose(() => this.cleanInput(fileMatch.resource()));
			return editorInput;
		});
	}

	private createLeftInput(element: FileMatch): TPromise<IEditorInput> {
		return this.editorService.createInput({ resource: element.resource() });
	}

	private createRightInput(element: FileMatch): TPromise<IEditorInput> {
		return this.textModelResolverService.createModelReference(element.resource()).then(ref => {
			const model = ref.object;
			let textEditorModel = model.textEditorModel;
			let replaceResource = this.getReplaceResource(element.resource());
			this.modelService.createModel(textEditorModel.getValue(), textEditorModel.getMode(), replaceResource);
			ref.dispose();

			return this.editorService.createInput({ resource: replaceResource });
		});
	}

	private cleanInput(resourceUri: URI): void {
		this.modelService.destroyModel(this.getReplaceResource(resourceUri));
		this.cache.delete(resourceUri);
	}

	private getReplaceResource(resource: URI): URI {
		return resource.with({ scheme: network.Schemas.internal, fragment: 'preview' });
	}
}

export class ReplaceService implements IReplaceService {

	public _serviceBrand: any;

	private cache: EditorInputCache;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEventService private eventService: IEventService,
		@IEditorService private editorService: IWorkbenchEditorService,
		@IModelService private modelService: IModelService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		this.cache = new EditorInputCache(this, editorService, modelService, textModelResolverService);
	}

	public replace(match: Match): TPromise<any>
	public replace(files: FileMatch[], progress?: IProgressRunner): TPromise<any>
	public replace(match: FileMatchOrMatch, progress?: IProgressRunner, resource?: URI): TPromise<any>
	public replace(arg: any, progress: IProgressRunner = null, resource: URI = null): TPromise<any> {

		let bulkEdit: BulkEdit = createBulkEdit(this.eventService, this.textModelResolverService, null);
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

	public getInput(element: FileMatch): TPromise<EditorInput> {
		return this.cache.getInput(element);
	}

	public refreshInput(element: FileMatch, reload: boolean = false): void {
		this.cache.refreshInput(element, reload);
	}

	public disposeAllInputs(): void {
		this.cache.disposeAll();
	}

	public openReplacePreviewEditor(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		this.telemetryService.publicLog('replace.open.previewEditor');
		return this.getInput(element instanceof Match ? element.parent() : element).then((editorInput) => {
			this.editorService.openEditor(editorInput, { preserveFocus, pinned, revealIfVisible: true }).then((editor) => {
				let editorControl = (<IDiffEditor>editor.getControl());
				if (element instanceof Match) {
					editorControl.revealLineInCenter(element.range().startLineNumber);
				}
			}, errors.onUnexpectedError);
		}, errors.onUnexpectedError);
	}

	public isReplacePreviewEditorOpened(element: FileMatchOrMatch): boolean {
		return this.cache.hasInput(element instanceof Match ? element.parent() : element);
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
}