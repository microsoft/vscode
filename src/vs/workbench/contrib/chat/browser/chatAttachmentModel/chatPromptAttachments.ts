/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IChatRequestVariableEntry, IPromptFileVariableEntry, toPromptFileVariableEntry } from '../../common/chatVariableEntries.js';
import { IPromptParserResult, IPromptsService } from '../../common/promptSyntax/service/promptsService.js';

/**
 * Model for a collection of prompt instruction attachments.
 * Starts
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
	private _attachments = new ResourceMap<CancelablePromise<IPromptParserResult>>();


	constructor(
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();
	}

	/**
	 * Check if any of the attachments is a prompt file.
	 */
	public hasPromptFiles(promptFileLanguageId: string): boolean {
		const hasLanguage = (uri: URI) => {
			const model = this.modelService.getModel(uri);
			const languageId = model ? model.getLanguageId() : this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
			return languageId === promptFileLanguageId;
		};

		for (const uri of this._attachments.keys()) {
			if (hasLanguage(uri)) {
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
		const result = [];
		const attachments = [...this._attachments.values()];

		for (const parseResultPromise of attachments) {
			const parseResult = await parseResultPromise;

			// the usual URIs list of prompt instructions is `bottom-up`, therefore
			// we do the same here - first add all child references of the model
			for (const uri of parseResult.allValidReferences) {
				result.push(toPromptFileVariableEntry(uri, false));
			}

			// then add the root reference of the model itself
			result.push(toPromptFileVariableEntry(parseResult.uri, true));
		}

		return result;
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

			const parseResult = createCancelablePromise(token => this.promptsService.parse(uri, token));
			parseResult.then(() => {
				this._onUpdate.fire(entry);
			}).catch((error) => {
				// if parsing fails, we still create an attachment model
				// to allow the user to see the error and fix it
				console.error(`Failed to parse prompt file ${uri.toString()}:`, error);
			});
			this._attachments.set(uri, parseResult);
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
			attachment.cancel();
		}

		return this;
	}

	/**
	 * Clear all prompt instruction attachments.
	 */
	public clear(): this {
		for (const attachment of this._attachments.values()) {
			attachment.cancel();
		}
		this._attachments.clear();

		return this;
	}

	public override dispose(): void {
		super.dispose();
		this.clear(); // disposes of all attachments
	}
}
