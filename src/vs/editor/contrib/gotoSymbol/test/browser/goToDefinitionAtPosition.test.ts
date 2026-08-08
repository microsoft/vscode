/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MetadataConsts } from '../../../../common/encodedTokenAttributes.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { EncodedTokenizationResult, IState, TokenizationRegistry } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { NullState } from '../../../../common/languages/nullTokenize.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../common/services/resolverService.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../browser/link/goToDefinitionAtPosition.js';

suite('Go to Definition at Position', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the embedded language for the definition preview', async () => {
		const instantiationService = createCodeEditorServices(disposables);
		const languageService = instantiationService.get(ILanguageService);
		const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
		const outerLanguageId = 'outerLanguage';
		const innerLanguageId = 'innerLanguage';
		const targetUri = URI.file('/target.outer');

		disposables.add(languageService.registerLanguage({ id: outerLanguageId, extensions: ['.outer'] }));
		disposables.add(languageService.registerLanguage({ id: innerLanguageId }));
		const encodedOuterLanguageId = languageService.languageIdCodec.encodeLanguageId(outerLanguageId);
		const encodedInnerLanguageId = languageService.languageIdCodec.encodeLanguageId(innerLanguageId);
		disposables.add(TokenizationRegistry.register(outerLanguageId, {
			getInitialState: (): IState => NullState,
			tokenize: undefined!,
			tokenizeEncoded: (line, _hasEOL, state) => {
				const encodedLanguageId = line.startsWith('const') ? encodedInnerLanguageId : encodedOuterLanguageId;
				return new EncodedTokenizationResult(new Uint32Array([0, encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET]), [], state);
			}
		}));

		const targetModel = disposables.add(instantiateTextModel(instantiationService, '<script>\nconst word = 1;\n</script>', outerLanguageId, undefined, targetUri));
		instantiationService.set(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference() {
				return new ImmortalReference(new class extends mock<IResolvedTextEditorModel>() {
					override readonly textEditorModel: ITextModel = targetModel;
				});
			}
		});
		disposables.add(languageFeaturesService.definitionProvider.register(outerLanguageId, {
			provideDefinition: () => [{
				uri: targetUri,
				range: new Range(2, 1, 2, 16),
				targetSelectionRange: new Range(2, 7, 2, 11)
			}]
		}));

		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, targetModel));
		const contribution = disposables.add(editor.registerAndInstantiateContribution(
			GotoDefinitionAtPositionEditorContribution.ID,
			GotoDefinitionAtPositionEditorContribution
		));
		await contribution.startFindDefinitionFromCursor(new Position(2, 7));

		assert.deepStrictEqual(targetModel.getAllDecorations()
			.filter(decoration => decoration.options.description === 'goto-definition-link')
			.map(decoration => ({
				hoverMessage: Array.isArray(decoration.options.hoverMessage)
					? decoration.options.hoverMessage.map(message => message.value)
					: decoration.options.hoverMessage?.value
			})), [{
			hoverMessage: '\n```innerLanguage\nconst word = 1;\n```\n'
		}]);
	});
});
