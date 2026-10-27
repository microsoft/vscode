/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, thenRegisterOrDispose } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, IOnboardingTryoutService, isOnboardingTryoutId, OnboardingTryoutAvailability, OnboardingTryoutPreparation } from '../common/onboardingTryout.js';
import { EditorSampleTryoutPayload, isEditorSampleTryoutPayload } from '../common/onboardingTryoutActions.js';

export class EditorSampleTryoutPresentation extends Disposable implements IOnboardingTryoutPresentationDefinition<EditorSampleTryoutPayload>, ITextModelContentProvider {
	readonly kind = 'editorSample';
	readonly isPayload = isEditorSampleTryoutPayload;
	get onDidChangeAvailability() { return this.languageService.onDidChange; }

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
	) {
		super();
	}

	getAvailability(payload: EditorSampleTryoutPayload): OnboardingTryoutAvailability {
		return !payload.languageId || this.languageService.isRegisteredLanguageId(payload.languageId)
			? { kind: 'ready' }
			: { kind: 'unavailable', message: localize('onboarding.tryout.languageUnavailable', "Language support for this example is not available yet.") };
	}

	async prepare(payload: EditorSampleTryoutPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		const original = URI.from({ scheme: Schemas.vscodeOnboardingSample, path: `/${context.id}/${payload.type === 'diff' ? 'original' : 'text'}` });
		const modified = payload.type === 'diff'
			? URI.from({ scheme: Schemas.vscodeOnboardingSample, path: `/${context.id}/modified` })
			: undefined;

		await thenRegisterOrDispose(this.textModelService.createModelReference(original), context.store);
		if (context.token.isCancellationRequested || context.store.isDisposed) {
			return { kind: 'cancelled' };
		}
		if (modified) {
			await thenRegisterOrDispose(this.textModelService.createModelReference(modified), context.store);
		}
		if (context.token.isCancellationRequested || context.store.isDisposed) {
			return { kind: 'cancelled' };
		}

		return {
			kind: 'ready',
			run: async () => {
				if (context.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				const pane = await this.editorService.openEditor(modified
					? {
						original: { resource: original },
						modified: { resource: modified },
						label: payload.title,
						options: { pinned: true },
					}
					: {
						resource: original,
						label: payload.title,
						options: { pinned: true },
					});
				return pane
					? { kind: 'opened' }
					: { kind: 'unavailable', message: localize('onboarding.tryout.sampleFailed', "The example editor could not be opened.") };
			},
		};
	}

	async provideTextContent(resource: URI): Promise<ITextModel> {
		const [, id, part, ...extra] = resource.path.split('/');
		if (resource.scheme !== Schemas.vscodeOnboardingSample || resource.authority || resource.query || resource.fragment
			|| extra.length || !isOnboardingTryoutId(id) || (part !== 'text' && part !== 'original' && part !== 'modified')) {
			throw new Error(localize('onboarding.tryout.sampleUnavailable', "This sample is no longer available. Open its feature example from the release notes again."));
		}
		const model = this.modelService.getModel(resource);
		if (model) {
			return model;
		}
		const scenario = this.tryoutService.getTryout(id);
		const payload = scenario?.presentation.payload;
		if (scenario?.presentation.kind !== this.kind || !isEditorSampleTryoutPayload(payload)) {
			throw new Error(localize('onboarding.tryout.sampleUnavailable', "This sample is no longer available. Open its feature example from the release notes again."));
		}
		const text = payload.type === 'text' && part === 'text' ? payload.text
			: payload.type === 'diff' && part === 'original' ? payload.original
				: payload.type === 'diff' && part === 'modified' ? payload.modified
					: undefined;
		if (text === undefined) {
			throw new Error(localize('onboarding.tryout.sampleUnavailable', "This sample is no longer available. Open its feature example from the release notes again."));
		}
		return this.modelService.createModel(text, this.languageService.createById(payload.languageId ?? 'plaintext'), resource);
	}
}
