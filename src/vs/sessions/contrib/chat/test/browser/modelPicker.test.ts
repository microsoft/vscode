/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider, ISessionModelPickerOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { sessionHasNoSelectableModel } from '../../browser/modelPicker.js';

const DEFAULT_OPTIONS: ISessionModelPickerOptions = {
	useGroupedModelPicker: true,
	showFeatured: true,
	showUnavailableFeatured: false,
	showManageModelsAction: false,
};

function createSession(providerId: string): ISession {
	return { providerId, sessionId: `${providerId}:/session` } as ISession;
}

/**
 * Minimal {@link ISessionsProvidersService} stub exposing a single provider
 * whose `getModels` / `getModelPickerOptions` return the supplied values.
 */
function createProvidersService(providerId: string, opts: {
	models: readonly ILanguageModelChatMetadataAndIdentifier[];
	showAutoModel?: boolean;
}): ISessionsProvidersService {
	const provider = {
		id: providerId,
		getModels: () => opts.models,
		getModelPickerOptions: (): ISessionModelPickerOptions => ({ ...DEFAULT_OPTIONS, showAutoModel: opts.showAutoModel }),
	} as unknown as ISessionsProvider;
	return {
		getProvider: (id: string) => (id === providerId ? provider : undefined),
	} as unknown as ISessionsProvidersService;
}

const aModel = { identifier: 'copilot-gpt-4o', metadata: {} } as ILanguageModelChatMetadataAndIdentifier;

suite('sessionHasNoSelectableModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns false when there is no session', () => {
		const service = createProvidersService('p', { models: [] });
		assert.strictEqual(sessionHasNoSelectableModel(undefined, service), false);
	});

	test('returns false when models are available', () => {
		const service = createProvidersService('p', { models: [aModel], showAutoModel: false });
		assert.strictEqual(sessionHasNoSelectableModel(createSession('p'), service), false);
	});

	test('returns true when empty and Auto is unavailable', () => {
		const service = createProvidersService('p', { models: [], showAutoModel: false });
		assert.strictEqual(sessionHasNoSelectableModel(createSession('p'), service), true);
	});

	test('returns false when empty but Auto is available (fallback)', () => {
		const service = createProvidersService('p', { models: [], showAutoModel: true });
		assert.strictEqual(sessionHasNoSelectableModel(createSession('p'), service), false);
	});
});
