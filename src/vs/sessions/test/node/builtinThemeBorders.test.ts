/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { Color } from '../../../base/common/color.js';
import { FileAccess } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IExtensionResourceLoaderService } from '../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { contrastBorder, editorBackground } from '../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../platform/theme/common/theme.js';
import { EDITOR_GROUP_HEADER_TABS_BORDER, TAB_BORDER } from '../../../workbench/common/theme.js';
import { ColorThemeData } from '../../../workbench/services/themes/common/colorThemeData.js';
import { ExtensionData, IThemeExtensionPoint } from '../../../workbench/services/themes/common/workbenchThemeService.js';
import { activeSessionViewBackground, agentsBottomPanelBorder, agentsCardBorder, agentsDetailBackground, agentsPanelBackground, agentsPanelBorder, inactiveSessionViewBackground } from '../../common/theme.js';

interface IBuiltinThemeManifest {
	readonly name: string;
	readonly publisher: string;
	readonly contributes?: { readonly themes?: readonly Omit<IThemeExtensionPoint, '_watch'>[] };
}

suite('Sessions - Built-in theme borders', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('every built-in theme gives Agents panels and connected frames visible borders', async () => {
		const extensionsPath = join(FileAccess.asFileUri('').fsPath, '..', 'extensions');
		const extensions = (await fs.readdir(extensionsPath, { withFileTypes: true }))
			.filter(entry => entry.isDirectory() && entry.name.startsWith('theme-'))
			.sort((a, b) => a.name.localeCompare(b.name));
		const loader = new class extends mock<IExtensionResourceLoaderService>() {
			override readExtensionResource(uri: URI): Promise<string> {
				return fs.readFile(uri.fsPath, 'utf8');
			}
		}();
		const invisibleBorders: { theme: string; border: string; background: string }[] = [];
		let themesChecked = 0;

		for (const extension of extensions) {
			const extensionPath = join(extensionsPath, extension.name);
			const manifest: IBuiltinThemeManifest = JSON.parse(await fs.readFile(join(extensionPath, 'package.json'), 'utf8'));
			for (const contribution of manifest.contributes?.themes ?? []) {
				const theme = ColorThemeData.fromExtensionTheme(
					{ ...contribution, _watch: false },
					URI.file(join(extensionPath, contribution.path)),
					ExtensionData.fromName(manifest.publisher, manifest.name, true),
				);
				await theme.ensureLoaded(loader);
				themesChecked++;

				const checkBorder = (id: string, border: Color | undefined, backgroundId: string) => {
					const background = theme.getColor(backgroundId);
					if (!border || !background || border.makeOpaque(background).equals(background)) {
						invisibleBorders.push({ theme: contribution.id, border: id, background: backgroundId });
					}
				};

				for (const border of [agentsPanelBorder, agentsCardBorder, agentsBottomPanelBorder]) {
					for (const background of [agentsPanelBackground, agentsDetailBackground, activeSessionViewBackground, inactiveSessionViewBackground]) {
						checkBorder(border, theme.getColor(border), background);
					}
				}

				const connectedBorder = isHighContrast(theme.type)
					? theme.getColor(contrastBorder)
					: theme.getColor(EDITOR_GROUP_HEADER_TABS_BORDER) ?? theme.getColor(TAB_BORDER);
				for (const background of [editorBackground, activeSessionViewBackground, inactiveSessionViewBackground]) {
					checkBorder('connected tabs', connectedBorder, background);
				}
			}
		}

		assert.ok(themesChecked > 0, 'No built-in color themes were found');
		assert.deepStrictEqual(invisibleBorders, []);
	});
});
