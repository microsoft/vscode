/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';

import { parseTree, findNodeAtLocation, Node as JsonNode, getNodeValue } from 'jsonc-parser';
import * as MarkdownItType from 'markdown-it';

import { commands, languages, workspace, Disposable, TextDocument, Uri, Diagnostic, Range, DiagnosticSeverity, Position, env, l10n } from 'vscode';
import { INormalizedVersion, normalizeVersion, parseVersion } from './extensionEngineValidation';
import { JsonStringScanner } from './jsonReconstruct';
import { implicitActivationEvent, redundantImplicitActivationEvent } from './constants';

const product = JSON.parse(fs.readFileSync(path.join(env.appRoot, 'product.json'), { encoding: 'utf-8' }));
const allowedBadgeProviders: string[] = (product.extensionAllowedBadgeProviders || []).map((s: string) => s.toLowerCase());
const allowedBadgeProvidersRegex: RegExp[] = (product.extensionAllowedBadgeProvidersRegex || []).map((r: string) => new RegExp(r));
const extensionEnabledApiProposals: Record<string, string[]> = product.extensionEnabledApiProposals ?? {};
const reservedImplicitActivationEventPrefixes = ['onNotebookSerializer:'];
const redundantImplicitActivationEventPrefixes = ['onLanguage:', 'onView:', 'onAuthenticationRequest:', 'onCommand:', 'onCustomEditor:', 'onTerminalProfile:', 'onRenderer:', 'onTerminalQuickFixRequest:', 'onWalkthrough:'];

function isTrustedSVGSource(uri: Uri): boolean {
	return allowedBadgeProviders.includes(uri.authority.toLowerCase()) || allowedBadgeProvidersRegex.some(r => r.test(uri.toString()));
}

const httpsRequired = l10n.t("Images must use the HTTPS protocol.");
const svgsNotValid = l10n.t("SVGs are not a valid image source.");
const embeddedSvgsNotValid = l10n.t("Embedded SVGs are not a valid image source.");
const dataUrlsNotValid = l10n.t("Data URLs are not a valid image source.");
const relativeUrlRequiresHttpsRepository = l10n.t("Relative image URLs require a repository with HTTPS protocol to be specified in the package.json.");
const relativeBadgeUrlRequiresHttpsRepository = l10n.t("Relative badge URLs require a repository with HTTPS protocol to be specified in this package.json.");
const apiProposalNotListed = l10n.t("This proposal cannot be used because for this extension the product defines a fixed set of API proposals. You can test your extension but before publishing you MUST reach out to the VS Code team.");
const bumpEngineForImplicitActivationEvents = l10n.t("This activation event can be removed for extensions targeting engine version ^1.75 as VS Code will generate these automatically from your package.json contribution declarations.");
const starActivation = l10n.t("Using '*' activation is usually a bad idea as it impacts performance.");
const parsingErrorHeader = l10n.t("Error parsing the when-clause:");

enum Context {
	ICON,
	BADGE,
	MARKDOWN
}

interface TokenAndPosition {
	token: MarkdownItType.Token;
	begin: number;
	end: number;
}

interface PackageJsonInfo {
	isExtension: boolean;
	hasHttpsRepository: boolean;
	repository: Uri;
	implicitActivationEvents: Set<string> | undefined;
	engineVersion: INormalizedVersion | null;
}

export class ExtensionLinter {

	private diagnosticsCollection = languages.createDiagnosticCollection('extension-editing');
	private fileWatcher = workspace.createFileSystemWatcher('**/package.json');
	private disposables: Disposable[] = [this.diagnosticsCollection, this.fileWatcher];

	private folderToPackageJsonInfo: Record<string, PackageJsonInfo> = {};
	private packageJsonQ = new Set<TextDocument>();
	private readmeQ = new Set<TextDocument>();
	private timer: NodeJS.Timeout | undefined;
	private markdownIt: MarkdownItType.MarkdownIt | undefined;
	private parse5: typeof import('parse5') | undefined;

	constructor() {
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
		if (document.languageId === 'json' && p.endsWith('/package.json')) {
			this.packageJsonQ.add(document);
			this.startTimer();
		}
		this.queueReadme(document);
	}

	private queueReadme(document: TextDocument) {
		const p = document.uri.path;
		if (document.languageId === 'markdown' && (p.toLowerCase().endsWith('/readme.md') || p.toLowerCase().endsWith('/changelog.md'))) {
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
		await Promise.all([
			this.lintPackageJson(),
			this.lintReadme()
		]);
	}

	private async lintPackageJson() {
		for (const document of Array.from(this.packageJsonQ)) {
			this.packageJsonQ.delete(document);
			if (document.isClosed) {
				continue;
			}

			const diagnostics: Diagnostic[] = [];

			const tree = parseTree(document.getText());
			const info = this.readPackageJsonInfo(this.getUriFolder(document.uri), tree);
			if (tree && info.isExtension) {

				const icon = findNodeAtLocation(tree, ['icon']);
				if (icon && icon.type === 'string') {
					this.addDiagnostics(diagnostics, document, icon.offset + 1, icon.offset + icon.length - 1, icon.value, Context.ICON, info);
				}

				const badges = findNodeAtLocation(tree, ['badges']);
				if (badges && badges.type === 'array' && badges.children) {
					badges.children.map(child => findNodeAtLocation(child, ['url']))
						.filter(url => url && url.type === 'string')
						.map(url => this.addDiagnostics(diagnostics, document, url!.offset + 1, url!.offset + url!.length - 1, url!.value, Context.BADGE, info));
				}

				const publisher = findNodeAtLocation(tree, ['publisher']);
				const name = findNodeAtLocation(tree, ['name']);
				const enabledApiProposals = findNodeAtLocation(tree, ['enabledApiProposals']);
				if (publisher?.type === 'string' && name?.type === 'string' && enabledApiProposals?.type === 'array') {
					const extensionId = `${getNodeValue(publisher)}.${getNodeValue(name)}`;
					const effectiveProposalNames = extensionEnabledApiProposals[extensionId];
					if (Array.isArray(effectiveProposalNames) && enabledApiProposals.children) {
						for (const child of enabledApiProposals.children) {
							const proposalName = child.type === 'string' ? getNodeValue(child) : undefined;
							if (typeof proposalName === 'string' && !effectiveProposalNames.includes(proposalName.split('@')[0])) {
								const start = document.positionAt(child.offset);
								const end = document.positionAt(child.offset + child.length);
								diagnostics.push(new Diagnostic(new Range(start, end), apiProposalNotListed, DiagnosticSeverity.Error));
							}
						}
					}
				}
				const activationEventsNode = findNodeAtLocation(tree, ['activationEvents']);
				if (activationEventsNode?.type === 'array' && activationEventsNode.children) {
					for (const activationEventNode of activationEventsNode.children) {
						const activationEvent = getNodeValue(activationEventNode);
						const isImplicitActivationSupported = info.engineVersion && info.engineVersion?.majorBase >= 1 && info.engineVersion?.minorBase >= 75;
						// Redundant Implicit Activation
						if (info.implicitActivationEvents?.has(activationEvent) && redundantImplicitActivationEventPrefixes.some((prefix) => activationEvent.startsWith(prefix))) {
							const start = document.positionAt(activationEventNode.offset);
							const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
							const message = isImplicitActivationSupported ? redundantImplicitActivationEvent : bumpEngineForImplicitActivationEvents;
							diagnostics.push(new Diagnostic(new Range(start, end), message, isImplicitActivationSupported ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information));
						}

						// Reserved Implicit Activation
						for (const implicitActivationEventPrefix of reservedImplicitActivationEventPrefixes) {
							if (isImplicitActivationSupported && activationEvent.startsWith(implicitActivationEventPrefix)) {
								const start = document.positionAt(activationEventNode.offset);
								const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
								diagnostics.push(new Diagnostic(new Range(start, end), implicitActivationEvent, DiagnosticSeverity.Error));
							}
						}

						// Star activation
						if (activationEvent === '*') {
							const start = document.positionAt(activationEventNode.offset);
							const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
							const diagnostic = new Diagnostic(new Range(start, end), starActivation, DiagnosticSeverity.Information);
							diagnostic.code = {
								value: 'star-activation',
								target: Uri.parse('https://code.visualstudio.com/api/references/activation-events#Start-up'),
							};
							diagnostics.push(diagnostic);
						}
					}
				}

				const whenClauseLinting = await this.lintWhenClauses(findNodeAtLocation(tree, ['contributes']), document);
				diagnostics.push(...whenClauseLinting);
			}
			this.diagnosticsCollection.set(document.uri, diagnostics);
		}
	}

	/** lints `when` and `enablement` clauses */
	private async lintWhenClauses(contributesNode: JsonNode | undefined, document: TextDocument): Promise<Diagnostic[]> {
		if (!contributesNode) {
			return [];
		}

		const whenClauses: JsonNode[] = [];

		function findWhens(node: JsonNode | undefined, clauseName: string) {
			if (node) {
				switch (node.type) {
					case 'property':
						if (node.children && node.children.length === 2) {
							const key = node.children[0];
							const value = node.children[1];
							switch (value.type) {
								case 'string':
									if (key.value === clauseName && typeof value.value === 'string' /* careful: `.value` MUST be a string 1) because a when/enablement clause is string; so also, type cast to string below is safe */) {
										whenClauses.push(value);
									}
								case 'object':
								case 'array':
									findWhens(value, clauseName);
							}
						}
						break;
					case 'object':
					case 'array':
						if (node.children) {
							node.children.forEach(n => findWhens(n, clauseName));
						}
				}
			}
		}

		[
			findNodeAtLocation(contributesNode, ['menus']),
			findNodeAtLocation(contributesNode, ['views']),
			findNodeAtLocation(contributesNode, ['viewsWelcome']),
			findNodeAtLocation(contributesNode, ['keybindings']),
		].forEach(n => findWhens(n, 'when'));

		findWhens(findNodeAtLocation(contributesNode, ['commands']), 'enablement');

		const parseResults = await commands.executeCommand<{ errorMessage: string; offset: number; length: number }[][]>('_validateWhenClauses', whenClauses.map(w => w.value as string /* we make sure to capture only if `w.value` is string above */));

		const diagnostics: Diagnostic[] = [];
		for (let i = 0; i < parseResults.length; ++i) {
			const whenClauseJSONNode = whenClauses[i];

			const jsonStringScanner = new JsonStringScanner(document.getText(), whenClauseJSONNode.offset + 1);

			for (const error of parseResults[i]) {
				const realOffset = jsonStringScanner.getOffsetInEncoded(error.offset);
				const realOffsetEnd = jsonStringScanner.getOffsetInEncoded(error.offset + error.length);
				const start = document.positionAt(realOffset /* +1 to account for the quote (I think) */);
				const end = document.positionAt(realOffsetEnd);
				const errMsg = `${parsingErrorHeader}\n\n${error.errorMessage}`;
				const diagnostic = new Diagnostic(new Range(start, end), errMsg, DiagnosticSeverity.Error);
				diagnostic.code = {
					value: 'See docs',
					target: Uri.parse('https://code.visualstudio.com/api/references/when-clause-contexts'),
				};
				diagnostics.push(diagnostic);
			}
		}
		return diagnostics;
	}

	private async lintReadme() {
		for (const document of this.readmeQ) {
			this.readmeQ.delete(document);
			if (document.isClosed) {
				continue;
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
			if (!this.markdownIt) {
				this.markdownIt = new (await import('markdown-it'));
			}
			const tokens = this.markdownIt.parse(text, {});
			const tokensAndPositions: TokenAndPosition[] = (function toTokensAndPositions(this: ExtensionLinter, tokens: MarkdownItType.Token[], begin = 0, end = text.length): TokenAndPosition[] {
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
					const src = inp.token.attrGet('src')!;
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
			for (const tnp of tokensAndPositions) {
				if (tnp.token.type === 'text' && tnp.token.content) {
					if (!this.parse5) {
						this.parse5 = await import('parse5');
					}
					const parser = new this.parse5.SAXParser({ locationInfo: true });
					parser.on('startTag', (name, attrs, _selfClosing, location) => {
						if (name === 'img') {
							const src = attrs.find(a => a.name === 'src');
							if (src && src.value && location) {
								const begin = text.indexOf(src.value, tnp.begin + location.startOffset);
								if (begin !== -1 && begin < tnp.end) {
									this.addDiagnostics(diagnostics, document, begin, begin + src.value.length, src.value, Context.MARKDOWN, info);
								}
							}
						} else if (name === 'svg' && location) {
							const begin = tnp.begin + location.startOffset;
							const end = tnp.begin + location.endOffset;
							const range = new Range(document.positionAt(begin), document.positionAt(end));
							svgStart = new Diagnostic(range, embeddedSvgsNotValid, DiagnosticSeverity.Warning);
							diagnostics.push(svgStart);
						}
					});
					parser.on('endTag', (name, location) => {
						if (name === 'svg' && svgStart && location) {
							const end = tnp.begin + location.endOffset;
							svgStart.range = new Range(svgStart.range.start, document.positionAt(end));
						}
					});
					parser.write(tnp.token.content);
					parser.end();
				}
			}

			this.diagnosticsCollection.set(document.uri, diagnostics);
		}
	}

	private locateToken(text: string, begin: number, end: number, token: MarkdownItType.Token, content: string | null) {
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
		return undefined;
	}

	private readPackageJsonInfo(folder: Uri, tree: JsonNode | undefined) {
		const engine = tree && findNodeAtLocation(tree, ['engines', 'vscode']);
		const parsedEngineVersion = engine?.type === 'string' ? normalizeVersion(parseVersion(engine.value)) : null;
		const repo = tree && findNodeAtLocation(tree, ['repository', 'url']);
		const uri = repo && parseUri(repo.value);
		const activationEvents = tree && parseImplicitActivationEvents(tree);

		const info: PackageJsonInfo = {
			isExtension: !!(engine && engine.type === 'string'),
			hasHttpsRepository: !!(repo && repo.type === 'string' && repo.value && uri && uri.scheme.toLowerCase() === 'https'),
			repository: uri!,
			implicitActivationEvents: activationEvents,
			engineVersion: parsedEngineVersion
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
		if (folder.scheme === 'git') { // #36236
			return undefined;
		}
		const file = folder.with({ path: path.posix.join(folder.path, 'package.json') });
		try {
			const fileContents = await workspace.fs.readFile(file); // #174888
			return parseTree(Buffer.from(fileContents).toString('utf-8'));
		} catch (err) {
			return undefined;
		}
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
		const hasScheme = /^\w[\w\d+.-]*:/.test(src);
		const uri = parseUri(src, info.repository ? info.repository.toString() : document.uri.toString());
		if (!uri) {
			return;
		}
		const scheme = uri.scheme.toLowerCase();

		if (hasScheme && scheme !== 'https' && scheme !== 'data') {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(range, httpsRequired, DiagnosticSeverity.Warning));
		}

		if (hasScheme && scheme === 'data') {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(range, dataUrlsNotValid, DiagnosticSeverity.Warning));
		}

		if (!hasScheme && !info.hasHttpsRepository && context !== Context.ICON) {
			const range = new Range(document.positionAt(begin), document.positionAt(end));
			const message = (() => {
				switch (context) {
					case Context.BADGE: return relativeBadgeUrlRequiresHttpsRepository;
					default: return relativeUrlRequiresHttpsRepository;
				}
			})();
			diagnostics.push(new Diagnostic(range, message, DiagnosticSeverity.Warning));
		}

		if (uri.path.toLowerCase().endsWith('.svg') && !isTrustedSVGSource(uri)) {
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

function parseUri(src: string, base?: string, retry: boolean = true): Uri | null {
	try {
		const url = new URL(src, base);
		return Uri.parse(url.toString());
	} catch (err) {
		if (retry) {
			return parseUri(encodeURI(src), base, false);
		} else {
			return null;
		}
	}
}

function parseImplicitActivationEvents(tree: JsonNode): Set<string> {
	const activationEvents = new Set<string>();

	// commands
	const commands = findNodeAtLocation(tree, ['contributes', 'commands']);
	commands?.children?.forEach(child => {
		const command = findNodeAtLocation(child, ['command']);
		if (command && command.type === 'string') {
			activationEvents.add(`onCommand:${command.value}`);
		}
	});

	// authenticationProviders
	const authenticationProviders = findNodeAtLocation(tree, ['contributes', 'authentication']);
	authenticationProviders?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		if (id && id.type === 'string') {
			activationEvents.add(`onAuthenticationRequest:${id.value}`);
		}
	});

	// languages
	const languageContributions = findNodeAtLocation(tree, ['contributes', 'languages']);
	languageContributions?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		const configuration = findNodeAtLocation(child, ['configuration']);
		if (id && id.type === 'string' && configuration && configuration.type === 'string') {
			activationEvents.add(`onLanguage:${id.value}`);
		}
	});

	// customEditors
	const customEditors = findNodeAtLocation(tree, ['contributes', 'customEditors']);
	customEditors?.children?.forEach(child => {
		const viewType = findNodeAtLocation(child, ['viewType']);
		if (viewType && viewType.type === 'string') {
			activationEvents.add(`onCustomEditor:${viewType.value}`);
		}
	});

	// views
	const viewContributions = findNodeAtLocation(tree, ['contributes', 'views']);
	viewContributions?.children?.forEach(viewContribution => {
		const views = viewContribution.children?.find((node) => node.type === 'array');
		views?.children?.forEach(view => {
			const id = findNodeAtLocation(view, ['id']);
			if (id && id.type === 'string') {
				activationEvents.add(`onView:${id.value}`);
			}
		});
	});

	// walkthroughs
	const walkthroughs = findNodeAtLocation(tree, ['contributes', 'walkthroughs']);
	walkthroughs?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		if (id && id.type === 'string') {
			activationEvents.add(`onWalkthrough:${id.value}`);
		}
	});

	// notebookRenderers
	const notebookRenderers = findNodeAtLocation(tree, ['contributes', 'notebookRenderer']);
	notebookRenderers?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		if (id && id.type === 'string') {
			activationEvents.add(`onRenderer:${id.value}`);
		}
	});

	// terminalProfiles
	const terminalProfiles = findNodeAtLocation(tree, ['contributes', 'terminal', 'profiles']);
	terminalProfiles?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		if (id && id.type === 'string') {
			activationEvents.add(`onTerminalProfile:${id.value}`);
		}
	});

	// terminalQuickFixes
	const terminalQuickFixes = findNodeAtLocation(tree, ['contributes', 'terminal', 'quickFixes']);
	terminalQuickFixes?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['id']);
		if (id && id.type === 'string') {
			activationEvents.add(`onTerminalQuickFixRequest:${id.value}`);
		}
	});

	// tasks
	const tasks = findNodeAtLocation(tree, ['contributes', 'taskDefinitions']);
	tasks?.children?.forEach(child => {
		const id = findNodeAtLocation(child, ['type']);
		if (id && id.type === 'string') {
			activationEvents.add(`onTaskType:${id.value}`);
		}
	});

	return activationEvents;
}
