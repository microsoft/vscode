/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry, IPromptFileVariableEntry, toPromptFileVariableEntry } from '../../common/chatVariableEntries.js';

import { ChatPromptAttachmentModel } from './chatPromptAttachmentModel.js';

/**
 * Model for a collection of prompt instruction attachments.
 * See {@linkcode ChatPromptAttachmentModel} for individual attachment.
 */
export class ChatPromptAttachmentsCollection extends Disposable {
	/**
	 * Event that fires then this model is updated.
	 *
	 * See {@linkcode onUpdate}.
	 */
	protected _onUpdate = this._register(new Emitter<IPromptFileVariableEntry>());
	/**
	 * Subscribe to the `onUpdate` event.
	 */
	public onUpdate = this._onUpdate.event;


	/**
	 * List of all prompt instruction attachments.
	 */
	private _attachments: ResourceMap<ChatPromptAttachmentModel> = new ResourceMap<ChatPromptAttachmentModel>();

	/**
	 * Check if any of the attachments is a prompt file.
	 */
	public hasPromptFiles(promptFileLanguageId: string): boolean {
		const hasLanguage = ({ uri }: ChatPromptAttachmentModel) => {
			const model = this.modelService.getModel(uri);
			const languageId = model ? model.getLanguageId() : this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
			return languageId === promptFileLanguageId;
		};

		for (const child of this._attachments.values()) {
			if (hasLanguage(child)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get the list of all prompt instruction attachment variables, including all
	 * nested child references of each attachment explicitly attached by user.
	 */
	public async getAttachments(): Promise<readonly IChatRequestVariableEntry[]> {
		await this.allSettled();

		const result = [];
		const attachments = [...this._attachments.values()];

		for (const attachment of attachments) {
			const { reference } = attachment;

			// the usual URIs list of prompt instructions is `bottom-up`, therefore
			// we do the same here - first add all child references of the model
			result.push(
				...reference.allValidReferences.map((link) => {
					return toPromptFileVariableEntry(link.uri, false);
				}),
			);

			// then add the root reference of the model itself
			result.push(toPromptFileVariableEntry(reference.uri, true));
		}

		return result;
	}

	/**
	 * Promise that resolves when parsing of all attached prompt instruction
	 * files completes, including parsing of all its possible child references.
	 */
	async allSettled(): Promise<void> {
		const attachments = [...this._attachments.values()];

		await Promise.allSettled(
			attachments.map((attachment) => {
				return attachment.allSettled;
			}),
		);
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();
	}

	/**
	 * Add prompt instruction attachment instances
	 */
	public add(entries: IPromptFileVariableEntry[]) {
		for (const entry of entries) {
			const uri = entry.value;

			// if already exists, nothing to do
			if (this._attachments.has(uri)) {
				continue;
			}

			const instruction = this.instantiationService.createInstance(ChatPromptAttachmentModel, uri, () => this._onUpdate.fire(entry));
			this._attachments.set(uri, instruction);
		}
	}

	/**
	 * Remove a prompt instruction attachment instancs
	 */
	public remove(entry: IPromptFileVariableEntry): this {
		const uri = entry.value;

		const attachment = this._attachments.get(uri);
		if (attachment) {
			this._attachments.delete(uri);
			attachment.dispose();
		}

		return this;
	}

	/**
	 * Clear all prompt instruction attachments.
	 */
	public clear(): this {
		for (const attachment of this._attachments.values()) {
			attachment.dispose();
		}
		this._attachments.clear();

		return this;
	}

	public override dispose(): void {
		super.dispose();
		this.clear(); // disposes of all attachments
	}
}
