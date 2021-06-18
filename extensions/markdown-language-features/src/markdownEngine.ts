/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownIt, Token } from 'markdown-it';
import * as vscode from 'vscode';
import { MarkdownContributionProvider as MarkdownContributionProvider } from './markdownExtensions';
import { Slugifier } from './slugify';
import { SkinnyTextDocument } from './tableOfContentsProvider';
import { hash } from './util/hash';
import { isOfScheme, Schemes } from './util/links';
import { WebviewResourceProvider } from './util/resources';

const UNICODE_NEWLINE_REGEX = /\u2028|\u2029/g;

interface MarkdownItConfig {
	readonly breaks: boolean;
	readonly linkify: boolean;
	readonly typographer: boolean;
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

export interface RenderOutput {
	html: string;
	containingImages: { src: string }[];
}

interface RenderEnv {
	containingImages: { src: string }[];
	currentDocument: vscode.Uri | undefined;
	resourceProvider: WebviewResourceProvider | undefined;
}

export class MarkdownEngine {

	private md?: Promise<MarkdownIt>;

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

				this.addImageRenderer(md);
				this.addFencedRenderer(md);
				this.addLinkNormalizer(md);
				this.addLinkValidator(md);
				this.addNamedHeaders(md);
				this.addLinkRenderer(md);
				return md;
			});
		}

		const md = await this.md!;
		md.set(config);
		return md;
	}

	public reloadPlugins() {
		this.md = undefined;
	}

	private tokenizeDocument(
		document: SkinnyTextDocument,
		config: MarkdownItConfig,
		engine: MarkdownIt
	): Token[] {
		const cached = this._tokenCache.tryGetCached(document, config);
		if (cached) {
			return cached;
		}

		const tokens = this.tokenizeString(document.getText(), engine);
		this._tokenCache.update(document, config, tokens);
		return tokens;
	}

	private tokenizeString(text: string, engine: MarkdownIt) {
		this._slugCount = new Map<string, number>();

		return engine.parse(text.replace(UNICODE_NEWLINE_REGEX, ''), {});
	}

	public async render(input: SkinnyTextDocument | string, resourceProvider?: WebviewResourceProvider): Promise<RenderOutput> {
		const config = this.getConfig(typeof input === 'string' ? undefined : input.uri);
		const engine = await this.getEngine(config);

		const tokens = typeof input === 'string'
			? this.tokenizeString(input, engine)
			: this.tokenizeDocument(input, config, engine);

		const env: RenderEnv = {
			containingImages: [],
			currentDocument: typeof input === 'string' ? undefined : input.uri,
			resourceProvider,
		};

		const html = engine.renderer.render(tokens, {
			...(engine as any).options,
			...config
		}, env);

		return {
			html,
			containingImages: env.containingImages
		};
	}

	public async parse(document: SkinnyTextDocument): Promise<Token[]> {
		const config = this.getConfig(document.uri);
		const engine = await this.getEngine(config);
		return this.tokenizeDocument(document, config, engine);
	}

	public cleanCache(): void {
		this._tokenCache.clean();
	}

	private getConfig(resource?: vscode.Uri): MarkdownItConfig {
		const config = vscode.workspace.getConfiguration('markdown', resource);
		return {
			breaks: config.get<boolean>('preview.breaks', false),
			linkify: config.get<boolean>('preview.linkify', true),
			typographer: config.get<boolean>('preview.typographer', false)
		};
	}

	private addLineNumberRenderer(md: MarkdownIt, ruleName: string): void {
		const original = md.renderer.rules[ruleName];
		md.renderer.rules[ruleName] = (tokens: Token[], idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrSet('data-line', token.map[0] + '');
				token.attrJoin('class', 'code-line');
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addImageRenderer(md: MarkdownIt): void {
		const original = md.renderer.rules.image;
		md.renderer.rules.image = (tokens: Token[], idx: number, options: any, env: RenderEnv, self: any) => {
			const token = tokens[idx];
			token.attrJoin('class', 'loading');

			const src = token.attrGet('src');
			if (src) {
				env.containingImages?.push({ src });
				const imgHash = hash(src);
				token.attrSet('id', `image-hash-${imgHash}`);

				if (!token.attrGet('data-src')) {
					token.attrSet('src', this.toResourceUri(src, env.currentDocument, env.resourceProvider));
					token.attrSet('data-src', src);
				}
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addFencedRenderer(md: MarkdownIt): void {
		const original = md.renderer.rules['fenced'];
		md.renderer.rules['fenced'] = (tokens: Token[], idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrJoin('class', 'hljs');
			}

			return original(tokens, idx, options, env, self);
		};
	}

	private addLinkNormalizer(md: MarkdownIt): void {
		const normalizeLink = md.normalizeLink;
		md.normalizeLink = (link: string) => {
			try {
				// Normalize VS Code schemes to target the current version
				if (isOfScheme(Schemes.vscode, link) || isOfScheme(Schemes['vscode-insiders'], link)) {
					return normalizeLink(vscode.Uri.parse(link).with({ scheme: vscode.env.uriScheme }).toString());
				}

			} catch (e) {
				// noop
			}
			return normalizeLink(link);
		};
	}

	private addLinkValidator(md: MarkdownIt): void {
		const validateLink = md.validateLink;
		md.validateLink = (link: string) => {
			return validateLink(link)
				|| isOfScheme(Schemes.vscode, link)
				|| isOfScheme(Schemes['vscode-insiders'], link)
				|| /^data:image\/.*?;/.test(link);
		};
	}

	private addNamedHeaders(md: MarkdownIt): void {
		const original = md.renderer.rules.heading_open;
		md.renderer.rules.heading_open = (tokens: Token[], idx: number, options: any, env: any, self: any) => {
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

	private addLinkRenderer(md: MarkdownIt): void {
		const old_render = md.renderer.rules.link_open || ((tokens: Token[], idx: number, options: any, _env: any, self: any) => {
			return self.renderToken(tokens, idx, options);
		});

		md.renderer.rules.link_open = (tokens: Token[], idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			const hrefIndex = token.attrIndex('href');
			if (hrefIndex >= 0) {
				const href = token.attrs[hrefIndex][1];
				token.attrPush(['data-href', href]);
			}
			return old_render(tokens, idx, options, env, self);
		};
	}

	private toResourceUri(href: string, currentDocument: vscode.Uri | undefined, resourceProvider: WebviewResourceProvider | undefined): string {
		try {
			// Support file:// links
			if (isOfScheme(Schemes.file, href)) {
				const uri = vscode.Uri.parse(href);
				if (resourceProvider) {
					return resourceProvider.asWebviewUri(uri).toString(true);
				}
				// Not sure how to resolve this
				return href;
			}

			// If original link doesn't look like a url with a scheme, assume it must be a link to a file in workspace
			if (!/^[a-z\-]+:/i.test(href)) {
				// Use a fake scheme for parsing
				let uri = vscode.Uri.parse('markdown-link:' + href);

				// Relative paths should be resolved correctly inside the preview but we need to
				// handle absolute paths specially to resolve them relative to the workspace root
				if (uri.path[0] === '/' && currentDocument) {
					const root = vscode.workspace.getWorkspaceFolder(currentDocument);
					if (root) {
						uri = vscode.Uri.joinPath(root.uri, uri.fsPath).with({
							fragment: uri.fragment,
							query: uri.query,
						});

						if (resourceProvider) {
							return resourceProvider.asWebviewUri(uri).toString(true);
						} else {
							uri = uri.with({ scheme: 'markdown-link' });
						}
					}
				}

				return uri.toString(true).replace(/^markdown-link:/, '');
			}

			return href;
		} catch {
			return href;
		}
	}
}

async function getMarkdownOptions(md: () => MarkdownIt) {
	const hljs = await import('highlight.js');
	return {
		html: true,
		highlight: (str: string, lang?: string) => {
			lang = normalizeHighlightLang(lang);
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

function normalizeHighlightLang(lang: string | undefined) {
	switch (lang && lang.toLowerCase()) {
		case 'tsx':
		case 'typescriptreact':
			// Workaround for highlight not supporting tsx: https://github.com/isagalaev/highlight.js/issues/1155
			return 'jsx';

		case 'json5':
		case 'jsonc':
			return 'json';

		case 'c#':
		case 'csharp':
			return 'cs';

		default:
			return lang;
	}
}
