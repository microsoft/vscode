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
import { ICommandDetectionCapability, ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ILspTerminalModelContentProvider } from '../../../../browser/lspTerminalCapability.js';

export class LspTerminalModelContentProvider extends Disposable implements ILspTerminalModelContentProvider, ITextModelContentProvider {
	static readonly scheme = Schemas.vscodeTerminal;
	private _commandDetection: ICommandDetectionCapability | undefined;
	private _capabilitiesStore: ITerminalCapabilityStore;
	private readonly _terminalId: number;
	private readonly _virtualTerminalDocumentUri: URI;

	constructor(
		capabilityStore: ITerminalCapabilityStore,
		terminalId: number,
		virtualTerminalDocument: URI,
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,

	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(LspTerminalModelContentProvider.scheme, this));
		this._capabilitiesStore = capabilityStore;
		this._commandDetection = this._capabilitiesStore.get(TerminalCapability.CommandDetection);
		this._registerTerminalCommandFinishedListener();
		this._terminalId = terminalId;
		this._virtualTerminalDocumentUri = virtualTerminalDocument;
	}

	/**
	 * Sets or updates content for a terminal virtual document.
	 */
	setContent(content: string): void {
		// If model exists, update its content
		const model = this._modelService.getModel(this._virtualTerminalDocumentUri);
		// Remove hardcoded banned content, check with shell type
		if (content !== `source /Users/anthonykim/Desktop/Skeleton/.venv/bin/activate` &&
			content !== `export PYTHONSTARTUP=/Users/anthonykim/Desktop/vscode-python/python_files/pythonrc.py`
			&& content !== 'exit()') {

			if (model) {
				// append to existing content
				const existingContent = model.getValue();
				const newContent = existingContent + content + '\n';
				model.setValue(newContent);
				console.log('existing content was: ' + existingContent + '\n');
				console.log('appending conent: ' + content + '\n');
				console.log('new content is: ', newContent + '\n');
			}
		}

	}

	private _registerTerminalCommandFinishedListener(): void {
		// Have to listen to onDidAddCapabilityType because command detection is not available until later
		this._store.add(this._capabilitiesStore.onDidAddCapabilityType(e => {
			if (e === TerminalCapability.CommandDetection) {
				this._commandDetection = this._capabilitiesStore.get(TerminalCapability.CommandDetection);
				if (this._commandDetection) {
					this._store.add(this._commandDetection.onCommandFinished((e) => {
						if (e.exitCode === 0) {
							// If command was successful, update virtual document
							this.setContent(e.command);
						}
					}));
				}

			}
		}));

	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		console.log('how many times am I here??');
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		// Extract language from file extension
		const extension = resource.path.split('.').pop();

		// Determine language ID based on extension
		let languageId: string | undefined | null = undefined;
		if (extension) {
			languageId = this._languageService.getLanguageIdByLanguageName(extension);

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

		return this._modelService.createModel('import ast\r\n', languageSelection, resource, false);
	}
}
