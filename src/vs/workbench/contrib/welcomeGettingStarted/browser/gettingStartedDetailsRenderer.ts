/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../markdown/browser/markdownDocumentRenderer.js';
import { URI } from '../../../../base/common/uri.js';
import { language } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { gettingStartedContentRegistry } from '../common/gettingStartedContent.js';


export class GettingStartedDetailsRenderer {
	private mdCache = new ResourceMap<TrustedHTML>();
	private svgCache = new ResourceMap<string>();

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
					.theme-picker-row {
						display: flex;
						justify-content: center;
						gap: 32px;
					}
					checklist {
						display: flex;
						gap: 32px;
						flex-direction: column;
					}
					checkbox {
						display: flex;
						flex-direction: column;
						align-items: center;
						margin: 5px;
						cursor: pointer;
					}
					checkbox > img {
						margin-bottom: 8px !important;
					}
					checkbox.checked > img {
						box-sizing: border-box;
					}
					checkbox.checked > img {
						outline: 2px solid var(--vscode-focusBorder);
						outline-offset: 4px;
						border-radius: 4px;
					}
					.theme-picker-link {
						margin-top: 16px;
						color: var(--vscode-textLink-foreground);
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
						display: flex;
						justify-content: center;
						flex-direction: column;
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

	async renderVideo(path: URI, poster?: URI, description?: string): Promise<string> {
		const nonce = generateUuid();

		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					video {
						max-width: 100%;
						max-height: 100%;
						object-fit: cover;
					}
				</style>
			</head>
			<body>
				<video controls autoplay ${poster ? `poster="${poster.toString(true)}"` : ''} muted ${description ? `aria-label="${description}"` : ''}>
					<source src="${path.toString(true)}" type="video/mp4">
				</video>
			</body>
		</html>`;
	}

	private async readAndCacheSVGFile(path: URI): Promise<string> {
		if (!this.svgCache.has(path)) {
			const contents = await this.readContentsOfPath(path, false);
			this.svgCache.set(path, contents);
		}
		return assertReturnsDefined(this.svgCache.get(path));
	}

	private async readAndCacheStepMarkdown(path: URI, base: URI): Promise<TrustedHTML> {
		if (!this.mdCache.has(path)) {
			const contents = await this.readContentsOfPath(path);
			const markdownContents = await renderMarkdownDocument(transformUris(contents, base), this.extensionService, this.languageService, {
				sanitizerConfig: {
					allowedLinkProtocols: {
						override: '*'
					},
					allowedTags: {
						augment: [
							'select',
							'checkbox',
							'checklist',
						]
					},
					allowedAttributes: {
						augment: [
							'x-dispatch',
							'data-command',
							'when-checked',
							'checked-on',
							'checked',
						]
					},
				}
			});
			this.mdCache.set(path, markdownContents);
		}
		return assertReturnsDefined(this.mdCache.get(path));
	}

	private async readContentsOfPath(path: URI, useModuleId = true): Promise<string> {
		try {
			const moduleId = JSON.parse(path.query).moduleId;
			if (useModuleId && moduleId) {
				const contents = await new Promise<string>((resolve, reject) => {
					const provider = gettingStartedContentRegistry.getProvider(moduleId);
					if (!provider) {
						reject(`Getting started: no provider registered for ${moduleId}`);
					} else {
						resolve(provider());
					}
				});
				return contents;
			}
		} catch { }

		try {
			const localizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${language}.md`) });

			const generalizedLocale = language?.replace(/-.*$/, '');
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
