/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createToolRiskBadge, toolRiskLevelForSafety } from '../../../../../browser/widget/chatContentParts/toolInvocationParts/toolRiskBadgeHelper.js';
import { IChatToolRiskAssessmentService, IToolRiskAssessment, ToolRiskLevel, ToolRiskPromptKind } from '../../../../../browser/tools/chatToolRiskAssessmentService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../../common/tools/languageModelToolsService.js';

suite('toolRiskBadgeHelper', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('maps normalized safety scores to risk levels', () => {
		assert.deepStrictEqual([
			toolRiskLevelForSafety(-1),
			toolRiskLevelForSafety(0.32),
			toolRiskLevelForSafety(0.33),
			toolRiskLevelForSafety(0.66),
			toolRiskLevelForSafety(0.67),
			toolRiskLevelForSafety(2),
		], [
			ToolRiskLevel.Red,
			ToolRiskLevel.Red,
			ToolRiskLevel.Red,
			ToolRiskLevel.Orange,
			ToolRiskLevel.Green,
			ToolRiskLevel.Green,
		]);
	});

	function createFakes(store: DisposableStore) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, NullHoverService);
		const languageModelToolsService = new class extends mock<ILanguageModelToolsService>() {
			override getTool(): IToolData | undefined {
				return undefined;
			}
		}();
		const assessCalls: { tool: IToolData; parameters: unknown; kind: ToolRiskPromptKind | undefined }[] = [];
		const riskAssessmentService = new class implements IChatToolRiskAssessmentService {
			declare readonly _serviceBrand: undefined;
			isEnabled(): boolean { return true; }
			getCached(): IToolRiskAssessment | undefined { return undefined; }
			async assess(tool: IToolData, parameters: unknown, _token: CancellationToken, kind?: ToolRiskPromptKind): Promise<IToolRiskAssessment | undefined> {
				assessCalls.push({ tool, parameters, kind });
				return { risk: ToolRiskLevel.Green, explanation: 'Reads package metadata.' };
			}
		}();
		const tool: IToolData = {
			id: 'agent-host-read',
			source: ToolDataSource.Internal,
			displayName: 'Read',
			modelDescription: 'Read a file',
		};
		return { instantiationService, languageModelToolsService, riskAssessmentService, tool, assessCalls };
	}

	test('assesses provided tool data when the tool is not registered locally', () => {
		const { instantiationService, languageModelToolsService, riskAssessmentService, tool, assessCalls } = createFakes(store);

		const badgeStore = store.add(new DisposableStore());
		const widget = createToolRiskBadge(
			badgeStore,
			instantiationService,
			riskAssessmentService,
			languageModelToolsService,
			tool,
			{ path: 'package.json' },
		);

		assert.deepStrictEqual({
			hasWidget: !!widget,
			assessCalls,
		}, {
			hasWidget: true,
			assessCalls: [{
				tool,
				parameters: { path: 'package.json' },
				kind: undefined,
			}],
		});
	});

	test('skips assessment when arguments are unavailable (parameters undefined)', () => {
		const { instantiationService, languageModelToolsService, riskAssessmentService, tool, assessCalls } = createFakes(store);

		const badgeStore = store.add(new DisposableStore());
		const widget = createToolRiskBadge(
			badgeStore,
			instantiationService,
			riskAssessmentService,
			languageModelToolsService,
			tool,
			undefined,
		);

		assert.deepStrictEqual({ hasWidget: !!widget, assessCalls }, { hasWidget: false, assessCalls: [] });
	});
});
