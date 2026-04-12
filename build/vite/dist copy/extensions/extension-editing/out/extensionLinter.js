"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionLinter = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const url_1 = require("url");
const jsonc_parser_1 = require("jsonc-parser");
const vscode_1 = require("vscode");
const extensionEngineValidation_1 = require("./extensionEngineValidation");
const jsonReconstruct_1 = require("./jsonReconstruct");
const constants_1 = require("./constants");
const product = JSON.parse(fs.readFileSync(path.join(vscode_1.env.appRoot, 'product.json'), { encoding: 'utf-8' }));
const allowedBadgeProviders = (product.extensionAllowedBadgeProviders || []).map((s) => s.toLowerCase());
const allowedBadgeProvidersRegex = (product.extensionAllowedBadgeProvidersRegex || []).map((r) => new RegExp(r));
const extensionEnabledApiProposals = product.extensionEnabledApiProposals ?? {};
const reservedImplicitActivationEventPrefixes = ['onNotebookSerializer:'];
const redundantImplicitActivationEventPrefixes = ['onLanguage:', 'onView:', 'onAuthenticationRequest:', 'onCommand:', 'onCustomEditor:', 'onTerminalProfile:', 'onRenderer:', 'onTerminalQuickFixRequest:', 'onWalkthrough:'];
function isTrustedSVGSource(uri) {
    return allowedBadgeProviders.includes(uri.authority.toLowerCase()) || allowedBadgeProvidersRegex.some(r => r.test(uri.toString()));
}
const httpsRequired = vscode_1.l10n.t("Images must use the HTTPS protocol.");
const svgsNotValid = vscode_1.l10n.t("SVGs are not a valid image source.");
const embeddedSvgsNotValid = vscode_1.l10n.t("Embedded SVGs are not a valid image source.");
const dataUrlsNotValid = vscode_1.l10n.t("Data URLs are not a valid image source.");
const relativeUrlRequiresHttpsRepository = vscode_1.l10n.t("Relative image URLs require a repository with HTTPS protocol to be specified in the package.json.");
const relativeBadgeUrlRequiresHttpsRepository = vscode_1.l10n.t("Relative badge URLs require a repository with HTTPS protocol to be specified in this package.json.");
const apiProposalNotListed = vscode_1.l10n.t("This proposal cannot be used because for this extension the product defines a fixed set of API proposals. You can test your extension but before publishing you MUST reach out to the VS Code team.");
const starActivation = vscode_1.l10n.t("Using '*' activation is usually a bad idea as it impacts performance.");
const parsingErrorHeader = vscode_1.l10n.t("Error parsing the when-clause:");
var Context;
(function (Context) {
    Context[Context["ICON"] = 0] = "ICON";
    Context[Context["BADGE"] = 1] = "BADGE";
    Context[Context["MARKDOWN"] = 2] = "MARKDOWN";
})(Context || (Context = {}));
class ExtensionLinter {
    diagnosticsCollection = vscode_1.languages.createDiagnosticCollection('extension-editing');
    fileWatcher = vscode_1.workspace.createFileSystemWatcher('**/package.json');
    disposables = [this.diagnosticsCollection, this.fileWatcher];
    folderToPackageJsonInfo = {};
    packageJsonQ = new Set();
    readmeQ = new Set();
    timer;
    markdownIt;
    parse5;
    constructor() {
        this.disposables.push(vscode_1.workspace.onDidOpenTextDocument(document => this.queue(document)), vscode_1.workspace.onDidChangeTextDocument(event => this.queue(event.document)), vscode_1.workspace.onDidCloseTextDocument(document => this.clear(document)), this.fileWatcher.onDidChange(uri => this.packageJsonChanged(this.getUriFolder(uri))), this.fileWatcher.onDidCreate(uri => this.packageJsonChanged(this.getUriFolder(uri))), this.fileWatcher.onDidDelete(uri => this.packageJsonChanged(this.getUriFolder(uri))));
        vscode_1.workspace.textDocuments.forEach(document => this.queue(document));
    }
    queue(document) {
        const p = document.uri.path;
        if (document.languageId === 'json' && p.endsWith('/package.json')) {
            this.packageJsonQ.add(document);
            this.startTimer();
        }
        this.queueReadme(document);
    }
    queueReadme(document) {
        const p = document.uri.path;
        if (document.languageId === 'markdown' && (p.toLowerCase().endsWith('/readme.md') || p.toLowerCase().endsWith('/changelog.md'))) {
            this.readmeQ.add(document);
            this.startTimer();
        }
    }
    startTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.lint()
                .catch(console.error);
        }, 300);
    }
    async lint() {
        await Promise.all([
            this.lintPackageJson(),
            this.lintReadme()
        ]);
    }
    async lintPackageJson() {
        for (const document of Array.from(this.packageJsonQ)) {
            this.packageJsonQ.delete(document);
            if (document.isClosed) {
                continue;
            }
            const diagnostics = [];
            const tree = (0, jsonc_parser_1.parseTree)(document.getText());
            const info = this.readPackageJsonInfo(this.getUriFolder(document.uri), tree);
            if (tree && info.isExtension) {
                const icon = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['icon']);
                if (icon && icon.type === 'string') {
                    this.addDiagnostics(diagnostics, document, icon.offset + 1, icon.offset + icon.length - 1, icon.value, Context.ICON, info);
                }
                const badges = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['badges']);
                if (badges && badges.type === 'array' && badges.children) {
                    badges.children.map(child => (0, jsonc_parser_1.findNodeAtLocation)(child, ['url']))
                        .filter(url => url && url.type === 'string')
                        .map(url => this.addDiagnostics(diagnostics, document, url.offset + 1, url.offset + url.length - 1, url.value, Context.BADGE, info));
                }
                const publisher = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['publisher']);
                const name = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['name']);
                const enabledApiProposals = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['enabledApiProposals']);
                if (publisher?.type === 'string' && name?.type === 'string' && enabledApiProposals?.type === 'array') {
                    const extensionId = `${(0, jsonc_parser_1.getNodeValue)(publisher)}.${(0, jsonc_parser_1.getNodeValue)(name)}`;
                    const effectiveProposalNames = extensionEnabledApiProposals[extensionId];
                    if (Array.isArray(effectiveProposalNames) && enabledApiProposals.children) {
                        for (const child of enabledApiProposals.children) {
                            const proposalName = child.type === 'string' ? (0, jsonc_parser_1.getNodeValue)(child) : undefined;
                            if (typeof proposalName === 'string' && !effectiveProposalNames.includes(proposalName.split('@')[0])) {
                                const start = document.positionAt(child.offset);
                                const end = document.positionAt(child.offset + child.length);
                                diagnostics.push(new vscode_1.Diagnostic(new vscode_1.Range(start, end), apiProposalNotListed, vscode_1.DiagnosticSeverity.Error));
                            }
                        }
                    }
                }
                const activationEventsNode = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['activationEvents']);
                if (activationEventsNode?.type === 'array' && activationEventsNode.children) {
                    for (const activationEventNode of activationEventsNode.children) {
                        const activationEvent = (0, jsonc_parser_1.getNodeValue)(activationEventNode);
                        const isImplicitActivationSupported = info.engineVersion && (info.engineVersion.majorBase > 1 || (info.engineVersion.majorBase === 1 && info.engineVersion.minorBase >= 75));
                        // Redundant Implicit Activation
                        if (isImplicitActivationSupported && info.implicitActivationEvents?.has(activationEvent) && redundantImplicitActivationEventPrefixes.some((prefix) => activationEvent.startsWith(prefix))) {
                            const start = document.positionAt(activationEventNode.offset);
                            const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
                            diagnostics.push(new vscode_1.Diagnostic(new vscode_1.Range(start, end), constants_1.redundantImplicitActivationEvent, vscode_1.DiagnosticSeverity.Warning));
                        }
                        // Reserved Implicit Activation
                        for (const implicitActivationEventPrefix of reservedImplicitActivationEventPrefixes) {
                            if (isImplicitActivationSupported && activationEvent.startsWith(implicitActivationEventPrefix)) {
                                const start = document.positionAt(activationEventNode.offset);
                                const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
                                diagnostics.push(new vscode_1.Diagnostic(new vscode_1.Range(start, end), constants_1.implicitActivationEvent, vscode_1.DiagnosticSeverity.Error));
                            }
                        }
                        // Star activation
                        if (activationEvent === '*') {
                            const start = document.positionAt(activationEventNode.offset);
                            const end = document.positionAt(activationEventNode.offset + activationEventNode.length);
                            const diagnostic = new vscode_1.Diagnostic(new vscode_1.Range(start, end), starActivation, vscode_1.DiagnosticSeverity.Information);
                            diagnostic.code = {
                                value: 'star-activation',
                                target: vscode_1.Uri.parse('https://code.visualstudio.com/api/references/activation-events#Start-up'),
                            };
                            diagnostics.push(diagnostic);
                        }
                    }
                }
                const whenClauseLinting = await this.lintWhenClauses((0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes']), document);
                diagnostics.push(...whenClauseLinting);
            }
            this.diagnosticsCollection.set(document.uri, diagnostics);
        }
    }
    /** lints `when` and `enablement` clauses */
    async lintWhenClauses(contributesNode, document) {
        if (!contributesNode) {
            return [];
        }
        const whenClauses = [];
        function findWhens(node, clauseName) {
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
            (0, jsonc_parser_1.findNodeAtLocation)(contributesNode, ['menus']),
            (0, jsonc_parser_1.findNodeAtLocation)(contributesNode, ['views']),
            (0, jsonc_parser_1.findNodeAtLocation)(contributesNode, ['viewsWelcome']),
            (0, jsonc_parser_1.findNodeAtLocation)(contributesNode, ['keybindings']),
        ].forEach(n => findWhens(n, 'when'));
        findWhens((0, jsonc_parser_1.findNodeAtLocation)(contributesNode, ['commands']), 'enablement');
        const parseResults = await vscode_1.commands.executeCommand('_validateWhenClauses', whenClauses.map(w => w.value /* we make sure to capture only if `w.value` is string above */));
        const diagnostics = [];
        for (let i = 0; i < parseResults.length; ++i) {
            const whenClauseJSONNode = whenClauses[i];
            const jsonStringScanner = new jsonReconstruct_1.JsonStringScanner(document.getText(), whenClauseJSONNode.offset + 1);
            for (const error of parseResults[i]) {
                const realOffset = jsonStringScanner.getOffsetInEncoded(error.offset);
                const realOffsetEnd = jsonStringScanner.getOffsetInEncoded(error.offset + error.length);
                const start = document.positionAt(realOffset /* +1 to account for the quote (I think) */);
                const end = document.positionAt(realOffsetEnd);
                const errMsg = `${parsingErrorHeader}\n\n${error.errorMessage}`;
                const diagnostic = new vscode_1.Diagnostic(new vscode_1.Range(start, end), errMsg, vscode_1.DiagnosticSeverity.Error);
                diagnostic.code = {
                    value: 'See docs',
                    target: vscode_1.Uri.parse('https://code.visualstudio.com/api/references/when-clause-contexts'),
                };
                diagnostics.push(diagnostic);
            }
        }
        return diagnostics;
    }
    async lintReadme() {
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
                this.markdownIt = new ((await Promise.resolve().then(() => __importStar(require('markdown-it')))).default);
            }
            const tokens = this.markdownIt.parse(text, {});
            const tokensAndPositions = (function toTokensAndPositions(tokens, begin = 0, end = text.length) {
                const tokensAndPositions = tokens.map(token => {
                    if (token.map) {
                        const tokenBegin = document.offsetAt(new vscode_1.Position(token.map[0], 0));
                        const tokenEnd = begin = document.offsetAt(new vscode_1.Position(token.map[1], 0));
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
                return tokensAndPositions.concat(...tokensAndPositions.filter(tnp => tnp.token.children && tnp.token.children.length)
                    .map(tnp => toTokensAndPositions.call(this, tnp.token.children ?? [], tnp.begin, tnp.end)));
            }).call(this, tokens);
            const diagnostics = [];
            tokensAndPositions.filter(tnp => tnp.token.type === 'image' && tnp.token.attrGet('src'))
                .map(inp => {
                const src = inp.token.attrGet('src');
                const begin = text.indexOf(src, inp.begin);
                if (begin !== -1 && begin < inp.end) {
                    this.addDiagnostics(diagnostics, document, begin, begin + src.length, src, Context.MARKDOWN, info);
                }
                else {
                    const content = inp.token.content;
                    const begin = text.indexOf(content, inp.begin);
                    if (begin !== -1 && begin < inp.end) {
                        this.addDiagnostics(diagnostics, document, begin, begin + content.length, src, Context.MARKDOWN, info);
                    }
                }
            });
            let svgStart;
            for (const tnp of tokensAndPositions) {
                if (tnp.token.type === 'text' && tnp.token.content) {
                    if (!this.parse5) {
                        this.parse5 = await Promise.resolve().then(() => __importStar(require('parse5')));
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
                        }
                        else if (name === 'svg' && location) {
                            const begin = tnp.begin + location.startOffset;
                            const end = tnp.begin + location.endOffset;
                            const range = new vscode_1.Range(document.positionAt(begin), document.positionAt(end));
                            svgStart = new vscode_1.Diagnostic(range, embeddedSvgsNotValid, vscode_1.DiagnosticSeverity.Warning);
                            diagnostics.push(svgStart);
                        }
                    });
                    parser.on('endTag', (name, location) => {
                        if (name === 'svg' && svgStart && location) {
                            const end = tnp.begin + location.endOffset;
                            svgStart.range = new vscode_1.Range(svgStart.range.start, document.positionAt(end));
                        }
                    });
                    parser.write(tnp.token.content);
                    parser.end();
                }
            }
            this.diagnosticsCollection.set(document.uri, diagnostics);
        }
    }
    locateToken(text, begin, end, token, content) {
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
    readPackageJsonInfo(folder, tree) {
        const engine = tree && (0, jsonc_parser_1.findNodeAtLocation)(tree, ['engines', 'vscode']);
        const parsedEngineVersion = engine?.type === 'string' ? (0, extensionEngineValidation_1.normalizeVersion)((0, extensionEngineValidation_1.parseVersion)(engine.value)) : null;
        const repo = tree && (0, jsonc_parser_1.findNodeAtLocation)(tree, ['repository', 'url']);
        const uri = repo && parseUri(repo.value);
        const activationEvents = tree && parseImplicitActivationEvents(tree);
        const info = {
            isExtension: !!(engine && engine.type === 'string'),
            hasHttpsRepository: !!(repo && repo.type === 'string' && repo.value && uri && uri.scheme.toLowerCase() === 'https'),
            repository: uri,
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
    async loadPackageJson(folder) {
        if (folder.scheme === 'git') { // #36236
            return undefined;
        }
        const file = folder.with({ path: path.posix.join(folder.path, 'package.json') });
        try {
            const fileContents = await vscode_1.workspace.fs.readFile(file); // #174888
            return (0, jsonc_parser_1.parseTree)(Buffer.from(fileContents).toString('utf-8'));
        }
        catch (err) {
            return undefined;
        }
    }
    packageJsonChanged(folder) {
        delete this.folderToPackageJsonInfo[folder.toString()];
        const str = folder.toString().toLowerCase();
        vscode_1.workspace.textDocuments.filter(document => this.getUriFolder(document.uri).toString().toLowerCase() === str)
            .forEach(document => this.queueReadme(document));
    }
    getUriFolder(uri) {
        return uri.with({ path: path.posix.dirname(uri.path) });
    }
    addDiagnostics(diagnostics, document, begin, end, src, context, info) {
        const hasScheme = /^\w[\w\d+.-]*:/.test(src);
        const uri = parseUri(src, info.repository ? info.repository.toString() : document.uri.toString());
        if (!uri) {
            return;
        }
        const scheme = uri.scheme.toLowerCase();
        if (hasScheme && scheme !== 'https' && scheme !== 'data') {
            const range = new vscode_1.Range(document.positionAt(begin), document.positionAt(end));
            diagnostics.push(new vscode_1.Diagnostic(range, httpsRequired, vscode_1.DiagnosticSeverity.Warning));
        }
        if (hasScheme && scheme === 'data') {
            const range = new vscode_1.Range(document.positionAt(begin), document.positionAt(end));
            diagnostics.push(new vscode_1.Diagnostic(range, dataUrlsNotValid, vscode_1.DiagnosticSeverity.Warning));
        }
        if (!hasScheme && !info.hasHttpsRepository && context !== Context.ICON) {
            const range = new vscode_1.Range(document.positionAt(begin), document.positionAt(end));
            const message = (() => {
                switch (context) {
                    case Context.BADGE: return relativeBadgeUrlRequiresHttpsRepository;
                    default: return relativeUrlRequiresHttpsRepository;
                }
            })();
            diagnostics.push(new vscode_1.Diagnostic(range, message, vscode_1.DiagnosticSeverity.Warning));
        }
        if (uri.path.toLowerCase().endsWith('.svg') && !isTrustedSVGSource(uri)) {
            const range = new vscode_1.Range(document.positionAt(begin), document.positionAt(end));
            diagnostics.push(new vscode_1.Diagnostic(range, svgsNotValid, vscode_1.DiagnosticSeverity.Warning));
        }
    }
    clear(document) {
        this.diagnosticsCollection.delete(document.uri);
        this.packageJsonQ.delete(document);
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.ExtensionLinter = ExtensionLinter;
function parseUri(src, base, retry = true) {
    try {
        const url = new url_1.URL(src, base);
        return vscode_1.Uri.parse(url.toString());
    }
    catch (err) {
        if (retry) {
            return parseUri(encodeURI(src), base, false);
        }
        else {
            return null;
        }
    }
}
function parseImplicitActivationEvents(tree) {
    const activationEvents = new Set();
    // commands
    const commands = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'commands']);
    commands?.children?.forEach(child => {
        const command = (0, jsonc_parser_1.findNodeAtLocation)(child, ['command']);
        if (command && command.type === 'string') {
            activationEvents.add(`onCommand:${command.value}`);
        }
    });
    // authenticationProviders
    const authenticationProviders = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'authentication']);
    authenticationProviders?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        if (id && id.type === 'string') {
            activationEvents.add(`onAuthenticationRequest:${id.value}`);
        }
    });
    // languages
    const languageContributions = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'languages']);
    languageContributions?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        const configuration = (0, jsonc_parser_1.findNodeAtLocation)(child, ['configuration']);
        if (id && id.type === 'string' && configuration && configuration.type === 'string') {
            activationEvents.add(`onLanguage:${id.value}`);
        }
    });
    // customEditors
    const customEditors = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'customEditors']);
    customEditors?.children?.forEach(child => {
        const viewType = (0, jsonc_parser_1.findNodeAtLocation)(child, ['viewType']);
        if (viewType && viewType.type === 'string') {
            activationEvents.add(`onCustomEditor:${viewType.value}`);
        }
    });
    // views
    const viewContributions = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'views']);
    viewContributions?.children?.forEach(viewContribution => {
        const views = viewContribution.children?.find((node) => node.type === 'array');
        views?.children?.forEach(view => {
            const id = (0, jsonc_parser_1.findNodeAtLocation)(view, ['id']);
            if (id && id.type === 'string') {
                activationEvents.add(`onView:${id.value}`);
            }
        });
    });
    // walkthroughs
    const walkthroughs = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'walkthroughs']);
    walkthroughs?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        if (id && id.type === 'string') {
            activationEvents.add(`onWalkthrough:${id.value}`);
        }
    });
    // notebookRenderers
    const notebookRenderers = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'notebookRenderer']);
    notebookRenderers?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        if (id && id.type === 'string') {
            activationEvents.add(`onRenderer:${id.value}`);
        }
    });
    // terminalProfiles
    const terminalProfiles = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'terminal', 'profiles']);
    terminalProfiles?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        if (id && id.type === 'string') {
            activationEvents.add(`onTerminalProfile:${id.value}`);
        }
    });
    // terminalQuickFixes
    const terminalQuickFixes = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'terminal', 'quickFixes']);
    terminalQuickFixes?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['id']);
        if (id && id.type === 'string') {
            activationEvents.add(`onTerminalQuickFixRequest:${id.value}`);
        }
    });
    // tasks
    const tasks = (0, jsonc_parser_1.findNodeAtLocation)(tree, ['contributes', 'taskDefinitions']);
    tasks?.children?.forEach(child => {
        const id = (0, jsonc_parser_1.findNodeAtLocation)(child, ['type']);
        if (id && id.type === 'string') {
            activationEvents.add(`onTaskType:${id.value}`);
        }
    });
    return activationEvents;
}
//# sourceMappingURL=extensionLinter.js.map