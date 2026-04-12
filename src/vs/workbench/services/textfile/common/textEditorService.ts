/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorFactoryRegistry, IFileEditorInput, IUntypedEditorInput, IUntypedFileEditorInput, EditorExtensions, isResourceDiffEditorInput, isResourceSideBySideEditorInput, IUntitledTextResourceEditorInput, DEFAULT_EDITOR_ASSOCIATION, isResourceMergeEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { INewUntitledTextEditorOptions, IUntitledTextEditorService } from '../../untitled/common/untitledTextEditorService.js';
import { Schemas } from '../../../../base/common/network.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { UntitledTextEditorInput } from '../../untitled/common/untitledTextEditorInput.js';
import { IUntitledTextEditorModel } from '../../untitled/common/untitledTextEditorModel.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../editor/common/editorResolverService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';

export const ITextEditorService = createDecorator<ITextEditorService>('textEditorService');

export interface ITextEditorService {

	readonly _serviceBrand: undefined;

	/**
	 * @deprecated this method should not be used, rather consider using
	 * `IEditorResolverService` instead with `DEFAULT_EDITOR_ASSOCIATION.id`.
	 */
	createTextEditor(input: IUntypedEditorInput): EditorInput;

	/**
	 * @deprecated this method should not be used, rather consider using
	 * `IEditorResolverService` instead with `DEFAULT_EDITOR_ASSOCIATION.id`.
	 */
	createTextEditor(input: IUntypedFileEditorInput): IFileEditorInput;

	/**
	 * A way to create text editor inputs from an untyped editor input. Depending
	 * on the passed in input this will be:
	 * - a `IFileEditorInput` for file resources
	 * - a `UntitledEditorInput` for untitled resources
	 * - a `TextResourceEditorInput` for virtual resources
	 *
	 * @param input the untyped editor input to create a typed input from
	 */
	resolveTextEditor(input: IUntypedEditorInput): Promise<EditorInput>;
	resolveTextEditor(input: IUntypedFileEditorInput): Promise<IFileEditorInput>;
}

class FileEditorInputLeakError extends Error {

	constructor(message: string, stack: string) {
		super(message);

		this.name = 'FileEditorInputLeakError';
		this.stack = stack;
	}
}

export class TextEditorService extends Disposable implements ITextEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly editorInputCache = new ResourceMap<TextResourceEditorInput | IFileEditorInput | UntitledTextEditorInput>();

	private readonly fileEditorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getFileEditorFactory();

	constructor(
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService
	) {
		super();

		// Register the default editor to the editor resolver
		// service so that it shows up in the editors picker
		this.registerDefaultEditor();
	}

	private registerDefaultEditor(): void {
		this._register(this.editorResolverService.registerEditor(
			'*',
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createEditorInput: editor => ({ editor: this.createTextEditor(editor) }),
				createUntitledEditorInput: untitledEditor => ({ editor: this.createTextEditor(untitledEditor) }),
				createDiffEditorInput: diffEditor => ({ editor: this.createTextEditor(diffEditor) })
			}
		));
	}

	resolveTextEditor(input: IUntypedEditorInput): Promise<EditorInput>;
	resolveTextEditor(input: IUntypedFileEditorInput): Promise<IFileEditorInput>;
	async resolveTextEditor(input: IUntypedEditorInput | IUntypedFileEditorInput): Promise<EditorInput | IFileEditorInput> {
		return this.createTextEditor(input);
	}

	createTextEditor(input: IUntypedEditorInput): EditorInput;
	createTextEditor(input: IUntypedFileEditorInput): IFileEditorInput;
	createTextEditor(input: IUntypedEditorInput | IUntypedFileEditorInput): EditorInput | IFileEditorInput {

		// Merge Editor Not Supported (we fallback to showing the result only)
		if (isResourceMergeEditorInput(input)) {
			return this.createTextEditor(input.result);
		}

		// Diff Editor Support
		if (isResourceDiffEditorInput(input)) {
			const original = this.createTextEditor(input.original);
			const modified = this.createTextEditor(input.modified);

			return this.instantiationService.createInstance(DiffEditorInput, input.label, input.description, original, modified, undefined);
		}

		// Side by Side Editor Support
		if (isResourceSideBySideEditorInput(input)) {
			const primary = this.createTextEditor(input.primary);
			const secondary = this.createTextEditor(input.secondary);

			return this.instantiationService.createInstance(SideBySideEditorInput, input.label, input.description, secondary, primary);
		}

		// Untitled text file support
		const untitledInput = input as IUntitledTextResourceEditorInput;
		if (untitledInput.forceUntitled || !untitledInput.resource || (untitledInput.resource.scheme === Schemas.untitled)) {
			const untitledOptions: Partial<INewUntitledTextEditorOptions> = {
				languageId: untitledInput.languageId,
				initialValue: untitledInput.contents,
				encoding: untitledInput.encoding
			};

			// Untitled resource: use as hint for an existing untitled editor
			let untitledModel: IUntitledTextEditorModel;
			if (untitledInput.resource?.scheme === Schemas.untitled) {
				untitledModel = this.untitledTextEditorService.create({ untitledResource: untitledInput.resource, ...untitledOptions });
			}

			// Other resource: use as hint for associated filepath
			else {
				untitledModel = this.untitledTextEditorService.create({ associatedResource: untitledInput.resource, ...untitledOptions });
			}

			return this.createOrGetCached(untitledModel.resource, () => this.instantiationService.createInstance(UntitledTextEditorInput, untitledModel));
		}

		// Text File/Resource Editor Support
		const textResourceEditorInput = input as IUntypedFileEditorInput;
		if (textResourceEditorInput.resource instanceof URI) {

			// Derive the label from the path if not provided explicitly
			const label = textResourceEditorInput.label || basename(textResourceEditorInput.resource);

			// We keep track of the preferred resource this input is to be created
			// with but it may be different from the canonical resource (see below)
			const preferredResource = textResourceEditorInput.resource;

			// From this moment on, only operate on the canonical resource
			// to ensure we reduce the chance of opening the same resource
			// with different resource forms (e.g. path casing on Windows)
			const canonicalResource = this.uriIdentityService.asCanonicalUri(preferredResource);

			return this.createOrGetCached(canonicalResource, () => {

				// File
				if (textResourceEditorInput.forceFile || this.fileService.hasProvider(canonicalResource)) {
					return this.fileEditorFactory.createFileEditor(canonicalResource, preferredResource, textResourceEditorInput.label, textResourceEditorInput.description, textResourceEditorInput.encoding, textResourceEditorInput.languageId, textResourceEditorInput.contents, this.instantiationService);
				}

				// Resource
				return this.instantiationService.createInstance(TextResourceEditorInput, canonicalResource, textResourceEditorInput.label, textResourceEditorInput.description, textResourceEditorInput.languageId, textResourceEditorInput.contents);
			}, cachedInput => {

				// Untitled
				if (cachedInput instanceof UntitledTextEditorInput) {
					return;
				}

				// Files
				else if (!(cachedInput instanceof TextResourceEditorInput)) {
					cachedInput.setPreferredResource(preferredResource);

					if (textResourceEditorInput.label) {
						cachedInput.setPreferredName(textResourceEditorInput.label);
					}

					if (textResourceEditorInput.description) {
						cachedInput.setPreferredDescription(textResourceEditorInput.description);
					}

					if (textResourceEditorInput.encoding) {
						cachedInput.setPreferredEncoding(textResourceEditorInput.encoding);
					}

					if (textResourceEditorInput.languageId) {
						cachedInput.setPreferredLanguageId(textResourceEditorInput.languageId);
					}

					if (typeof textResourceEditorInput.contents === 'string') {
						cachedInput.setPreferredContents(textResourceEditorInput.contents);
					}
				}

				// Resources
				else {
					if (label) {
						cachedInput.setName(label);
					}

					if (textResourceEditorInput.description) {
						cachedInput.setDescription(textResourceEditorInput.description);
					}

					if (textResourceEditorInput.languageId) {
						cachedInput.setPreferredLanguageId(textResourceEditorInput.languageId);
					}

					if (typeof textResourceEditorInput.contents === 'string') {
						cachedInput.setPreferredContents(textResourceEditorInput.contents);
					}
				}
			});
		}

		throw new Error(`ITextEditorService: Unable to create texteditor from ${JSON.stringify(input)}`);
	}

	private createOrGetCached(
		resource: URI,
		factoryFn: () => TextResourceEditorInput | IFileEditorInput | UntitledTextEditorInput,
		cachedFn?: (input: TextResourceEditorInput | IFileEditorInput | UntitledTextEditorInput) => void
	): TextResourceEditorInput | IFileEditorInput | UntitledTextEditorInput {

		// Return early if already cached
		let input = this.editorInputCache.get(resource);
		if (input) {
			cachedFn?.(input);

			return input;
		}

		// Otherwise create and add to cache
		input = factoryFn();
		this.editorInputCache.set(resource, input);

		// Track Leaks
		const leakId = this.trackLeaks(input);

		Event.once(input.onWillDispose)(() => {

			// Remove from cache
			this.editorInputCache.delete(resource);

			// Untrack Leaks
			if (leakId) {
				this.untrackLeaks(leakId);
			}
		});

		return input;
	}

	//#region Leak Monitoring

	private static readonly LEAK_TRACKING_THRESHOLD = 256;
	private static readonly LEAK_REPORTING_THRESHOLD = 2 * this.LEAK_TRACKING_THRESHOLD;
	private static LEAK_REPORTED = false;

	private readonly mapLeakToCounter = new Map<string, number>();

	private trackLeaks(input: TextResourceEditorInput | IFileEditorInput | UntitledTextEditorInput): string | undefined {
		if (TextEditorService.LEAK_REPORTED || this.editorInputCache.size < TextEditorService.LEAK_TRACKING_THRESHOLD) {
			return undefined;
		}

		const leakId = `${input.resource.scheme}#${input.typeId || '<no typeId>'}#${input.editorId || '<no editorId>'}\n${new Error().stack?.split('\n').slice(2).join('\n') ?? ''}`;
		const leakCounter = (this.mapLeakToCounter.get(leakId) ?? 0) + 1;
		this.mapLeakToCounter.set(leakId, leakCounter);

		if (this.editorInputCache.size > TextEditorService.LEAK_REPORTING_THRESHOLD) {
			TextEditorService.LEAK_REPORTED = true;

			const [topLeak, topCount] = Array.from(this.mapLeakToCounter.entries()).reduce(
				([topLeak, topCount], [key, val]) => val > topCount ? [key, val] : [topLeak, topCount]
			);

			const message = `Potential text editor input LEAK detected, having ${this.editorInputCache.size} text editor inputs already. Most frequent owner (${topCount})`;
			onUnexpectedError(new FileEditorInputLeakError(message, topLeak));
		}

		return leakId;
	}

	private untrackLeaks(leakId: string): void {
		const stackCounter = (this.mapLeakToCounter.get(leakId) ?? 1) - 1;
		this.mapLeakToCounter.set(leakId, stackCounter);

		if (stackCounter === 0) {
			this.mapLeakToCounter.delete(leakId);
		}
	}

	//#endregion
}

registerSingleton(ITextEditorService, TextEditorService, InstantiationType.Eager /* do not change: https://github.com/microsoft/vscode/issues/137675 */);
