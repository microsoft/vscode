/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import * as Map from 'vs/base/common/map';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { EditorInput } from 'vs/workbench/common/editor';
import { IEditorService, IEditorInput, ITextEditorModel } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEventService } from 'vs/platform/event/common/event';
import { Match, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { BulkEdit, IResourceEdit, createBulkEdit } from 'vs/editor/common/services/bulkEdit';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';

class EditorInputCache {

	private cache: Map.SimpleMap<URI, TPromise<DiffEditorInput>>;
	private replaceTextcache: Map.SimpleMap<URI, string>;

	constructor(private replaceService: ReplaceService, private editorService: IWorkbenchEditorService,
					private modelService: IModelService) {
		this.cache= new Map.SimpleMap<URI, TPromise<DiffEditorInput>>();
		this.replaceTextcache= new Map.SimpleMap<URI, string>();
	}

	public getInput(fileMatch: FileMatch, text: string): TPromise<DiffEditorInput> {
		let editorInputPromise= this.cache.get(fileMatch.resource());
		if (!editorInputPromise) {
			editorInputPromise= this.createInput(fileMatch);
			this.cache.set(fileMatch.resource(), editorInputPromise);
			this.refreshInput(fileMatch, text, true);
			fileMatch.onDispose(() => this.disposeInput(fileMatch));
			fileMatch.onChange((modelChange) => this.refreshInput(fileMatch, this.replaceTextcache.get(fileMatch.resource()), modelChange));
		}
		return editorInputPromise;
	}

	public refreshInput(fileMatch: FileMatch, text: string, reloadFromSource: boolean= false): void {
		let editorInputPromise= this.cache.get(fileMatch.resource());
		if (editorInputPromise) {
			editorInputPromise.done(() => {
				if (reloadFromSource) {
					this.editorService.resolveEditorModel({resource: fileMatch.resource()}).then((value: ITextEditorModel) => {
						let replaceResource= this.getReplaceResource(fileMatch.resource());
						this.modelService.getModel(replaceResource).setValue((<IModel> value.textEditorModel).getValue());
						this.replaceService.replace(fileMatch, text, null, replaceResource);
					});
				} else {
					let replaceResource= this.getReplaceResource(fileMatch.resource());
					this.modelService.getModel(replaceResource).undo();
					this.replaceService.replace(fileMatch, text, null, replaceResource);
				}
				this.replaceTextcache.set(fileMatch.resource(), text);
			});
		}
	}

	public disposeInput(fileMatch: FileMatch): void
	public disposeInput(resource: URI): void
	public disposeInput(arg: any): void {
		let resourceUri= arg instanceof URI ? arg : arg instanceof FileMatch ? arg.resource() : null;
		if (resourceUri) {
			let editorInputPromise= this.cache.get(resourceUri);
			if (editorInputPromise) {
				editorInputPromise.done((diffInput) => {
					this.disposeReplaceInput(this.getReplaceResource(resourceUri), diffInput);
					this.cache.delete(resourceUri);
					this.replaceTextcache.delete(resourceUri);
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
			let editorInput= new DiffEditorInput(nls.localize('fileReplaceChanges', "{0} ↔ {1} (Replace Preview)", fileMatch.name(), fileMatch.name()), undefined, <EditorInput>left, <EditorInput>right);
			return editorInput;
		});
	}

	private createLeftInput(element: FileMatch): TPromise<IEditorInput> {
		return this.editorService.createInput({ resource: element.resource() });
	}

	private createRightInput(element: FileMatch): TPromise<IEditorInput> {
		return new TPromise((c, e, p) => {
			this.editorService.resolveEditorModel({resource: element.resource()}).then((value: ITextEditorModel) => {
				let model= <IModel> value.textEditorModel;
				let replaceResource= this.getReplaceResource(element.resource());
				this.modelService.createModel(model.getValue(), model.getMode(), replaceResource);
				c(this.editorService.createInput({ resource: replaceResource }));
			});
		});
	}

	private disposeReplaceInput(replaceUri: URI, diffInput: EditorInput):void {
		diffInput.dispose();
		this.modelService.destroyModel(replaceUri);
	}

	private getReplaceResource(resource: URI): URI {
		return resource.with({scheme: network.Schemas.internal, fragment: 'preview'});
	}
}

export class ReplaceService implements IReplaceService {

	public serviceId= IReplaceService;

	private cache: EditorInputCache;

	constructor(@IEventService private eventService: IEventService, @IEditorService private editorService, @IModelService private modelService: IModelService) {
		this.cache= new EditorInputCache(this, editorService, modelService);
	}

	public replace(match: Match, text: string): TPromise<any>
	public replace(files: FileMatch[], text: string, progress?: IProgressRunner): TPromise<any>
	public replace(match: FileMatchOrMatch, text: string, progress?: IProgressRunner, resource?: URI): TPromise<any>
	public replace(arg: any, text: string, progress: IProgressRunner= null, resource: URI= null): TPromise<any> {

		let bulkEdit: BulkEdit = createBulkEdit(this.eventService, this.editorService, null);
		bulkEdit.progress(progress);

		if (arg instanceof Match) {
			bulkEdit.add([this.createEdit(arg, text, resource)]);
		}

		if (arg instanceof FileMatch) {
			arg= [arg];
		}

		if (arg instanceof Array) {
			arg.forEach(element => {
				let fileMatch = <FileMatch>element;
				if (fileMatch.count() > 0) {
					fileMatch.matches().forEach(match => {
						bulkEdit.add([this.createEdit(match, text, resource)]);
					});
				}
			});
		}

		return bulkEdit.finish();
	}

	public getInput(element: FileMatch, text: string): TPromise<EditorInput> {
		return this.cache.getInput(element, text);
	}

	public refreshInput(element: FileMatch, text: string, reload: boolean= false): void {
		this.cache.refreshInput(element, text, reload);
	}

	public disposeAllInputs(): void {
		this.cache.disposeAll();
	}

	private createEdit(match: Match, text: string, resource: URI= null): IResourceEdit {
		let fileMatch: FileMatch= match.parent();
		let resourceEdit: IResourceEdit= {
			resource: resource !== null ? resource: fileMatch.resource(),
			range: match.range(),
			newText: text
		};
		return resourceEdit;
	}
}