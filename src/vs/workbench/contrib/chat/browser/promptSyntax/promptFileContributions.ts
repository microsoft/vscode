/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { PromptLinkProvider } from '../../common/promptSyntax/languageProviders/promptLinkProvider.js';
import { PromptBodyAutocompletion } from '../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js';
import { PromptHeaderAutocompletion } from '../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js';
import { PromptHoverProvider } from '../../common/promptSyntax/languageProviders/promptHovers.js';
import { PromptHeaderDefinitionProvider } from '../../common/promptSyntax/languageProviders/PromptHeaderDefinitionProvider.js';
import { MARKERS_OWNER_ID, PromptValidator } from '../../common/promptSyntax/languageProviders/promptValidator.js';
import { PromptDocumentSemanticTokensProvider } from '../../common/promptSyntax/languageProviders/promptDocumentSemanticTokensProvider.js';
import { PromptCodeActionProvider } from '../../common/promptSyntax/languageProviders/promptCodeActions.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IMarkerData, IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IChatModeService } from '../../common/chatModes.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { Delayer } from '../../../../../base/common/async.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';

export class PromptLanguageFeaturesProvider extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.promptLanguageFeatures';

	constructor(
		@ILanguageFeaturesService languageService: ILanguageFeaturesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(languageService.linkProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptLinkProvider)));
		this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptBodyAutocompletion)));
		this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderAutocompletion)));
		this._register(languageService.hoverProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHoverProvider)));
		this._register(languageService.definitionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderDefinitionProvider)));
		this._register(languageService.documentSemanticTokensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptDocumentSemanticTokensProvider)));
		this._register(languageService.codeActionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptCodeActionProvider)));

		this._register(instantiationService.createInstance(PromptValidatorContribution));
	}
}

/**
 * Tracks open code editors and validates prompt models that are visible in an editor.
 * Only emits markers for models that are currently open in an editor.
 */
class PromptValidatorContribution extends Disposable {

	private readonly validator: PromptValidator;
	private readonly localDisposables = this._register(new DisposableStore());

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();
		this.validator = instantiationService.createInstance(PromptValidator);

		this.updateRegistration();
	}

	updateRegistration(): void {
		this.localDisposables.clear();
		const trackers = new ResourceMap<ModelTracker>();
		this.localDisposables.add(toDisposable(() => {
			trackers.forEach(tracker => tracker.dispose());
			trackers.clear();
		}));

		// Increment the ref count for a model, creating a tracker if needed
		const acquire = (editor: ICodeEditor): void => {
			const model = editor.getModel();
			if (!model) {
				return;
			}
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				const existing = trackers.get(model.uri);
				if (existing) {
					existing.refCount++;
					return;
				}
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
			}
		};

		// Decrement the ref count, disposing the tracker when it reaches zero
		const release = (uri: URI): void => {
			const tracker = trackers.get(uri);
			if (tracker && --tracker.refCount === 0) {
				tracker.dispose();
				trackers.delete(uri);
			}
		};

		const perEditorDisposables = new DisposableMap<string, DisposableStore>();
		this.localDisposables.add(perEditorDisposables);

		const onCodeEditorAdd = (editor: ICodeEditor) => {
			acquire(editor);
			const store = new DisposableStore();
			// Track model changes within the editor (e.g. when a different file is opened in the same editor)
			store.add(editor.onDidChangeModel((e) => {
				if (e.oldModelUrl) {
					release(e.oldModelUrl);
				}
				acquire(editor);
			}));
			store.add(editor.onDidChangeModelLanguage((e) => {
				const model = editor.getModel();
				if (model) {
					release(model.uri);
					acquire(editor);
				}
			}));
			perEditorDisposables.set(editor.getId(), store);
		};

		// Track models from editors that are currently open
		for (const editor of this.codeEditorService.listCodeEditors()) {
			onCodeEditorAdd(editor);
		}

		// When an editor is added, start tracking its model
		this.localDisposables.add(this.codeEditorService.onCodeEditorAdd((editor: ICodeEditor) => {
			onCodeEditorAdd(editor);
		}));

		// When an editor is removed, clean up its per-editor listeners and release its model
		this.localDisposables.add(this.codeEditorService.onCodeEditorRemove((editor: ICodeEditor) => {
			perEditorDisposables.deleteAndDispose(editor.getId());
			const model = editor.getModel();
			if (model) {
				release(model.uri);
			}
		}));

		const validateAll = (): void => trackers.forEach(tracker => tracker.validate());
		this.localDisposables.add(this.languageModelToolsService.onDidChangeTools(() => validateAll()));
		this.localDisposables.add(this.chatModeService.getModes(localChatSessionType).onDidChange(() => validateAll()));
		this.localDisposables.add(this.languageModelsService.onDidChangeLanguageModels(() => validateAll()));
	}
}

class ModelTracker extends Disposable {

	public refCount = 1;
	private readonly delayer: Delayer<void>;

	constructor(
		private readonly textModel: ITextModel,
		private readonly promptType: PromptsType,
		private readonly validator: PromptValidator,
		private readonly promptsService: IPromptsService,
		private readonly markerService: IMarkerService,
	) {
		super();
		this.delayer = this._register(new Delayer<void>(200));
		this._register(textModel.onDidChangeContent(() => this.validate()));
		this.validate();
	}

	public validate(): void {
		this.delayer.trigger(async () => {
			const markers: IMarkerData[] = [];
			const ast = this.promptsService.getParsedPromptFile(this.textModel);
			await this.validator.validate(ast, this.promptType, m => markers.push(m));
			if (!this._store.isDisposed) {
				this.markerService.changeOne(MARKERS_OWNER_ID, this.textModel.uri, markers);
			}
		});
	}

	public override dispose() {
		this.markerService.remove(MARKERS_OWNER_ID, [this.textModel.uri]);
		super.dispose();
	}
}
