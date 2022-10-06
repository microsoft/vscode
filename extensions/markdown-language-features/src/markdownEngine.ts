/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type MarkdownIt = require('markdown-it');
import type Token = require('markdown-it/lib/token');
import * as vscode from 'vscode';
import { ILogger } from './logging';
import { MarkdownContributionProvider } from './markdownExtensions';
import { Slugifier } from './slugify';
import { ITextDocument } from './types/textDocument';
import { WebviewResourceProvider } from './util/resources';
import { isOfScheme, Schemes } from './util/schemes';

const UNICODE_NEWLINE_REGEX = /\u2028|\u2029/g;

/**
 * Adds begin line index to the output via the 'data-line' data attribute.
 */
const pluginSourceMap: MarkdownIt.PluginSimple = (md): void => {
	// Set the attribute on every possible token.
	md.core.ruler.push('source_map_data_attribute', (state): void => {
		for (const token of state.tokens) {
			if (token.map && token.type !== 'inline') {
				token.attrSet('data-line', String(token.map[0]));
				token.attrJoin('class', 'code-line');
				token.attrJoin('dir', 'auto');
			}
		}
	});

	// The 'html_block' renderer doesn't respect `attrs`. We need to insert a marker.
	const originalHtmlBlockRenderer = md.renderer.rules['html_block'];
	if (originalHtmlBlockRenderer) {
		md.renderer.rules['html_block'] = (tokens, idx, options, env, self) => (
			`<div ${self.renderAttrs(tokens[idx])} ></div>\n` +
			originalHtmlBlockRenderer(tokens, idx, options, env, self)
		);
	}
};

/**
 * The markdown-it options that we expose in the settings.
 */
type MarkdownItConfig = Readonly<Required<Pick<MarkdownIt.Options, 'breaks' | 'linkify' | 'typographer'>>>;

class TokenCache {
	private cachedDocument?: {
		readonly uri: vscode.Uri;
		readonly version: number;
		readonly config: MarkdownItConfig;
	};
	private tokens?: Token[];

	public tryGetCached(document: ITextDocument, config: MarkdownItConfig): Token[] | undefined {
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

	public update(document: ITextDocument, config: MarkdownItConfig, tokens: Token[]) {
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
	containingImages: Set<string>;
}

interface RenderEnv {
	containingImages: Set<string>;
	currentDocument: vscode.Uri | undefined;
	resourceProvider: WebviewResourceProvider | undefined;
}

export interface IMdParser {
	readonly slugifier: Slugifier;

	tokenize(document: ITextDocument): Promise<Token[]>;
}

export class MarkdownItEngine implements IMdParser {

	private md?: Promise<MarkdownIt>;

	private _slugCount = new Map<string, number>();
	private _tokenCache = new TokenCache();

	public readonly slugifier: Slugifier;

	public constructor(
		private readonly contributionProvider: MarkdownContributionProvider,
		slugifier: Slugifier,
		private readonly logger: ILogger,
	) {
		this.slugifier = slugifier;

		contributionProvider.onContributionsChanged(() => {
			// Markdown plugin contributions may have changed
			this.md = undefined;
		});
	}

	private async getEngine(config: MarkdownItConfig): Promise<MarkdownIt> {
		if (!this.md) {
			this.md = (async () => {
				const markdownIt = await import('markdown-it');
				let md: MarkdownIt = markdownIt(await getMarkdownOptions(() => md));
				md.linkify.set({ fuzzyLink: false });

				for (const plugin of this.contributionProvider.contributions.markdownItPlugins.values()) {
					try {
						md = (await plugin)(md);
					} catch (e) {
						console.error('Could not load markdown it plugin', e);
					}
				}

				const frontMatterPlugin = await import('markdown-it-front-matter');
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

				this.addImageRenderer(md);
				this.addFencedRenderer(md);
				this.addLinkNormalizer(md);
				this.addLinkValidator(md);
				this.addNamedHeaders(md);
				this.addLinkRenderer(md);
				md.use(pluginSourceMap);
				return md;
			})();
		}

		const md = await this.md!;
		md.set(config);
		return md;
	}

	public reloadPlugins() {
		this.md = undefined;
	}

	private tokenizeDocument(
		document: ITextDocument,
		config: MarkdownItConfig,
		engine: MarkdownIt
	): Token[] {
		const cached = this._tokenCache.tryGetCached(document, config);
		if (cached) {
			this.resetSlugCount();
			return cached;
		}

		this.logger.verbose('MarkdownItEngine', `tokenizeDocument - ${document.uri}`);
		const tokens = this.tokenizeString(document.getText(), engine);
		this._tokenCache.update(document, config, tokens);
		return tokens;
	}

	private tokenizeString(text: string, engine: MarkdownIt) {
		this.resetSlugCount();

		return engine.parse(text.replace(UNICODE_NEWLINE_REGEX, ''), {});
	}

	private resetSlugCount(): void {
		this._slugCount = new Map<string, number>();
	}

	public async render(input: ITextDocument | string, resourceProvider?: WebviewResourceProvider): Promise<RenderOutput> {
		const config = this.getConfig(typeof input === 'string' ? undefined : input.uri);
		const engine = await this.getEngine(config);

		const tokens = typeof input === 'string'
			? this.tokenizeString(input, engine)
			: this.tokenizeDocument(input, config, engine);

		const env: RenderEnv = {
			containingImages: new Set<string>(),
			currentDocument: typeof input === 'string' ? undefined : input.uri,
			resourceProvider,
		};

		const html = engine.renderer.render(tokens, {
			...engine.options,
			...config
		}, env);

		return {
			html,
			containingImages: env.containingImages
		};
	}

	public async tokenize(document: ITextDocument): Promise<Token[]> {
		const config = this.getConfig(document.uri);
		const engine = await this.getEngine(config);
		return this.tokenizeDocument(document, config, engine);
	}

	public cleanCache(): void {
		this._tokenCache.clean();
	}

	private getConfig(resource?: vscode.Uri): MarkdownItConfig {
		const config = vscode.workspace.getConfiguration('markdown', resource ?? null);
		return {
			breaks: config.get<boolean>('preview.breaks', false),
			linkify: config.get<boolean>('preview.linkify', true),
			typographer: config.get<boolean>('preview.typographer', false)
		};
	}

	private addImageRenderer(md: MarkdownIt): void {
		const original = md.renderer.rules.image;
		md.renderer.rules.image = (tokens: Token[], idx: number, options, env: RenderEnv, self) => {
			const token = tokens[idx];
			const src = token.attrGet('src');
			if (src) {
				env.containingImages?.add(src);

				if (!token.attrGet('data-src')) {
					token.attrSet('src', this.toResourceUri(src, env.currentDocument, env.resourceProvider));
					token.attrSet('data-src', src);
				}
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options);
			}
		};
	}

	private addFencedRenderer(md: MarkdownIt): void {
		const original = md.renderer.rules['fenced'];
		md.renderer.rules['fenced'] = (tokens: Token[], idx: number, options, env, self) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrJoin('class', 'hljs');
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options);
			}
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
		md.renderer.rules.heading_open = (tokens: Token[], idx: number, options, env, self) => {
			const title = tokens[idx + 1].children!.reduce<string>((acc, t) => acc + t.content, '');
			let slug = this.slugifier.fromHeading(title);

			if (this._slugCount.has(slug.value)) {
				const count = this._slugCount.get(slug.value)!;
				this._slugCount.set(slug.value, count + 1);
				slug = this.slugifier.fromHeading(slug.value + '-' + (count + 1));
			} else {
				this._slugCount.set(slug.value, 0);
			}

			tokens[idx].attrSet('id', slug.value);

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options);
			}
		};
	}

	private addLinkRenderer(md: MarkdownIt): void {
		const original = md.renderer.rules.link_open;

		md.renderer.rules.link_open = (tokens: Token[], idx: number, options, env, self) => {
			const token = tokens[idx];
			const href = token.attrGet('href');
			// A string, including empty string, may be `href`.
			if (typeof href === 'string') {
				token.attrSet('data-href', href);
			}
			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options);
			}
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

async function getMarkdownOptions(md: () => MarkdownIt): Promise<MarkdownIt.Options> {
	const hljs = (await import('highlight.js')).default;
	return {
		html: true,
		highlight: (str: string, lang?: string) => {
			lang = normalizeHighlightLang(lang);
			if (lang && hljs.getLanguage(lang)) {
				try {
					const highlighted = hljs.highlight(str, {
						language: lang,
						ignoreIllegals: true,
					}).value;
					return `<div>${highlighted}</div>`;
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
