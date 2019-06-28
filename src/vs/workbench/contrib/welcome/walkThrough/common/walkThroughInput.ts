/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { EditorInput, EditorModel, ITextEditorModel } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as marked from 'vs/base/common/marked/marked';
import { Schemas } from 'vs/base/common/network';

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

export interface WalkThroughInputOptions {
	readonly typeId: string;
	readonly name: string;
	readonly description?: string;
	readonly resource: URI;
	readonly telemetryFrom: string;
	readonly onReady?: (container: HTMLElement) => void;
}

export class WalkThroughInput extends EditorInput {

	private promise: Promise<WalkThroughModel> | null = null;

	private maxTopScroll = 0;
	private maxBottomScroll = 0;

	constructor(
		private options: WalkThroughInputOptions,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		super();
	}

	getResource(): URI {
		return this.options.resource;
	}

	getTypeId(): string {
		return this.options.typeId;
	}

	getName(): string {
		return this.options.name;
	}

	getDescription(): string {
		return this.options.description || '';
	}

	getTelemetryFrom(): string {
		return this.options.telemetryFrom;
	}

	getTelemetryDescriptor(): { [key: string]: unknown } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['target'] = this.getTelemetryFrom();
		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"target" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		return descriptor;
	}

	get onReady() {
		return this.options.onReady;
	}

	resolve(): Promise<WalkThroughModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.options.resource)
				.then(ref => {
					if (strings.endsWith(this.getResource().path, '.html')) {
						return new WalkThroughModel(ref, []);
					}

					const snippets: Promise<IReference<ITextEditorModel>>[] = [];
					let i = 0;
					const renderer = new marked.Renderer();
					renderer.code = (code, lang) => {
						const resource = this.options.resource.with({ scheme: Schemas.walkThroughSnippet, fragment: `${i++}.${lang}` });
						snippets.push(this.textModelResolverService.createModelReference(resource));
						return '';
					};

					const markdown = ref.object.textEditorModel.getLinesContent().join('\n');
					marked(markdown, { renderer });

					return Promise.all(snippets)
						.then(refs => new WalkThroughModel(ref, refs));
				});
		}

		return this.promise;
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof WalkThroughInput) {
			let otherResourceEditorInput = <WalkThroughInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.options.resource.toString() === this.options.resource.toString();
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

	public relativeScrollPosition(topScroll: number, bottomScroll: number) {
		this.maxTopScroll = Math.max(this.maxTopScroll, topScroll);
		this.maxBottomScroll = Math.max(this.maxBottomScroll, bottomScroll);
	}
}
