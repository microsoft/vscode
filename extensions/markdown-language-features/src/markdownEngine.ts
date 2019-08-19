/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import { MarkdownIt, Token } from 'markdown-it';
import * as path from 'path';
import * as vscode from 'vscode';
import { MarkdownContributionProvider as MarkdownContributionProvider } from './markdownExtensions';
import { Slugifier } from './slugify';
import { SkinnyTextDocument } from './tableOfContentsProvider';
import { getUriForLinkWithKnownExternalScheme } from './util/links';

const UNICODE_NEWLINE_REGEX = /\u2028|\u2029/g;

interface MarkdownItConfig {
	readonly breaks: boolean;
	readonly linkify: boolean;
}

class TokenCache {
	private cachedDocument?: {
		readonly uri: vscode.Uri;
		readonly version: number;
		readonly config: MarkdownItConfig;
	};
	private tokens?: Token[];

	public tryGetCached(document: SkinnyTextDocument, config: MarkdownItConfig): Token[] | undefined {
		if (this.cachedDocument
			&& this.cachedDocument.uri.toString() === document.uri.toString()
			&& this.cachedDocument.version === document.version
			&& this.cachedDocument.config.breaks === config.breaks
			&& this.cachedDocument.config.linkify === config.linkify
		) {
			return this.tokens;
		}
		return undefined;
	}

	public update(document: SkinnyTextDocument, config: MarkdownItConfig, tokens: Token[]) {
		this.cachedDocument = {
			uri: document.uri,
			version: document.version,
			config,
		};
		this.tokens = tokens;
	}

	public clean(): void {
		this.cachedDocument = undefined;
		this.tokens = undefined;
	}
}

export class MarkdownEngine {
	private md?: Promise<MarkdownIt>;

	private currentDocument?: vscode.Uri;
	private _slugCount = new Map<string, number>();
	private _tokenCache = new TokenCache();

	public constructor(
		private readonly contributionProvider: MarkdownContributionProvider,
		private readonly slugifier: Slugifier,
	) {
		contributionProvider.onContributionsChanged(() => {
			// Markdown plugin contributions may have changed
			this.md = undefined;
		});
	}

	private async getEngine(config: MarkdownItConfig): Promise<MarkdownIt> {
		if (!this.md) {
			this.md = import('markdown-it').then(async markdownIt => {
				let md: MarkdownIt = markdownIt(await getMarkdownOptions(() => md));

				for (const plugin of this.contributionProvider.contributions.markdownItPlugins.values()) {
					try {
						md = (await plugin)(md);
					} catch {
						// noop
					}
				}

				const frontMatterPlugin = require('markdown-it-front-matter');
				// Extract rules from front matter plugin and apply at a lower precedence
				let fontMatterRule: any;
				frontMatterPlugin({
					block: {
						ruler: {
							before: (_id: any, _id2: any, rule: any) => { fontMatterRule = rule; }
						}
					}
				}, () => { /* noop */ });

				md.block.ruler.before('fence', 'front_matter', fontMatterRule, {
					alt: ['paragraph', 'reference', 'blockquote', 'list']
				});

				for (const renderName of ['paragraph_open', 'heading_open', 'image', 'code_block', 'fence', 'blockquote_open', 'list_item_open']) {
					this.addLineNumberRenderer(md, renderName);
				}

				this.addImageStabilizer(md);
				this.addFencedRenderer(md);

				this.addLinkNormalizer(md);
				this.addLinkValidator(md);
				this.addNamedHeaders(md);
				return md;
			});
		}

		const md = await this.md!;
		md.set(config);
		return md;
	}

	private tokenize(
		document: SkinnyTextDocument,
		config: MarkdownItConfig,
		engine: MarkdownIt
	): Token[] {
		const cached = this._tokenCache.tryGetCached(document, config);
		if (cached) {
			return cached;
		}

		this.currentDocument = document.uri;
		this._slugCount = new Map<string, number>();

		const text = document.getText();
		const tokens = engine.parse(text.replace(UNICODE_NEWLINE_REGEX, ''), {});
		this._tokenCache.update(document, config, tokens);
		return tokens;
	}

	public async render(document: SkinnyTextDocument): Promise<string> {
		const config = this.getConfig(document.uri);
		const engine = await this.getEngine(config);
		return engine.renderer.render(this.tokenize(document, config, engine), {
			...(engine as any).options,
			...config
		}, {});
	}

	public async parse(document: SkinnyTextDocument): Promise<Token[]> {
		const config = this.getConfig(document.uri);
		const engine = await this.getEngine(config);
		return this.tokenize(document, config, engine);
	}

	public cleanCache(): void {
		this._tokenCache.clean();
	}

	private getConfig(resource: vscode.Uri): MarkdownItConfig {
		const config = vscode.workspace.getConfiguration('markdown', resource);
		return {
			breaks: config.get<boolean>('preview.breaks', false),
			linkify: config.get<boolean>('preview.linkify', true)
		};
	}

	private addLineNumberRenderer(md: any, ruleName: string): void {
		const original = md.renderer.rules[ruleName];
		md.renderer.rules[ruleName] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrSet('data-line', token.map[0]);
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
			return validateLink(link) || link.startsWith('file:') || /^data:image\/.*?;/.test(link);
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

async function getMarkdownOptions(md: () => MarkdownIt) {
	const hljs = await import('highlight.js');
	return {
		html: true,
		highlight: (str: string, lang?: string) => {
			// Workaround for highlight not supporting tsx: https://github.com/isagalaev/highlight.js/issues/1155
			if (lang && ['tsx', 'typescriptreact'].includes(lang.toLocaleLowerCase())) {
				lang = 'jsx';
			}
			if (lang && lang.toLocaleLowerCase() === 'json5') {
				lang = 'json';
			}
			if (lang && ['c#', 'csharp'].includes(lang.toLocaleLowerCase())) {
				lang = 'cs';
			}
			if (lang && hljs.getLanguage(lang)) {
				try {
					return `<div>${hljs.highlight(lang, str, true).value}</div>`;
				}
				catch (error) { }
			}
			return `<code><div>${md().utils.escapeHtml(str)}</div></code>`;
		}
	};
}
