/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import { gulp, rename, replace } from './gulp/facade.ts';

interface LinuxDesktopProduct {
	applicationName: string;
	nameLong: string;
	nameShort: string;
	linuxDesktopName: string;
	linuxIconName: string;
	urlProtocol: string;
}

export function createLinuxDesktopEntries(applicationsPath: string, product: LinuxDesktopProduct): NodeJS.ReadWriteStream {
	const entries = [
		{ template: 'code.desktop', name: product.linuxDesktopName, noDisplay: false },
		{ template: 'code-url-handler.desktop', name: `${product.linuxDesktopName}.UrlHandler`, noDisplay: false },
		// Keep saved favorites and MIME associations working without adding duplicate menu entries.
		{ template: 'code.desktop', name: product.applicationName, noDisplay: true },
		{ template: 'code-url-handler.desktop', name: `${product.applicationName}-url-handler`, noDisplay: false }
	];

	return es.merge(...entries.map(entry => {
		let stream = gulp.src(`resources/linux/${entry.template}`, { base: '.' })
			.pipe(rename(`${applicationsPath}/${entry.name}.desktop`));
		if (entry.noDisplay) {
			stream = stream.pipe(replace('[Desktop Entry]', '[Desktop Entry]\nNoDisplay=true'));
		}
		return stream;
	}))
		.pipe(replace('@@NAME_LONG@@', product.nameLong))
		.pipe(replace('@@NAME_SHORT@@', product.nameShort))
		.pipe(replace('@@DESKTOP_NAME@@', product.linuxDesktopName))
		.pipe(replace('@@NAME@@', product.applicationName))
		.pipe(replace('@@EXEC@@', `/usr/share/${product.applicationName}/${product.applicationName}`))
		.pipe(replace('@@ICON@@', product.linuxIconName))
		.pipe(replace('@@URLPROTOCOL@@', product.urlProtocol));
}
