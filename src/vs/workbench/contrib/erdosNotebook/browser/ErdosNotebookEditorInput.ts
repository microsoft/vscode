/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, GroupIdentifier, IRevertOptions, ISaveOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IResolvedNotebookEditorModel } from '../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosNotebookInstance } from './ErdosNotebookInstance.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ExtUri, joinPath } from '../../../../base/common/resources.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { Schemas } from '../../../../base/common/network.js';

export interface ErdosNotebookEditorInputOptions {
	startDirty?: boolean;
}

/**
 * ErdosNotebookEditorInput class for managing notebook editor inputs.
 */
export class ErdosNotebookEditorInput extends EditorInput {

	static count = 0;
	readonly uniqueId: string = `erdos-notebook-${ErdosNotebookEditorInput.count++}`;
	private _identifier = `Erdos Notebook | Input(${this.uniqueId}) |`;

	static readonly ID: string = 'workbench.input.erdosNotebook';
	static readonly EditorID: string = 'workbench.editor.erdosNotebook';

	editorOptions: IEditorOptions | undefined = undefined;

	static getOrCreate(
		instantiationService: IInstantiationService, 
		resource: URI, 
		preferredResource: URI | undefined, 
		viewType: string, 
		options: ErdosNotebookEditorInputOptions = {}
	) {
		return instantiationService.createInstance(ErdosNotebookEditorInput, resource, viewType, options);
	}

	private _editorModelReference: IReference<IResolvedNotebookEditorModel> | null = null;
	notebookInstance: ErdosNotebookInstance | undefined;

	constructor(
		readonly resource: URI,
		public readonly viewType: string,
		public readonly options: ErdosNotebookEditorInputOptions = {},
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IRuntimeSessionService private readonly _runtimeSessionService: any,
	) {
		super();
		this._logService.info(this._identifier, 'constructor');
		this.notebookInstance = ErdosNotebookInstance.getOrCreate(this, undefined, instantiationService);
	}

	override dispose(): void {
		this.notebookInstance?.dispose();
		super.dispose();
	}

	override get typeId(): string {
		return ErdosNotebookEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.None;

		if (this.resource.scheme === Schemas.untitled) {
			capabilities |= EditorInputCapabilities.Untitled;
		}

		if (this._editorModelReference?.object.isReadonly()) {
			capabilities |= EditorInputCapabilities.Readonly;
		}

		return capabilities;
	}

	override async revert(_group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		if (this._editorModelReference && this._editorModelReference.object.isDirty()) {
			await this._editorModelReference.object.revert(options);
		}
	}

	override get editorId(): string {
		return ErdosNotebookEditorInput.EditorID;
	}

	override getName(): string {
		const extUri = new ExtUri(() => false);
		return extUri.basename(this.resource) ?? localize('erdosNotebookInputName', "Erdos Notebook");
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof ErdosNotebookEditorInput &&
			otherInput.resource.toString() === this.resource.toString();
	}

	override isDirty(): boolean {
		return this._editorModelReference?.object.isDirty() ?? this.options.startDirty ?? false;
	}

	override async save(_group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		if (this._editorModelReference) {
			if (this.hasCapability(EditorInputCapabilities.Untitled)) {
				return this.saveAs(_group, options);
			} else {
				await this._editorModelReference.object.save(options);
			}
			return this;
		}
		return undefined;
	}

	override async saveAs(_group: GroupIdentifier, options?: ISaveOptions): Promise<IUntypedEditorInput | undefined> {
		if (!this._editorModelReference) {
			return undefined;
		}

		const provider = this._notebookService.getContributedNotebookType(this.viewType);
		if (!provider) {
			return undefined;
		}

		const extUri = new ExtUri(() => false);
		const suggestedName = extUri.basename(this.resource);
		const pathCandidate = await this._suggestName(provider, suggestedName);

		const target = await this._fileDialogService.pickFileToSave(pathCandidate, options?.availableFileSystems);
		if (!target) {
			return undefined;
		}

		try {
			this._logService.debug(`Reassigning notebook session URI: ${this.resource.toString()} → ${target.toString()}`);
			const sessionId = this._runtimeSessionService.updateNotebookSessionUri(this.resource, target);
			if (sessionId) {
				this._logService.debug(`Successfully reassigned session ${sessionId} to URI: ${target.toString()}`);
			}
		} catch (error) {
			this._logService.error('Failed to reassign notebook session URI', error);
		}

		const result = await this._editorModelReference.object.saveAs(target);
		if (result) {
			await this._editorModelReference.object.revert();
			ErdosNotebookInstance.updateInstanceUri(this.resource, target);
		}
		return result;
	}

	private async _suggestName(provider: any, suggestedFilename: string): Promise<URI> {
		const firstSelector = provider.selectors?.[0];
		let selectorStr = firstSelector && typeof firstSelector === 'string' ? firstSelector : undefined;

		if (!selectorStr && firstSelector) {
			const include = (firstSelector as { include?: string }).include;
			if (typeof include === 'string') {
				selectorStr = include;
			}
		}

		if (selectorStr) {
			const matches = /^\*\.([A-Za-z_-]*)$/.exec(selectorStr);
			if (matches && matches.length > 1) {
				const fileExt = matches[1];
				if (!suggestedFilename.endsWith(fileExt)) {
					return joinPath(await this._fileDialogService.defaultFilePath(), suggestedFilename + '.' + fileExt);
				}
			}
		}

		return joinPath(await this._fileDialogService.defaultFilePath(), suggestedFilename);
	}

	override async resolve(_options?: IEditorOptions): Promise<IResolvedNotebookEditorModel | null> {
		this._logService.info(this._identifier, 'resolve');

		if (this.editorOptions) {
			_options = this.editorOptions;
		}

		if (!await this._notebookService.canResolve(this.viewType)) {
			return null;
		}

		if (!this._editorModelReference) {
			const ref = await this._notebookModelResolverService.resolve(this.resource, this.viewType);

			if (this._editorModelReference) {
				ref.dispose();
				return (<IReference<IResolvedNotebookEditorModel>>this._editorModelReference).object;
			}

			this._editorModelReference = ref;

			if (this.isDisposed()) {
				this._editorModelReference.dispose();
				this._editorModelReference = null;
				return null;
			}

			this._register(this._editorModelReference.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
			this._register(this._editorModelReference.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));

			if (this._editorModelReference.object.isDirty()) {
				this._onDidChangeDirty.fire();
			}
		} else {
			this._editorModelReference.object.load();
		}

		return this._editorModelReference.object;
	}
}