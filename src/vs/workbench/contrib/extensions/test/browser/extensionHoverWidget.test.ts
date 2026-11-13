/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { marked } from '../../../../../base/common/marked/marked.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionFeaturesManagementService } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { ExtensionStatusAction } from '../../browser/extensionsActions.js';
import { ExtensionHoverWidget } from '../../browser/extensionsWidgets.js';

suite('ExtensionHoverWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function getHoverMarkdown(extension: Partial<IExtension>): IMarkdownString {
		const widget = disposables.add(new ExtensionHoverWidget(
			{ position: () => 0, target: mainWindow.document.createElement('div') },
			{ status: [] } as unknown as ExtensionStatusAction,
			{ getExtensionRuntimeStatus: () => undefined } as unknown as IExtensionsWorkbenchService,
			{ getAllAccessDataForExtension: () => new Map() } as unknown as IExtensionFeaturesManagementService,
			{ setupManagedHover: () => ({ dispose: () => { } }) } as unknown as IHoverService,
			{ getValue: () => 0 } as unknown as IConfigurationService,
			{ getAllRecommendationsWithReason: () => ({}) } as unknown as IExtensionRecommendationsService,
			{ getColorTheme: () => ({ getColor: () => undefined }) } as unknown as IThemeService,
			{ isInsideWorkspace: () => false } as unknown as IWorkspaceContextService
		));
		widget.extension = { identifier: { id: 'publisher.name' }, version: '1.0.0', state: ExtensionState.Installed, ...extension } as IExtension;
		return (widget as unknown as { getHoverMarkdown(): IMarkdownString }).getHoverMarkdown();
	}

	function getLinks(markdown: IMarkdownString): string[] {
		return [...marked.parse(markdown.value, { async: false }).matchAll(/<a href="([^"]*)"/g)].map(match => match[1]);
	}

	const command = 'command:workbench.action.files.newUntitledFile?%5B%5D';

	test('does not link marketplace provided text', () => {
		const markdown = getHoverMarkdown({
			displayName: `Name <${command}> [x](${command})`,
			description: `Description <${command}> [x](${command})`,
			outdated: true,
			latestVersion: `2.0.0 <${command}>`
		});

		assert.deepStrictEqual(getLinks(markdown), []);
	});
});
