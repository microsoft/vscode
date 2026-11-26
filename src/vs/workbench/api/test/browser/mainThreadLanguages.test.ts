/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { ITextMateTokenizationService } from '../../../services/textMate/browser/textMateTokenizationFeature.js';
import { MainThreadLanguages } from '../../browser/mainThreadLanguages.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import Severity from '../../../../base/common/severity.js';

suite('MainThreadLanguages - language status', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves legacy extension links at the bridge and disposes registrations', () => {
		const statuses = new Map<string, ILanguageStatus>();
		const languages = store.add(new MainThreadLanguages(
			SingleProxyRPCProtocol({ $acceptLanguageIds: () => { } }),
			new class extends mock<ILanguageService>() {
				override readonly onDidChange = Event.None;
				override getRegisteredLanguageIds() { return []; }
			},
			new class extends mock<IModelService>() { },
			new class extends mock<ITextModelService>() { },
			new class extends mock<ILanguageStatusService>() {
				override addStatus(status: ILanguageStatus) {
					statuses.set(status.id, status);
					return toDisposable(() => statuses.delete(status.id));
				}
			},
			new class extends mock<ITextMateTokenizationService>() { },
			new class extends mock<IThemeService>() {
				override readonly onDidColorThemeChange = Event.None;
			},
		));
		languages.$setLanguageStatus(1, {
			id: 'extension.status',
			name: 'Extension',
			selector: '*',
			severity: Severity.Info,
			label: 'Ready',
			detail: 'Details [Show Log](command:test.showLog)',
			busy: false,
			source: 'extension',
			command: undefined,
			accessibilityInfo: undefined,
		});
		const detail = statuses.get('extension.status')?.detail;
		assert.deepStrictEqual(typeof detail === 'object' ? detail.nodes : detail, ['Details ', { label: 'Show Log', href: 'command:test.showLog' }]);
		languages.$removeLanguageStatus(1);
		assert.strictEqual(statuses.size, 0);
	});
});
