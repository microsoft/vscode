/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { Schemas } from '../../../../../base/common/network.js';

export class LspTerminalModelContentProvider extends Disposable implements ITextModelContentProvider {
	static readonly scheme = Schemas.vscodeTerminal;
	private readonly _virtualDocuments = new Map<string, string>();

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(LspTerminalModelContentProvider.scheme, this));
	}

	/**
	 * Sets or updates content for a terminal virtual document.
	 */
	setContent(resource: URI, content: string): void {
		const key = resource.toString();
		this._virtualDocuments.set(key, content);

		// If model exists, update its content
		const model = this._modelService.getModel(resource);
		if (model) {
			model.setValue(content);
		}
	}

	/**
	 * Gets the current content of a virtual document.
	 */
	getContent(resource: URI): string {
		const key = resource.toString();
		return this._virtualDocuments.get(key) || '';
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		// Get content for this URI, or empty string if not set
		const content = this.getContent(resource);

		// Extract language from file extension
		const extension = resource.path.split('.').pop();

		// Determine language ID based on extension
		let languageId: string | undefined = undefined;
		if (extension) {
			// let languageId = extension ? this._languageService.getLanguageIdByLanguageName(extension) : undefined;
			// // let languageIdTry = this._languageService.getLanguageIdByLanguageName('python');
			// // console.log(languageIdTry);
			languageId = 'python'; // Can't remember if this is ms-python or python.

			// Fallback to common extensions
			if (!languageId) {
				switch (extension) {
					case 'py': languageId = 'python'; break;
					case 'ps1': languageId = 'powershell'; break;

					// Add more mappings as needed??
					// case 'js': languageId = 'javascript'; break;
					// case 'ts': languageId = 'typescript'; break;
					// case 'sh': languageId = 'shellscript'; break;
					// case 'nu' blah blah..
				}
			}
		}

		const languageSelection = languageId ?
			this._languageService.createById(languageId) :
			this._languageService.createById('plaintext');

		return this._modelService.createModel(content, languageSelection, resource, false);
	}
}

/**
 * Creates a terminal language virtual URI.
 */
export function createTerminalLanguageVirtualUri(terminalId: string, languageExtension: string): URI {
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${terminalId}/terminal.${languageExtension}`,
	});
}
