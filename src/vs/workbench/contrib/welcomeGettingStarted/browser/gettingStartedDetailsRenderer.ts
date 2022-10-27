/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { generateTokensCSSForColorMap } from 'vs/editor/common/languages/supports/tokenization';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from 'vs/workbench/contrib/markdown/browser/markdownDocumentRenderer';
import { URI } from 'vs/base/common/uri';
import { locale } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import { assertIsDefined } from 'vs/base/common/types';
import { asWebviewUri } from 'vs/workbench/common/webview';
import { ResourceMap } from 'vs/base/common/map';
import { IFileService } from 'vs/platform/files/common/files';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';


export class GettingStartedDetailsRenderer {
	private mdCache = new ResourceMap<Promise<string>>();
	private svgCache = new ResourceMap<Promise<string>>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILanguageService private readonly languageService: ILanguageService,
	) { }

	async renderMarkdown(path: URI, base: URI): Promise<string> {
		const content = await this.readAndCacheStepMarkdown(path, base);
		const nonce = generateUuid();
		const colorMap = TokenizationRegistry.getColorMap();

		const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';

		const inDev = document.location.protocol === 'http:';
		const imgSrcCsp = inDev ? 'img-src https: data: http:' : 'img-src https: data:';

		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${imgSrcCsp}; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					body > img {
						align-self: flex-start;
					}
					body > img[centered] {
						align-self: center;
					}
					body {
						display: flex;
						flex-direction: column;
						padding: 0;
						height: inherit;
					}
					checklist {
						display: flex;
						flex-wrap: wrap;
						justify-content: space-around;
					}
					checkbox {
						display: flex;
						flex-direction: column;
						align-items: center;
						margin: 5px;
						cursor: pointer;
					}
					checkbox > img {
						margin-bottom: 4px;
					}
					checkbox.checked > img {
						box-sizing: border-box;
					}
					checkbox.checked > img {
						outline: 2px solid var(--vscode-focusBorder);
						outline-offset: 2px;
					}
					blockquote > p:first-child {
						margin-top: 0;
					}
					body > * {
						margin-block-end: 0.25em;
						margin-block-start: 0.25em;
					}
					vertically-centered {
						padding-top: 5px;
						padding-bottom: 5px;
					}
					html {
						height: 100%;
						padding-right: 32px;
					}
					h1 {
						font-size: 19.5px;
					}
					h2 {
						font-size: 18.5px;
					}
				</style>
			</head>
			<body>
				<vertically-centered>
					${content}
				</vertically-centered>
			</body>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				document.querySelectorAll('[when-checked]').forEach(el => {
					el.addEventListener('click', () => {
						vscode.postMessage(el.getAttribute('when-checked'));
					});
				});

				let ongoingLayout = undefined;
				const doLayout = () => {
					document.querySelectorAll('vertically-centered').forEach(element => {
						element.style.marginTop = Math.max((document.body.clientHeight - element.scrollHeight) * 3/10, 0) + 'px';
					});
					ongoingLayout = undefined;
				};

				const layout = () => {
					if (ongoingLayout) {
						clearTimeout(ongoingLayout);
					}
					ongoingLayout = setTimeout(doLayout, 0);
				};

				layout();

				document.querySelectorAll('img').forEach(element => {
					element.onload = layout;
				})

				window.addEventListener('message', event => {
					if (event.data.layoutMeNow) {
						layout();
					}
					if (event.data.enabledContextKeys) {
						document.querySelectorAll('.checked').forEach(element => element.classList.remove('checked'))
						for (const key of event.data.enabledContextKeys) {
							document.querySelectorAll('[checked-on="' + key + '"]').forEach(element => element.classList.add('checked'))
						}
					}
				});
		</script>
		</html>`;
	}

	async renderSVG(path: URI): Promise<string> {
		const content = await this.readAndCacheSVGFile(path);
		const nonce = generateUuid();
		const colorMap = TokenizationRegistry.getColorMap();

		const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					svg {
						position: fixed;
						height: 100%;
						width: 80%;
						left: 50%;
						top: 50%;
						max-width: 530px;
						min-width: 350px;
						transform: translate(-50%,-50%);
					}
				</style>
			</head>
			<body>
				${content}
			</body>
		</html>`;
	}

	private readAndCacheSVGFile(path: URI): Promise<string> {
		if (!this.svgCache.has(path)) {
			this.svgCache.set(path, this.readContentsOfPath(path, false));
		}
		return assertIsDefined(this.svgCache.get(path));
	}

	private readAndCacheStepMarkdown(path: URI, base: URI): Promise<string> {
		if (!this.mdCache.has(path)) {
			this.mdCache.set(path,
				this.readContentsOfPath(path).then(rawContents =>
					renderMarkdownDocument(transformUris(rawContents, base), this.extensionService, this.languageService, true, true)));
		}
		return assertIsDefined(this.mdCache.get(path));
	}

	private async readContentsOfPath(path: URI, useModuleId = true): Promise<string> {
		try {
			const moduleId = JSON.parse(path.query).moduleId;
			if (useModuleId && moduleId) {
				const contents = await new Promise<string>(c => {
					require([moduleId], content => {
						c(content.default());
					});
				});
				return contents;
			}
		} catch { }

		try {
			const localizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${locale}.md`) });

			const generalizedLocale = locale?.replace(/-.*$/, '');
			const generalizedLocalizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${generalizedLocale}.md`) });

			const fileExists = (file: URI) => this.fileService
				.stat(file)
				.then((stat) => !!stat.size) // Double check the file actually has content for fileSystemProviders that fake `stat`. #131809
				.catch(() => false);

			const [localizedFileExists, generalizedLocalizedFileExists] = await Promise.all([
				fileExists(localizedPath),
				fileExists(generalizedLocalizedPath),
			]);

			const bytes = await this.fileService.readFile(
				localizedFileExists
					? localizedPath
					: generalizedLocalizedFileExists
						? generalizedLocalizedPath
						: path);

			return bytes.value.toString();
		} catch (e) {
			this.notificationService.error('Error reading markdown document at `' + path + '`: ' + e);
			return '';
		}
	}
}

const transformUri = (src: string, base: URI) => {
	const path = joinPath(base, src);
	return asWebviewUri(path).toString(true);
};

const transformUris = (content: string, base: URI): string => content
	.replace(/src="([^"]*)"/g, (_, src: string) => {
		if (src.startsWith('https://')) { return `src="${src}"`; }
		return `src="${transformUri(src, base)}"`;
	})
	.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, title: string, src: string) => {
		if (src.startsWith('https://')) { return `![${title}](${src})`; }
		return `![${title}](${transformUri(src, base)})`;
	});
