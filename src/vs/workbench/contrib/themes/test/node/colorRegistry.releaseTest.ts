/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Registry } from 'vs/platform/registry/common/platform';
import { IColorRegistry, Extensions, ColorContribution, asCssVariableName } from 'vs/platform/theme/common/colorRegistry';
import { asTextOrError } from 'vs/platform/request/common/request';
import * as pfs from 'vs/base/node/pfs';
import * as path from 'vs/base/common/path';
import assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { RequestService } from 'vs/platform/request/node/requestService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
// eslint-disable-next-line local/code-import-patterns
import 'vs/workbench/workbench.desktop.main';
import { NullLogService } from 'vs/platform/log/common/log';
import { mock } from 'vs/base/test/common/mock';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileAccess } from 'vs/base/common/network';
import { TestLoggerService } from 'vs/workbench/test/common/workbenchTestServices';

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


const knwonVariablesFileName = 'vscode-known-variables.json';

suite('Color Registry', function () {

	test(`update colors in ${knwonVariablesFileName}`, async function () {
		const varFilePath = FileAccess.asFileUri(`vs/../../build/lib/stylelint/${knwonVariablesFileName}`).fsPath;
		const content = (await fs.promises.readFile(varFilePath)).toString();

		const variablesInfo = JSON.parse(content);

		const colorsArray = variablesInfo.colors as string[];

		assert.ok(colorsArray && colorsArray.length > 0, '${knwonVariablesFileName} contains no color descriptions');

		const colors = new Set(colorsArray);

		const updatedColors = [];
		const missing = [];
		const themingRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);
		for (const color of themingRegistry.getColors()) {
			const id = asCssVariableName(color.id);

			if (!colors.has(id)) {
				if (!color.deprecationMessage) {
					missing.push(id);
				}
			} else {
				colors.delete(id);
			}
			updatedColors.push(id);
		}

		const superfluousKeys = [...colors.keys()];

		let errorText = '';
		if (missing.length > 0) {
			errorText += `\n\Adding the following colors:\n\n${JSON.stringify(missing, undefined, '\t')}\n`;
		}
		if (superfluousKeys.length > 0) {
			errorText += `\n\Removing the following colors:\n\n${superfluousKeys.join('\n')}\n`;
		}

		if (errorText.length > 0) {
			updatedColors.sort();
			variablesInfo.colors = updatedColors;
			await pfs.Promises.writeFile(varFilePath, JSON.stringify(variablesInfo, undefined, '\t'));

			assert.fail(`\n\Updating ${path.normalize(varFilePath)}.\nPlease verify and commit.\n\n${errorText}\n`);
		}
	});

	test('all colors listed in theme-color.md', async function () {
		// avoid importing the TestEnvironmentService as it brings in a duplicate registration of the file editor input factory.
		const environmentService = new class extends mock<INativeEnvironmentService>() { override args = { _: [] }; };

		const docUrl = 'https://raw.githubusercontent.com/microsoft/vscode-docs/main/api/references/theme-color.md';

		const reqContext = await new RequestService(new TestConfigurationService(), environmentService, new NullLogService(), new TestLoggerService()).request({ url: docUrl }, CancellationToken.None);
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
		const superfluousKeys = Object.keys(colorsInDoc);
		const undocumentedKeys = Object.keys(missing).map(k => `\`${k}\`: ${missing[k]}`);


		let errorText = '';
		if (undocumentedKeys.length > 0) {
			errorText += `\n\nAdd the following colors:\n\n${undocumentedKeys.join('\n')}\n`;
		}
		if (superfluousKeys.length > 0) {
			errorText += `\n\Remove the following colors:\n\n${superfluousKeys.join('\n')}\n`;
		}

		if (errorText.length > 0) {
			assert.fail(`\n\nOpen https://github.dev/microsoft/vscode-docs/blob/vnext/api/references/theme-color.md#50${errorText}`);
		}
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
	const extPath = FileAccess.asFileUri('vs/../../extensions').fsPath;
	const extFolders = await pfs.Promises.readDirsInDir(extPath);
	const result: { [id: string]: string } = Object.create(null);
	for (const folder of extFolders) {
		try {
			const packageJSON = JSON.parse((await fs.promises.readFile(path.join(extPath, folder, 'package.json'))).toString());
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
