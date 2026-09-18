/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditSources, isAiEdit, isUserEdit } from '../../../common/textModelEditSource.js';

suite('TextModelEditSource', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [sourceName, createSource] of [
		['Chat.applyEdits', EditSources.chatApplyEdits],
		['inlineChat.applyEdits', EditSources.inlineChatApplyEdit],
	] as const) {
		const create = (modelId: string | undefined, autoTier?: string) => createSource({
			modelId,
			autoTier,
			sessionId: 'session',
			requestId: 'request',
			languageId: 'typescript',
			mode: 'agent',
			extensionId: undefined,
			codeBlockSuggestionId: undefined,
		});

		test(`${sourceName} retains canonical Auto tiers at metadata level one`, () => {
			const tiers = ['efficiency', 'balance', 'intelligence', 'fast'];
			assert.deepStrictEqual(tiers.map(autoTier => {
				const source = create('copilot/auto', autoTier);
				return {
					autoTier: source.props.$autoTier,
					modelId: source.props.$modelId,
					key: source.toKey(1),
					originalKey: source.toKey(1, { $autoTier: false }),
					publicKey: source.toKey(0),
					type: source.getType(),
					isAi: isAiEdit(source),
					isUser: isUserEdit(source),
				};
			}), tiers.map(autoTier => ({
				autoTier,
				modelId: 'copilot|auto',
				key: `source:${sourceName}-$modelId:copilot|auto-$autoTier:${autoTier}`,
				originalKey: `source:${sourceName}-$modelId:copilot|auto`,
				publicKey: `source:${sourceName}`,
				type: sourceName,
				isAi: true,
				isUser: false,
			})));
		});

		test(`${sourceName} leaves missing, invalid and non-Auto tiers unset`, () => {
			const inputs = [
				{ modelId: 'copilot/auto', autoTier: undefined },
				...['', 'auto', 'default', 'balanced', 'Efficiency', ' efficiency ', 'unknown'].map(autoTier => ({ modelId: 'copilot/auto', autoTier })),
				...[undefined, 'copilot/gpt-5', 'copilot|auto', 'auto'].flatMap(modelId =>
					['efficiency', 'balance', 'intelligence', 'fast'].map(autoTier => ({ modelId, autoTier }))),
			];
			assert.deepStrictEqual(inputs.map(({ modelId, autoTier }) => {
				const source = create(modelId, autoTier);
				return { autoTier: source.props.$autoTier, modelId: source.props.$modelId, key: source.toKey(1) };
			}), inputs.map(({ modelId }) => ({
				autoTier: undefined,
				modelId: modelId?.replaceAll('/', '|'),
				key: `source:${sourceName}${modelId ? `-$modelId:${modelId.replaceAll('/', '|')}` : ''}`,
			})));
		});

		test(`${sourceName} bounds Auto tier subdivisions to four canonical tiers plus unset`, () => {
			const tiers = [undefined, 'efficiency', 'balance', 'intelligence', 'fast', ...Array.from({ length: 100 }, (_, i) => `invalid-${i}`)];
			assert.deepStrictEqual([...new Set(tiers.map(tier => create('copilot/auto', tier).toKey(1)))], [
				`source:${sourceName}-$modelId:copilot|auto`,
				...['efficiency', 'balance', 'intelligence', 'fast'].map(tier => `source:${sourceName}-$modelId:copilot|auto-$autoTier:${tier}`),
			]);
		});
	}
});
