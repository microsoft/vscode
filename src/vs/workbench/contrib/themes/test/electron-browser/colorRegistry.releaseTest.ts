/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IColorRegistry, Extensions, ColorContribution } from 'vs/platform/theme/common/colorRegistry';
import { asTextOrError } from 'vs/platform/request/common/request';
import * as pfs from 'vs/base/node/pfs';
import * as path from 'vs/base/common/path';
import * as assert from 'assert';
import { getPathFromAmdModule } from 'vs/base/test/node/testUtils';
import { CancellationToken } from 'vs/base/common/cancellation';
import { RequestService } from 'vs/platform/request/node/requestService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
// eslint-disable-next-line local/code-import-patterns
import 'vs/workbench/workbench.desktop.main';
import { NullLogService } from 'vs/platform/log/common/log';
import { mock } from 'vs/base/test/common/mock';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';

interface ColorInfo {
	description: string;
	offset: number;
	length: number;
}

interface DescriptionDiff {
	docDescription: string;
	specDescription: string;
}

export const experimental: string[] = []; // 'settings.modifiedItemForeground', 'editorUnnecessary.foreground' ];

suite('Color Registry', function () {

	test('all colors documented in theme-color.md', async function () {
		// avoid importing the TestEnvironmentService as it brings in a duplicate registration of the file editor input factory.
		const environmentService = new class extends mock<INativeEnvironmentService>() { override args = { _: [] }; };

		const reqContext = await new RequestService(new TestConfigurationService(), environmentService, new NullLogService()).request({ url: 'https://raw.githubusercontent.com/microsoft/vscode-docs/vnext/api/references/theme-color.md' }, CancellationToken.None);
		const content = (await asTextOrError(reqContext))!;

		const expression = /-\s*\`([\w\.]+)\`: (.*)/g;

		let m: RegExpExecArray | null;
		const colorsInDoc: { [id: string]: ColorInfo } = Object.create(null);
		let nColorsInDoc = 0;
		while (m = expression.exec(content)) {
			colorsInDoc[m[1]] = { description: m[2], offset: m.index, length: m.length };
			nColorsInDoc++;
		}
		assert.ok(nColorsInDoc > 0, 'theme-color.md contains to color descriptions');

		const missing = Object.create(null);
		const descriptionDiffs: { [id: string]: DescriptionDiff } = Object.create(null);

		const themingRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);
		for (const color of themingRegistry.getColors()) {
			if (!colorsInDoc[color.id]) {
				if (!color.deprecationMessage) {
					missing[color.id] = getDescription(color);
				}
			} else {
				const docDescription = colorsInDoc[color.id].description;
				const specDescription = getDescription(color);
				if (docDescription !== specDescription) {
					descriptionDiffs[color.id] = { docDescription, specDescription };
				}
				delete colorsInDoc[color.id];
			}
		}
		const colorsInExtensions = await getColorsFromExtension();
		for (const colorId in colorsInExtensions) {
			if (!colorsInDoc[colorId]) {
				missing[colorId] = colorsInExtensions[colorId];
			} else {
				delete colorsInDoc[colorId];
			}
		}
		for (const colorId of experimental) {
			if (missing[colorId]) {
				delete missing[colorId];
			}
			if (colorsInDoc[colorId]) {
				assert.fail(`Color ${colorId} found in doc but marked experimental. Please remove from experimental list.`);
			}
		}

		const undocumentedKeys = Object.keys(missing).map(k => `\`${k}\`: ${missing[k]}`);
		assert.deepStrictEqual(undocumentedKeys, [], 'Undocumented colors ids');

		const superfluousKeys = Object.keys(colorsInDoc);
		assert.deepStrictEqual(superfluousKeys, [], 'Colors ids in doc that do not exist');

	});
});

function getDescription(color: ColorContribution) {
	let specDescription = color.description;
	if (color.deprecationMessage) {
		specDescription = specDescription + ' ' + color.deprecationMessage;
	}
	return specDescription;
}

async function getColorsFromExtension(): Promise<{ [id: string]: string }> {
	const extPath = getPathFromAmdModule(require, '../../../../../../../extensions');
	const extFolders = await pfs.Promises.readDirsInDir(extPath);
	const result: { [id: string]: string } = Object.create(null);
	for (const folder of extFolders) {
		try {
			const packageJSON = JSON.parse((await pfs.Promises.readFile(path.join(extPath, folder, 'package.json'))).toString());
			const contributes = packageJSON['contributes'];
			if (contributes) {
				const colors = contributes['colors'];
				if (colors) {
					for (const color of colors) {
						const colorId = color['id'];
						if (colorId) {
							result[colorId] = colorId['description'];
						}
					}
				}
			}
		} catch (e) {
			// ignore
		}

	}
	return result;
}
