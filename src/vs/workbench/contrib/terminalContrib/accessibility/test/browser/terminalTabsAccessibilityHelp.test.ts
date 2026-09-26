/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/terminal.accessibility.contribution.js';
import { deepStrictEqual, ok } from 'assert';
import { $, getActiveElement } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('Terminal tabs accessibility help', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('has an independent help identity, reuses terminal verbosity, and restores the original focus', () => {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ 'terminal.integrated.tabs.location': 'top' })
		}, store);
		const button = $('button');
		mainWindow.document.body.appendChild(button);
		try {
			button.focus();
			const implementation = AccessibleViewRegistry.getImplementations().find(candidate => candidate.name === 'terminal-tabs');
			ok(implementation);
			const provider = instantiationService.invokeFunction(accessor => implementation.getProvider(accessor));
			ok(provider instanceof AccessibleContentProvider);
			store.add(provider);
			const content = provider.provideContent();
			button.blur();
			provider.onClose();
			deepStrictEqual({
				id: provider.id,
				distinctFromTerminalHelp: provider.id !== AccessibleViewProviderId.TerminalHelp,
				type: provider.options.type,
				verbosity: provider.verbositySettingKey,
				hasReadMore: !!provider.options.readMoreUrl,
				explainsCurrent: content.includes('current tab'),
				restoredFocus: getActiveElement() === button
			}, {
				id: 'terminal-tabs-help', distinctFromTerminalHelp: true,
				type: AccessibleViewType.Help, verbosity: AccessibilityVerbositySettingId.Terminal,
				hasReadMore: true, explainsCurrent: true, restoredFocus: true
			});
		} finally {
			button.remove();
		}
	});
});
