/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import type Vinyl from 'vinyl';
import { createLinuxDesktopEntries } from '../linuxDesktopEntries.ts';

suite('Linux desktop entries', () => {
	for (const [applicationName, linuxDesktopName] of [
		['code', 'com.microsoft.VSCode'],
		['code-insiders', 'com.microsoft.VSCodeInsiders'],
		['code-oss', 'com.visualstudio.CodeOSS']
	]) {
		for (const applicationsPath of ['usr/share/applications', 'BUILD/usr/share/applications']) {
			test(`${applicationName}: ${applicationsPath}`, async () => {
				const files = new Map<string, string>();
				await new Promise<void>((resolve, reject) => {
					createLinuxDesktopEntries(applicationsPath, {
						applicationName,
						linuxDesktopName,
						nameLong: 'Visual Studio Code',
						nameShort: 'Code',
						linuxIconName: applicationName,
						urlProtocol: applicationName
					})
						.on('data', (file: Vinyl) => {
							assert(file.isBuffer());
							files.set(file.relative.replaceAll('\\', '/'), file.contents.toString());
						})
						.on('error', reject)
						.on('end', resolve);
				});

				const desktop = files.get(`${applicationsPath}/${linuxDesktopName}.desktop`)!;
				const urlHandler = files.get(`${applicationsPath}/${linuxDesktopName}.UrlHandler.desktop`)!;
				assert.deepStrictEqual(Object.fromEntries([...files].sort()), Object.fromEntries([
					[`${applicationsPath}/${linuxDesktopName}.desktop`, desktop],
					[`${applicationsPath}/${linuxDesktopName}.UrlHandler.desktop`, urlHandler],
					[`${applicationsPath}/${applicationName}.desktop`, desktop.replace('[Desktop Entry]', '[Desktop Entry]\nNoDisplay=true')],
					[`${applicationsPath}/${applicationName}-url-handler.desktop`, urlHandler]
				].sort()));

				assert.deepStrictEqual({
					unresolvedTemplates: [...files.values()].some(contents => contents.includes('@@')),
					visibleEntries: [...files.values()].filter(contents => !contents.includes('NoDisplay=true')).length,
					hiddenEntries: [...files.values()].some(contents => contents.includes('Hidden=true')),
					exec: desktop.match(/^Exec=.*$/gm),
					windowClass: desktop.match(/^StartupWMClass=.*$/m)?.[0],
					urlExec: urlHandler.match(/^Exec=.*$/m)?.[0],
					urlMimeType: urlHandler.match(/^MimeType=.*$/m)?.[0]
				}, {
					unresolvedTemplates: false,
					visibleEntries: 1,
					hiddenEntries: false,
					exec: [
						`Exec=/usr/share/${applicationName}/${applicationName} %F`,
						`Exec=/usr/share/${applicationName}/${applicationName} --new-window %F`
					],
					windowClass: `StartupWMClass=${linuxDesktopName}`,
					urlExec: `Exec=/usr/share/${applicationName}/${applicationName} --open-url %U`,
					urlMimeType: `MimeType=x-scheme-handler/${applicationName};`
				});
			});
		}
	}
});
