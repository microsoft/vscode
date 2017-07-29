/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

import { parseTree, findNodeAtLocation, Node as JsonNode } from 'jsonc-parser';
import * as nls from 'vscode-nls';
import * as MarkdownIt from 'markdown-it';
import * as parse5 from 'parse5';

import { languages, workspace, Disposable, ExtensionContext, TextDocument, Uri, Diagnostic, Range, DiagnosticSeverity, Position } from 'vscode';

const product = require('../../../product.json');
const allowedBadgeProviders: string[] = (product.extensionAllowedBadgeProviders || []).map(s => s.toLowerCase());

const localize = nls.loadMessageBundle();

const httpsRequired = localize('httpsRequired', "Images must use the HTTPS protocol.");
const svgsNotValid = localize('svgsNotValid', "SVGs are not a valid image source.");
const embeddedSvgsNotValid = localize('embeddedSvgsNotValid', "Embedded SVGs are not a valid image source.");
const dataUrlsNotValid = localize('dataUrlsNotValid', "Data URLs are not a valid image source.");
const relativeUrlRequiresHttpsRepository = localize('relativeUrlRequiresHttpsRepository', "Relative image URLs require a repository with HTTPS protocol to be specified in the package.json.");
const relativeIconUrlRequiresHttpsRepository = localize('relativeIconUrlRequiresHttpsRepository', "An icon requires a repository with HTTPS protocol to be specified in this package.json.");
const relativeBadgeUrlRequiresHttpsRepository = localize('relativeBadgeUrlRequiresHttpsRepository', "Relative badge URLs require a repository with HTTPS protocol to be specified in this package.json.");

enum Context {
	ICON,
	BADGE,
	MARKDOWN
}

interface TokenAndPosition {
	token: MarkdownIt.Token;
	begin: number;
	end: number;
}

interface PackageJsonInfo {
	isExtension: boolean;
	hasHttpsRepository: boolean;
}

export class ExtensionLinter {

	private diagnosticsCollection = languages.createDiagnosticCollection('extension-editing');
	private fileWatcher = workspace.createFileSystemWatcher('**/package.json');
	private disposables: Disposable[] = [this.diagnosticsCollection, this.fileWatcher];

	private folderToPackageJsonInfo: Record<string, PackageJsonInfo> = {};
	private packageJsonQ = new Set<TextDocument>();
	private readmeQ = new Set<TextDocument>();
	private timer: NodeJS.Timer;
	private markdownIt = new MarkdownIt();

	constructor(private context: ExtensionContext) {
		this.disposables.push(
			workspace.onDidOpenTextDocument(document => this.queue(document)),
			workspace.onDidChangeTextDocument(event => this.queue(event.document)),
			workspace.onDidCloseTextDocument(document => this.clear(document)),
			this.fileWatcher.onDidChange(uri => this.packageJsonChanged(this.getUriFolder(uri))),
			this.fileWatcher.onDidCreate(uri => this.packageJsonChanged(this.getUriFolder(uri))),
			this.fileWatcher.onDidDelete(uri => this.packageJsonChanged(this.getUriFolder(uri))),
		);
		workspace.textDocuments.forEach(document => this.queue(document));
	}

	private queue(document: TextDocument) {
		const p = document.uri.path;
		if (document.languageId === 'json' && endsWith(p, '/package.json')) {
			this.packageJsonQ.add(document);
			this.startTimer();
		}
		this.queueReadme(document);
	}

	private queueReadme(document: TextDocument) {
		const p = document.uri.path;
		if (document.languageId === 'markdown' && (endsWith(p.toLowerCase(), '/readme.md') || endsWith(p.toLowerCase(), '/changelog.md'))) {
			this.readmeQ.add(document);
			this.startTimer();
		}
	}

	private startTimer() {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.lint()
				.catch(console.error);
		}, 300);
	}

	private async lint() {
		this.lintPackageJson();
		await this.lintReadme();
	}

	private lintPackageJson() {
		this.packageJsonQ.forEach(document => {
			this.packageJsonQ.delete(document);
			if (document.isClosed) {
				return;
			}

			const diagnostics: Diagnostic[] = [];

			const tree = parseTree(document.getText());
			const info = this.readPackageJsonInfo(this.getUriFolder(document.uri), tree);
			if (info.isExtension) {

				const icon = findNodeAtLocation(tree, ['icon']);
				if (icon && icon.type === 'string') {
					this.addDiagnostics(diagnostics, document, icon.offset + 1, icon.offset + icon.length - 1, icon.value, Context.ICON, info);
				}

				const badges = findNodeAtLocation(tree, ['badges']);
				if (badges && badges.type === 'array') {
					badges.children.map(child => findNodeAtLocation(child, ['url']))
						.filter(url => url && url.type === 'string')
						.map(url => this.addDiagnostics(diagnostics, document, url.offset + 1, url.offset + url.length - 1, url.value, Context.BADGE, info));
				}

			}
			this.diagnosticsCollection.set(document.uri, diagnostics);
		});
	}

	private async lintReadme() {
		for (const document of Array.from(this.readmeQ)) {
			this.readmeQ.delete(document);
			if (document.isClosed) {
				return;
			}

			const folder = this.getUriFolder(document.uri);
			let info = this.folderToPackageJsonInfo[folder.toString()];
			if (!info) {
				const tree = await this.loadPackageJson(folder);
				info = this.readPackageJsonInfo(folder, tree);
			}
			if (!info.isExtension) {
				this.diagnosticsCollection.set(document.uri, []);
				return;
			}

			const text = document.getText();
			const tokens = this.markdownIt.parse(text, {});
			const tokensAndPositions = (function toTokensAndPositions(this: ExtensionLinter, tokens: MarkdownIt.Token[], begin = 0, end = text.length): TokenAndPosition[] {
				const tokensAndPositions = tokens.map<TokenAndPosition>(token => {
					if (token.map) {
						const tokenBegin = document.offsetAt(new Position(token.map[0], 0));
						const tokenEnd = begin = document.offsetAt(new Position(token.map[1], 0));
						return {
							token,
							begin: tokenBegin,
							end: tokenEnd
						};
					}
					const image = token.type === 'image' && this.locateToken(text, begin, end, token, token.attrGet('src'));
					const other = image || this.locateToken(text, begin, end, token, token.content);
					return other || {
						token,
						begin,
						end: begin
					};
				});
				return tokensAndPositions.concat(
					...tokensAndPositions.filter(tnp => tnp.token.children && tnp.token.children.length)
						.map(tnp => toTokensAndPositions.call(this, tnp.token.children, tnp.begin, tnp.end))
				);
			}).call(this, tokens);

			const diagnostics: Diagnostic[] = [];

			tokensAndPositions.filter(tnp => tnp.token.type === 'image' && tnp.token.attrGet('src'))
				.map(inp => {
					const src = inp.token.attrGet('src');
					const begin = text.indexOf(src, inp.begin);
					if (begin !== -1 && begin < inp.end) {
						this.addDiagnostics(diagnostics, document, begin, begin + src.length, src, Context.MARKDOWN, info);
					} else {
						const content = inp.token.content;
						const begin = text.indexOf(content, inp.begin);
						if (begin !== -1 && begin < inp.end) {
							this.addDiagnostics(diagnostics, document, begin, begin + content.length, src, Context.MARKDOWN, info);
						}
					}
				});

			let svgStart: Diagnostic;
			tokensAndPositions.filter(tnp => tnp.token.type === 'text' && tnp.token.content)
				.map(tnp => {
					const parser = new parse5.SAXParser({ locationInfo: true });
					parser.on('startTag', (name, attrs, selfClosing, location) => {
						if (name === 'img') {
							const src = attrs.find(a => a.name === 'src');
							if (src && src.value) {
								const begin = text.indexOf(src.value, tnp.begin + location.startOffset);
								if (begin !== -1 && begin < tnp.end) {
									this.addDiagnostics(diagnostics, document, begin, begin + src.value.length, src.value, Context.MARKDOWN, info);
								}
							}
						} else if (name === 'svg') {
							const begin = tnp.begin + location.startOffset;
							const end = tnp.begin + location.endOffset;
							const range = new Range(document.positionAt(begin), document.positionAt(end));
							svgStart = new Diagnostic(range, embeddedSvgsNotValid, DiagnosticSeverity.Warning);
							diagnostics.push(svgStart);
						}
					});
					parser.on('endTag', (name, location) => {
						if (name === 'svg' && svgStart) {
							const end = tnp.begin + location.endOffset;
							svgStart.range = new Range(svgStart.range.start, document.positionAt(end));
						}
					});
					parser.write(tnp.token.content);
					parser.end();
				});

			this.diagnosticsCollection.set(document.uri, diagnostics);
		};
	}

	private locateToken(text: string, begin: number, end: number, token: MarkdownIt.Token, content: string) {
		if (content) {
			const tokenBegin = text.indexOf(content, begin);
			if (tokenBegin !== -1) {
				const tokenEnd = tokenBegin + content.length;
				if (tokenEnd <= end) {
					begin = tokenEnd;
					return {
						token,
						begin: tokenBegin,
						end: tokenEnd
					};
				}
			}
		}
	}

	private readPackageJsonInfo(folder: Uri, tree: JsonNode) {
		const engine = tree && findNodeAtLocation(tree, ['engines', 'vscode']);
		const repo = tree && findNodeAtLocation(tree, ['repository', 'url']);
		const info: PackageJsonInfo = {
			isExtension: !!(engine && engine.type === 'string'),
			hasHttpsRepository: !!(repo && repo.type === 'string' && repo.value && parseUri(repo.value).scheme.toLowerCase() === 'https')
		};
		const str = folder.toString();
		const oldInfo = this.folderToPackageJsonInfo[str];
		if (oldInfo && (oldInfo.isExtension !== info.isExtension || oldInfo.hasHttpsRepository !== info.hasHttpsRepository)) {
			this.packageJsonChanged(folder); // clears this.folderToPackageJsonInfo[str]
		}
		this.folderToPackageJsonInfo[str] = info;
		return info;
	}

	private async loadPackageJson(folder: Uri) {
		const file = folder.with({ path: path.posix.join(folder.path, 'package.json') });
		const exists = await fileExists(file.fsPath);
		if (!exists) {
			return undefined;
		}
		const document = await workspace.openTextDocument(file);
		return parseTree(document.getText());
	}

	private packageJsonChanged(folder: Uri) {
		delete this.folderToPackageJsonInfo[folder.toString()];
		const str = folder.toString().toLowerCase();
		workspace.textDocuments.filter(document => this.getUriFolder(document.uri).toString().toLowerCase() === str)
			.forEach(document => this.queueReadme(document));
	}

	private getUriFolder(uri: Uri) {
		return uri.with({ path: path.posix.dirname(uri.path) });
	}

	private addDiagnostics(diagnostics: Diagnostic[], document: TextDocument, begin: number, end: number, src: string, context: Context, info: PackageJsonInfo) {
		const uri = parseUri(src);
		const scheme = uri.scheme.toLowerCase();

		if (scheme && scheme !== 'https' && scheme !== 'data') {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(range, httpsRequired, DiagnosticSeverity.Warning));
		}

		if (scheme === 'data') {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(range, dataUrlsNotValid, DiagnosticSeverity.Warning));
		}

		if (!scheme && !info.hasHttpsRepository) {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			let message = (() => {
				switch (context) {
					case Context.ICON: return relativeIconUrlRequiresHttpsRepository;
					case Context.BADGE: return relativeBadgeUrlRequiresHttpsRepository;
					default: return relativeUrlRequiresHttpsRepository;
				}
			})();
			diagnostics.push(new Diagnostic(range, message, DiagnosticSeverity.Warning));
		}

		if (endsWith(uri.path.toLowerCase(), '.svg') && allowedBadgeProviders.indexOf(uri.authority.toLowerCase()) === -1) {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(range, svgsNotValid, DiagnosticSeverity.Warning));
		}
	}

	private clear(document: TextDocument) {
		this.diagnosticsCollection.delete(document.uri);
		this.packageJsonQ.delete(document);
	}

	public dispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}

function endsWith(haystack: string, needle: string): boolean {
	let diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.indexOf(needle, diff) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

function fileExists(path: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		fs.lstat(path, (err, stats) => {
			if (!err) {
				resolve(true);
			} else if (err.code === 'ENOENT') {
				resolve(false);
			} else {
				reject(err);
			}
		});
	});
}

function parseUri(src: string) {
	try {
		return Uri.parse(src);
	} catch (err) {
		try {
			return Uri.parse(encodeURI(src));
		} catch (err) {
			return Uri.parse('');
		}
	}
}