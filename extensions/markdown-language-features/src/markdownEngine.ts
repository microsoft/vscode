/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownIt, Token } from 'markdown-it';
import * as path from 'path';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { MarkdownContributions } from './markdownExtensions';
import { Slugifier } from './slugify';
import { getUriForLinkWithKnownExternalScheme } from './util/links';

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/;

export class MarkdownEngine {
	private md?: MarkdownIt;

	private firstLine?: number;
	private currentDocument?: vscode.Uri;
	private _slugCount = new Map<string, number>();

	public constructor(
		private readonly extensionPreviewResourceProvider: MarkdownContributions,
		private readonly slugifier: Slugifier,
	) { }

	private usePlugin(factory: (md: any) => any): void {
		try {
			this.md = factory(this.md);
		} catch (e) {
			// noop
		}
	}

	private async getEngine(resource: vscode.Uri): Promise<MarkdownIt> {
		if (!this.md) {
			const hljs = await import('highlight.js');
			this.md = (await import('markdown-it'))({
				html: true,
				highlight: (str: string, lang?: string) => {
					// Workaround for highlight not supporting tsx: https://github.com/isagalaev/highlight.js/issues/1155
					if (lang && ['tsx', 'typescriptreact'].indexOf(lang.toLocaleLowerCase()) >= 0) {
						lang = 'jsx';
					}
					if (lang && lang.toLocaleLowerCase() === 'json5') {
						lang = 'json';
					}
					if (lang && lang.toLocaleLowerCase() === 'c#') {
						lang = 'cs';
					}
					if (lang && hljs.getLanguage(lang)) {
						try {
							return `<div>${hljs.highlight(lang, str, true).value}</div>`;
						} catch (error) { }
					}
					return `<code><div>${this.md!.utils.escapeHtml(str)}</div></code>`;
				}
			});

			for (const plugin of this.extensionPreviewResourceProvider.markdownItPlugins) {
				this.usePlugin(await plugin);
			}

			for (const renderName of ['paragraph_open', 'heading_open', 'image', 'code_block', 'fence', 'blockquote_open', 'list_item_open']) {
				this.addLineNumberRenderer(this.md, renderName);
			}

			this.addImageStabilizer(this.md);
			this.addFencedRenderer(this.md);

			this.addLinkNormalizer(this.md);
			this.addLinkValidator(this.md);
			this.addNamedHeaders(this.md);
		}

		const config = vscode.workspace.getConfiguration('markdown', resource);
		this.md.set({
			breaks: config.get<boolean>('preview.breaks', false),
			linkify: config.get<boolean>('preview.linkify', true)
		});
		return this.md;
	}

	private stripFrontmatter(text: string): { text: string, offset: number } {
		let offset = 0;
		const frontMatterMatch = FrontMatterRegex.exec(text);
		if (frontMatterMatch) {
			const frontMatter = frontMatterMatch[0];
			offset = frontMatter.split(/\r\n|\n|\r/g).length - 1;
			text = text.substr(frontMatter.length);
		}
		return { text, offset };
	}

	public async render(document: vscode.Uri, stripFrontmatter: boolean, text: string): Promise<string> {
		let offset = 0;
		if (stripFrontmatter) {
			const markdownContent = this.stripFrontmatter(text);
			offset = markdownContent.offset;
			text = markdownContent.text;
		}
		this.currentDocument = document;
		this.firstLine = offset;
		this._slugCount = new Map<string, number>();

		const engine = await this.getEngine(document);
		return engine.render(text);
	}

	public async parse(document: vscode.Uri, source: string): Promise<Token[]> {
		const { text, offset } = this.stripFrontmatter(source);
		this.currentDocument = document;
		this._slugCount = new Map<string, number>();

		const engine = await this.getEngine(document);

		return engine.parse(text, {}).map(token => {
			if (token.map) {
				token.map[0] += offset;
				token.map[1] += offset;
			}
			return token;
		});
	}

	private addLineNumberRenderer(md: any, ruleName: string): void {
		const original = md.renderer.rules[ruleName];
		md.renderer.rules[ruleName] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrSet('data-line', this.firstLine + token.map[0]);
				token.attrJoin('class', 'code-line');
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addImageStabilizer(md: any): void {
		const original = md.renderer.rules.image;
		md.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			token.attrJoin('class', 'loading');

			const src = token.attrGet('src');
			if (src) {
				const hash = crypto.createHash('sha256');
				hash.update(src);
				const imgHash = hash.digest('hex');
				token.attrSet('id', `image-hash-${imgHash}`);
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addFencedRenderer(md: any): void {
		const original = md.renderer.rules['fenced'];
		md.renderer.rules['fenced'] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrJoin('class', 'hljs');
			}

			return original(tokens, idx, options, env, self);
		};
	}

	private addLinkNormalizer(md: any): void {
		const normalizeLink = md.normalizeLink;
		md.normalizeLink = (link: string) => {
			try {
				const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link);
				if (externalSchemeUri) {
					// set true to skip encoding
					return normalizeLink(externalSchemeUri.toString(true));
				}


				// Assume it must be an relative or absolute file path
				// Use a fake scheme to avoid parse warnings
				let uri = vscode.Uri.parse(`vscode-resource:${link}`);

				if (uri.path) {
					// Assume it must be a file
					const fragment = uri.fragment;
					if (uri.path[0] === '/') {
						const root = vscode.workspace.getWorkspaceFolder(this.currentDocument!);
						if (root) {
							uri = vscode.Uri.file(path.join(root.uri.fsPath, uri.path));
						}
					} else {
						uri = vscode.Uri.file(path.join(path.dirname(this.currentDocument!.path), uri.path));
					}

					if (fragment) {
						uri = uri.with({
							fragment: this.slugifier.fromHeading(fragment).value
						});
					}
					return normalizeLink(uri.with({ scheme: 'vscode-resource' }).toString(true));
				} else if (!uri.path && uri.fragment) {
					return `#${this.slugifier.fromHeading(uri.fragment).value}`;
				}
			} catch (e) {
				// noop
			}
			return normalizeLink(link);
		};
	}

	private addLinkValidator(md: any): void {
		const validateLink = md.validateLink;
		md.validateLink = (link: string) => {
			// support file:// links
			return validateLink(link) || link.indexOf('file:') === 0;
		};
	}

	private addNamedHeaders(md: any): void {
		const original = md.renderer.rules.heading_open;
		md.renderer.rules.heading_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const title = tokens[idx + 1].children.reduce((acc: string, t: any) => acc + t.content, '');
			let slug = this.slugifier.fromHeading(title);

			if (this._slugCount.has(slug.value)) {
				const count = this._slugCount.get(slug.value)!;
				this._slugCount.set(slug.value, count + 1);
				slug = this.slugifier.fromHeading(slug.value + '-' + (count + 1));
			} else {
				this._slugCount.set(slug.value, 0);
			}

			tokens[idx].attrs = tokens[idx].attrs || [];
			tokens[idx].attrs.push(['id', slug.value]);

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}
}