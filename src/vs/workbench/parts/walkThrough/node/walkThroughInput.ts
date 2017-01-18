/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, EditorModel, ITextEditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { IFileService } from 'vs/platform/files/common/files';
import * as uuid from 'vs/base/common/uuid';
import * as path from 'path';
import { tmpdir } from 'os';
import { mkdirp } from 'vs/base/node/extfs';
import { marked } from 'vs/base/common/marked/marked';

export class WalkThroughModel extends EditorModel {

	constructor(
		private mainRef: IReference<ITextEditorModel>,
		private snippetRefs: IReference<ITextEditorModel>[]
	) {
		super();
	}

	get main() {
		return this.mainRef.object;
	}

	get snippets() {
		return this.snippetRefs.map(snippet => snippet.object);
	}

	dispose() {
		this.snippetRefs.forEach(ref => ref.dispose());
		this.mainRef.dispose();
		super.dispose();
	}
}

export class WalkThroughInput extends EditorInput {

	static ID: string = 'workbench.editors.walkThroughInput';

	private promise: TPromise<WalkThroughModel>;
	private resource: URI;

	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		public readonly onReady: (container: HTMLElement) => void,
		@IFileService private fileService: IFileService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return WalkThroughInput.ID;
	}

	getName(): string {
		return this.name;
	}

	getDescription(): string {
		return this.description;
	}

	getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.resource);
		return descriptor;
	}

	resolve(refresh?: boolean): TPromise<WalkThroughModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.resource)
				.then(ref => {
					if (strings.endsWith(this.getResource().path, '.html')) {
						return new WalkThroughModel(ref, []);
					}

					const folderName = path.join(tmpdir(), 'vscode-walk-through', uuid.generateUuid());
					const folder = new TPromise<string>((c, e) => mkdirp(folderName, null, err => err ? e(err) : c(folderName)));

					const snippets: TPromise<IReference<ITextEditorModel>>[] = [];
					const renderer = new marked.Renderer();
					renderer.code = (code, lang) => {
						const id = `code-${uuid.generateUuid()}`;
						const resource = URI.file(path.join(folderName, `${id}.${lang}`));
						// E.g., the TypeScript service needs files on disk.
						snippets.push(folder.then(() => this.fileService.createFile(resource, code))
							.then(() => this.textModelResolverService.createModelReference(resource)));
						return '';
					};

					const markdown = ref.object.textEditorModel.getLinesContent().join('\n');
					marked(markdown, { renderer });

					return TPromise.join(snippets)
						.then(refs => new WalkThroughModel(ref, refs));
				});
		}

		return this.promise;

		// TODO: replicate above?
		// return this.promise.then(ref => {
		// 	const model = ref.object;

		// 	if (!(model instanceof ResourceEditorModel)) {
		// 		ref.dispose();
		// 		this.promise = null;
		// 		return TPromise.wrapError(`Unexpected model for ResourceInput: ${this.resource}`); // TODO@Ben eventually also files should be supported, but we guard due to the dangerous dispose of the model in dispose()
		// 	}

		// 	// TODO@Joao this should never happen
		// 	model.onDispose(() => this.dispose());

		// 	return model;
		// });
	}

	matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof WalkThroughInput) {
			let otherResourceEditorInput = <WalkThroughInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		if (this.promise) {
			this.promise.then(model => model.dispose());
			this.promise = null;
		}

		super.dispose();
	}
}
