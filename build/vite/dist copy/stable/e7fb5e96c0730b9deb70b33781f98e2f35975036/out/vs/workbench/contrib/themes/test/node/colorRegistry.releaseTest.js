/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, asCssVariableName } from '../../../../../platform/theme/common/colorRegistry.js';
import { Extensions as SizeExtensions, asCssVariableName as asSizeCssVariableName } from '../../../../../platform/theme/common/sizeUtils.js';
import { asTextOrError } from '../../../../../platform/request/common/request.js';
import * as pfs from '../../../../../base/node/pfs.js';
import * as path from '../../../../../base/common/path.js';
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { RequestService } from '../../../../../platform/request/node/requestService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../workbench.desktop.main.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { FileAccess } from '../../../../../base/common/network.js';
export const experimental = []; // 'settings.modifiedItemForeground', 'editorUnnecessary.foreground' ];
const knwonVariablesFileName = 'vscode-known-variables.json';
suite('Color Registry', function () {
    test(`update colors in ${knwonVariablesFileName}`, async function () {
        const varFilePath = FileAccess.asFileUri(`vs/../../build/lib/stylelint/${knwonVariablesFileName}`).fsPath;
        const content = (await fs.promises.readFile(varFilePath)).toString();
        const variablesInfo = JSON.parse(content);
        const colorsArray = variablesInfo.colors;
        assert.ok(colorsArray && colorsArray.length > 0, '${knwonVariablesFileName} contains no color descriptions');
        const colors = new Set(colorsArray);
        const updatedColors = [];
        const missing = [];
        const themingRegistry = Registry.as(Extensions.ColorContribution);
        for (const color of themingRegistry.getColors()) {
            const id = asCssVariableName(color.id);
            if (!colors.has(id)) {
                if (!color.deprecationMessage) {
                    missing.push(id);
                }
            }
            else {
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
        const sizesArray = variablesInfo.sizes || [];
        const sizes = new Set(sizesArray);
        const updatedSizes = [];
        const missingSizes = [];
        const sizeRegistry = Registry.as(SizeExtensions.SizeContribution);
        for (const size of sizeRegistry.getSizes()) {
            const id = asSizeCssVariableName(size.id);
            if (!sizes.has(id)) {
                if (!size.deprecationMessage) {
                    missingSizes.push(id);
                }
            }
            else {
                sizes.delete(id);
            }
            updatedSizes.push(id);
        }
        const superfluousSizes = [...sizes.keys()];
        if (missingSizes.length > 0) {
            errorText += `\n\Adding the following sizes:\n\n${JSON.stringify(missingSizes, undefined, '\t')}\n`;
        }
        if (superfluousSizes.length > 0) {
            errorText += `\n\Removing the following sizes:\n\n${superfluousSizes.join('\n')}\n`;
        }
        if (errorText.length > 0) {
            updatedColors.sort();
            variablesInfo.colors = updatedColors;
            updatedSizes.sort();
            variablesInfo.sizes = updatedSizes;
            await pfs.Promises.writeFile(varFilePath, JSON.stringify(variablesInfo, undefined, '\t'));
            assert.fail(`\n\Updating ${path.normalize(varFilePath)}.\nPlease verify and commit.\n\n${errorText}\n`);
        }
    });
    test('all colors listed in theme-color.md', async function () {
        // avoid importing the TestEnvironmentService as it brings in a duplicate registration of the file editor input factory.
        const environmentService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.args = { _: [] };
            }
        };
        const docUrl = 'https://raw.githubusercontent.com/microsoft/vscode-docs/vnext/api/references/theme-color.md';
        const reqContext = await new RequestService('local', new TestConfigurationService(), environmentService, new NullLogService()).request({ url: docUrl, callSite: 'colorRegistry.releaseTest' }, CancellationToken.None);
        const content = (await asTextOrError(reqContext));
        const expression = /-\s*\`([\w\.]+)\`: (.*)/g;
        let m;
        const colorsInDoc = Object.create(null);
        let nColorsInDoc = 0;
        while (m = expression.exec(content)) {
            colorsInDoc[m[1]] = { description: m[2], offset: m.index, length: m.length };
            nColorsInDoc++;
        }
        assert.ok(nColorsInDoc > 0, 'theme-color.md contains to color descriptions');
        const missing = Object.create(null);
        const descriptionDiffs = Object.create(null);
        const themingRegistry = Registry.as(Extensions.ColorContribution);
        for (const color of themingRegistry.getColors()) {
            if (!colorsInDoc[color.id]) {
                if (!color.deprecationMessage) {
                    missing[color.id] = getDescription(color);
                }
            }
            else {
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
            }
            else {
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
function getDescription(color) {
    let specDescription = color.description;
    if (color.deprecationMessage) {
        specDescription = specDescription + ' ' + color.deprecationMessage;
    }
    return specDescription;
}
async function getColorsFromExtension() {
    const extPath = FileAccess.asFileUri('vs/../../extensions').fsPath;
    const extFolders = await pfs.Promises.readDirsInDir(extPath);
    const result = Object.create(null);
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
        }
        catch (e) {
            // ignore
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JSZWdpc3RyeS5yZWxlYXNlVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3RoZW1lcy90ZXN0L25vZGUvY29sb3JSZWdpc3RyeS5yZWxlYXNlVGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFrQixVQUFVLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekksT0FBTyxFQUFpQixVQUFVLElBQUksY0FBYyxFQUFFLGlCQUFpQixJQUFJLHFCQUFxQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUosT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxLQUFLLElBQUksTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILHNEQUFzRDtBQUN0RCxPQUFPLHVDQUF1QyxDQUFDO0FBQy9DLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBYW5FLE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBYSxFQUFFLENBQUMsQ0FBQyx1RUFBdUU7QUFHakgsTUFBTSxzQkFBc0IsR0FBRyw2QkFBNkIsQ0FBQztBQUU3RCxLQUFLLENBQUMsZ0JBQWdCLEVBQUU7SUFFdkIsSUFBSSxDQUFDLG9CQUFvQixzQkFBc0IsRUFBRSxFQUFFLEtBQUs7UUFDdkQsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0Msc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUMxRyxNQUFNLE9BQU8sR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVyRSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTFDLE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxNQUFrQixDQUFDO1FBRXJELE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVyxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLDBEQUEwRCxDQUFDLENBQUM7UUFFN0csTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFcEMsTUFBTSxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNuQixNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQixVQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNsRixLQUFLLE1BQU0sS0FBSyxJQUFJLGVBQWUsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQ2pELE1BQU0sRUFBRSxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNyQixJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7b0JBQy9CLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xCLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuQixDQUFDO1lBQ0QsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4QixDQUFDO1FBRUQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRTNDLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNuQixJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEIsU0FBUyxJQUFJLHNDQUFzQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNqRyxDQUFDO1FBQ0QsSUFBSSxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hDLFNBQVMsSUFBSSx3Q0FBd0MsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3JGLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsS0FBaUIsSUFBSSxFQUFFLENBQUM7UUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEMsTUFBTSxZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUN4QixNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFnQixjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNqRixLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQzVDLE1BQU0sRUFBRSxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUUxQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7b0JBQzlCLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZCLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2QixDQUFDO1FBRUQsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFFM0MsSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdCLFNBQVMsSUFBSSxxQ0FBcUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDckcsQ0FBQztRQUNELElBQUksZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFNBQVMsSUFBSSx1Q0FBdUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDckYsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMxQixhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckIsYUFBYSxDQUFDLE1BQU0sR0FBRyxhQUFhLENBQUM7WUFDckMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3BCLGFBQWEsQ0FBQyxLQUFLLEdBQUcsWUFBWSxDQUFDO1lBQ25DLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBRTFGLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxtQ0FBbUMsU0FBUyxJQUFJLENBQUMsQ0FBQztRQUN6RyxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSztRQUNoRCx3SEFBd0g7UUFDeEgsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQTZCO1lBQS9DOztnQkFBMkQsU0FBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQUMsQ0FBQztTQUFBLENBQUM7UUFFOUcsTUFBTSxNQUFNLEdBQUcsNkZBQTZGLENBQUM7UUFFN0csTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLGNBQWMsQ0FBQyxPQUFPLEVBQUUsSUFBSSx3QkFBd0IsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSwyQkFBMkIsRUFBRSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZOLE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUUsQ0FBQztRQUVuRCxNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQztRQUU5QyxJQUFJLENBQXlCLENBQUM7UUFDOUIsTUFBTSxXQUFXLEdBQWdDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckUsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNyQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDN0UsWUFBWSxFQUFFLENBQUM7UUFDaEIsQ0FBQztRQUNELE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxHQUFHLENBQUMsRUFBRSwrQ0FBK0MsQ0FBQyxDQUFDO1FBRTdFLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsTUFBTSxnQkFBZ0IsR0FBc0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVoRixNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQixVQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNsRixLQUFLLE1BQU0sS0FBSyxJQUFJLGVBQWUsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQ2pELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDL0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzNDLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUM7Z0JBQ3pELE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxjQUFjLEtBQUssZUFBZSxFQUFFLENBQUM7b0JBQ3hDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsQ0FBQztnQkFDbEUsQ0FBQztnQkFDRCxPQUFPLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUIsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQztRQUMxRCxLQUFLLE1BQU0sT0FBTyxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDMUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUMzQixPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzdCLENBQUM7UUFDRixDQUFDO1FBQ0QsS0FBSyxNQUFNLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNwQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN6QixDQUFDO1lBQ0QsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLE9BQU8sOEVBQThFLENBQUMsQ0FBQztZQUM3RyxDQUFDO1FBQ0YsQ0FBQztRQUNELE1BQU0sZUFBZSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFHbEYsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ25CLElBQUksZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFNBQVMsSUFBSSxvQ0FBb0MsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDbEYsQ0FBQztRQUNELElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxTQUFTLElBQUksc0NBQXNDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNuRixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0dBQWdHLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDMUgsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxTQUFTLGNBQWMsQ0FBQyxLQUF3QjtJQUMvQyxJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDO0lBQ3hDLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDOUIsZUFBZSxHQUFHLGVBQWUsR0FBRyxHQUFHLEdBQUcsS0FBSyxDQUFDLGtCQUFrQixDQUFDO0lBQ3BFLENBQUM7SUFDRCxPQUFPLGVBQWUsQ0FBQztBQUN4QixDQUFDO0FBRUQsS0FBSyxVQUFVLHNCQUFzQjtJQUNwQyxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ25FLE1BQU0sVUFBVSxHQUFHLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0QsTUFBTSxNQUFNLEdBQTZCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDN0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUM7WUFDSixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDcEgsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQy9DLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDckMsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO3dCQUM1QixNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQzVCLElBQUksT0FBTyxFQUFFLENBQUM7NEJBQ2IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQzt3QkFDMUMsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixTQUFTO1FBQ1YsQ0FBQztJQUVGLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==