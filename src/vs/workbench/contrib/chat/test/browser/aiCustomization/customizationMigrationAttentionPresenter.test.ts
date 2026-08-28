/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMigrationAttentionPresenter } from '../../../browser/aiCustomization/customizationMigrationAttentionPresenter.js';
import { ChatInputNoticeHost } from '../../../browser/widget/input/chatInputNoticeHost.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { CustomizationMigrationCategoryId, ICustomizationMigrationAssessment, ICustomizationMigrationAssessmentRequest, ICustomizationMigrationService } from '../../../common/customizationMigrationService.js';

suite('CustomizationMigrationAttentionPresenter', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the previous workspace result while a new assessment is pending', async () => {
		const nextAssessment = new DeferredPromise<ICustomizationMigrationAssessment>();
		let callCount = 0;
		const migrationService = new class extends mock<ICustomizationMigrationService>() {
			override async assess(_request: ICustomizationMigrationAssessmentRequest, _token: CancellationToken): Promise<ICustomizationMigrationAssessment> {
				callCount++;
				if (callCount === 1) {
					return {
						state: 'complete',
						attentionNeeded: true,
						severity: 'warning',
						count: 2,
						findings: [{ category: CustomizationMigrationCategoryId.PromptFiles, severity: 'warning', count: 2 }],
					};
				}
				return nextAssessment.p;
			}
		}();
		const container = DOM.$('div');
		const noticeHost = disposables.add(new ChatInputNoticeHost(() => { }));
		const presenter = disposables.add(new CustomizationMigrationAttentionPresenter(
			container,
			noticeHost,
			migrationService,
			new TestConfigurationService({
				[ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled]: true,
				[ChatConfiguration.ChatCustomizationsMigrationAttentionEnabled]: true,
			}),
			new class extends mock<ICommandService>() { }(),
		));

		await presenter.assess({ workspaceRoot: URI.file('/first') });
		const firstText = container.textContent;
		const second = presenter.assess({ workspaceRoot: URI.file('/second') });
		const pendingText = container.textContent;
		nextAssessment.complete({
			state: 'complete',
			attentionNeeded: false,
			count: 0,
			findings: [],
		});
		await second;

		assert.deepStrictEqual({
			firstText,
			pendingText,
			finalText: container.textContent,
		}, {
			firstText: '2 customizations may not work with Copilot.',
			pendingText: '',
			finalText: '',
		});
	});
});
