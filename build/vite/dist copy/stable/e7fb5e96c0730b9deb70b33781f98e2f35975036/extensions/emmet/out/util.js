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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowedMimeTypesInScriptTag = exports.LANGUAGE_MODES = void 0;
exports.setHomeDir = setHomeDir;
exports.getEmmetHelper = getEmmetHelper;
exports.updateEmmetExtensionsPath = updateEmmetExtensionsPath;
exports.migrateEmmetExtensionsPath = migrateEmmetExtensionsPath;
exports.isStyleSheet = isStyleSheet;
exports.validate = validate;
exports.getMappingForIncludedLanguages = getMappingForIncludedLanguages;
exports.getEmmetMode = getEmmetMode;
exports.parsePartialStylesheet = parsePartialStylesheet;
exports.getFlatNode = getFlatNode;
exports.getHtmlFlatNode = getHtmlFlatNode;
exports.setupScriptNodeSubtree = setupScriptNodeSubtree;
exports.setupCdataNodeSubtree = setupCdataNodeSubtree;
exports.isOffsetInsideOpenOrCloseTag = isOffsetInsideOpenOrCloseTag;
exports.offsetRangeToSelection = offsetRangeToSelection;
exports.offsetRangeToVsRange = offsetRangeToVsRange;
exports.getDeepestFlatNode = getDeepestFlatNode;
exports.findNextWord = findNextWord;
exports.findPrevWord = findPrevWord;
exports.getNodesInBetween = getNodesInBetween;
exports.sameNodes = sameNodes;
exports.getEmmetConfiguration = getEmmetConfiguration;
exports.iterateCSSToken = iterateCSSToken;
exports.getCssPropertyFromRule = getCssPropertyFromRule;
exports.getCssPropertyFromDocument = getCssPropertyFromDocument;
exports.getEmbeddedCssNodeIfAny = getEmbeddedCssNodeIfAny;
exports.isStyleAttribute = isStyleAttribute;
exports.isNumber = isNumber;
exports.toLSTextDocument = toLSTextDocument;
exports.getPathBaseName = getPathBaseName;
exports.getSyntaxes = getSyntaxes;
const vscode = __importStar(require("vscode"));
const html_matcher_1 = __importDefault(require("@emmetio/html-matcher"));
const css_parser_1 = __importDefault(require("@emmetio/css-parser"));
const bufferStream_1 = require("./bufferStream");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const parseDocument_1 = require("./parseDocument");
let _emmetHelper;
let _currentExtensionsPath;
let _homeDir;
function setHomeDir(homeDir) {
    _homeDir = homeDir;
}
function getEmmetHelper() {
    // Lazy load vscode-emmet-helper instead of importing it
    // directly to reduce the start-up time of the extension
    if (!_emmetHelper) {
        _emmetHelper = require('@vscode/emmet-helper');
    }
    return _emmetHelper;
}
/**
 * Update Emmet Helper to use user snippets from the extensionsPath setting
 */
function updateEmmetExtensionsPath(forceRefresh = false) {
    const helper = getEmmetHelper();
    let extensionsPath = vscode.workspace.getConfiguration('emmet').get('extensionsPath');
    if (!extensionsPath) {
        extensionsPath = [];
    }
    if (forceRefresh || _currentExtensionsPath !== extensionsPath) {
        _currentExtensionsPath = extensionsPath;
        const rootPaths = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders.map(f => f.uri) : undefined;
        const fileSystem = vscode.workspace.fs;
        helper.updateExtensionsPath(extensionsPath, fileSystem, rootPaths, _homeDir).catch(err => {
            if (Array.isArray(extensionsPath) && extensionsPath.length) {
                vscode.window.showErrorMessage(err.message);
            }
        });
    }
}
/**
 * Migrate old configuration(string) for extensionsPath to new type(string[])
 * https://github.com/microsoft/vscode/issues/117517
 */
function migrateEmmetExtensionsPath() {
    // Get the detail info of emmet.extensionsPath setting
    const config = vscode.workspace.getConfiguration().inspect('emmet.extensionsPath');
    // Update Global setting if the value type is string or the value is null
    if (typeof config?.globalValue === 'string') {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', [config.globalValue], true);
    }
    else if (config?.globalValue === null) {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', [], true);
    }
    // Update Workspace setting if the value type is string or the value is null
    if (typeof config?.workspaceValue === 'string') {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', [config.workspaceValue], false);
    }
    else if (config?.workspaceValue === null) {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', [], false);
    }
    // Update WorkspaceFolder setting if the value type is string or the value is null
    if (typeof config?.workspaceFolderValue === 'string') {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', [config.workspaceFolderValue]);
    }
    else if (config?.workspaceFolderValue === null) {
        vscode.workspace.getConfiguration().update('emmet.extensionsPath', []);
    }
}
/**
 * Mapping between languages that support Emmet and completion trigger characters
 */
exports.LANGUAGE_MODES = {
    'html': ['!', '.', '}', ':', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'jade': ['!', '.', '}', ':', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'slim': ['!', '.', '}', ':', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'haml': ['!', '.', '}', ':', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'xml': ['.', '}', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'xsl': ['!', '.', '}', '*', '$', '/', ']', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'css': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'scss': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'sass': [':', '!', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'less': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'stylus': [':', '!', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'javascriptreact': ['!', '.', '}', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'typescriptreact': ['!', '.', '}', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
};
function isStyleSheet(syntax) {
    const stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
    return stylesheetSyntaxes.includes(syntax);
}
function validate(allowStylesheet = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No editor is active');
        return false;
    }
    if (!allowStylesheet && isStyleSheet(editor.document.languageId)) {
        return false;
    }
    return true;
}
function getMappingForIncludedLanguages() {
    // Explicitly map languages that have built-in grammar in VS Code to their parent language
    // to get emmet completion support
    // For other languages, users will have to use `emmet.includeLanguages` or
    // language specific extensions can provide emmet completion support
    const MAPPED_MODES = {
        'handlebars': 'html',
        'php': 'html'
    };
    const finalMappedModes = {};
    const includeLanguagesConfig = vscode.workspace.getConfiguration('emmet').get('includeLanguages');
    const includeLanguages = Object.assign({}, MAPPED_MODES, includeLanguagesConfig ?? {});
    Object.keys(includeLanguages).forEach(syntax => {
        if (typeof includeLanguages[syntax] === 'string' && exports.LANGUAGE_MODES[includeLanguages[syntax]]) {
            finalMappedModes[syntax] = includeLanguages[syntax];
        }
    });
    return finalMappedModes;
}
/**
* Get the corresponding emmet mode for given vscode language mode
* E.g.: jsx for typescriptreact/javascriptreact or pug for jade
* If the language is not supported by emmet or has been excluded via `excludeLanguages` setting,
* then nothing is returned
*
* @param excludedLanguages Array of language ids that user has chosen to exclude for emmet
*/
function getEmmetMode(language, mappedModes, excludedLanguages) {
    if (!language || excludedLanguages.includes(language)) {
        return;
    }
    if (language === 'jsx-tags') {
        language = 'javascriptreact';
    }
    if (mappedModes[language]) {
        language = mappedModes[language];
    }
    if (/\b(typescriptreact|javascriptreact|jsx-tags)\b/.test(language)) { // treat tsx like jsx
        language = 'jsx';
    }
    else if (language === 'sass-indented') { // map sass-indented to sass
        language = 'sass';
    }
    else if (language === 'jade' || language === 'pug') {
        language = 'pug';
    }
    const syntaxes = getSyntaxes();
    if (syntaxes.markup.includes(language) || syntaxes.stylesheet.includes(language)) {
        return language;
    }
    return;
}
const closeBrace = 125;
const openBrace = 123;
const slash = 47;
const star = 42;
/**
 * Traverse the given document backward & forward from given position
 * to find a complete ruleset, then parse just that to return a Stylesheet
 * @param document vscode.TextDocument
 * @param position vscode.Position
 */
function parsePartialStylesheet(document, position) {
    const isCSS = document.languageId === 'css';
    const positionOffset = document.offsetAt(position);
    let startOffset = 0;
    let endOffset = document.getText().length;
    const limitCharacter = positionOffset - 5000;
    const limitOffset = limitCharacter > 0 ? limitCharacter : startOffset;
    const stream = new bufferStream_1.DocumentStreamReader(document, positionOffset);
    function findOpeningCommentBeforePosition(pos) {
        const text = document.getText().substring(0, pos);
        const offset = text.lastIndexOf('/*');
        if (offset === -1) {
            return;
        }
        return offset;
    }
    function findClosingCommentAfterPosition(pos) {
        const text = document.getText().substring(pos);
        let offset = text.indexOf('*/');
        if (offset === -1) {
            return;
        }
        offset += 2 + pos;
        return offset;
    }
    function consumeLineCommentBackwards() {
        const posLineNumber = document.positionAt(stream.pos).line;
        if (!isCSS && currentLine !== posLineNumber) {
            currentLine = posLineNumber;
            const startLineComment = document.lineAt(currentLine).text.indexOf('//');
            if (startLineComment > -1) {
                stream.pos = document.offsetAt(new vscode.Position(currentLine, startLineComment));
            }
        }
    }
    function consumeBlockCommentBackwards() {
        if (!stream.sof() && stream.peek() === slash) {
            if (stream.backUp(1) === star) {
                stream.pos = findOpeningCommentBeforePosition(stream.pos) ?? startOffset;
            }
            else {
                stream.next();
            }
        }
    }
    function consumeCommentForwards() {
        if (stream.eat(slash)) {
            if (stream.eat(slash) && !isCSS) {
                const posLineNumber = document.positionAt(stream.pos).line;
                stream.pos = document.offsetAt(new vscode.Position(posLineNumber + 1, 0));
            }
            else if (stream.eat(star)) {
                stream.pos = findClosingCommentAfterPosition(stream.pos) ?? endOffset;
            }
        }
    }
    // Go forward until we find a closing brace.
    while (!stream.eof() && !stream.eat(closeBrace)) {
        if (stream.peek() === slash) {
            consumeCommentForwards();
        }
        else {
            stream.next();
        }
    }
    if (!stream.eof()) {
        endOffset = stream.pos;
    }
    stream.pos = positionOffset;
    let openBracesToFind = 1;
    let currentLine = position.line;
    let exit = false;
    // Go back until we found an opening brace. If we find a closing one, consume its pair and continue.
    while (!exit && openBracesToFind > 0 && !stream.sof()) {
        consumeLineCommentBackwards();
        switch (stream.backUp(1)) {
            case openBrace:
                openBracesToFind--;
                break;
            case closeBrace:
                if (isCSS) {
                    stream.next();
                    startOffset = stream.pos;
                    exit = true;
                }
                else {
                    openBracesToFind++;
                }
                break;
            case slash:
                consumeBlockCommentBackwards();
                break;
            default:
                break;
        }
        if (position.line - document.positionAt(stream.pos).line > 100
            || stream.pos <= limitOffset) {
            exit = true;
        }
    }
    // We are at an opening brace. We need to include its selector.
    currentLine = document.positionAt(stream.pos).line;
    openBracesToFind = 0;
    let foundSelector = false;
    while (!exit && !stream.sof() && !foundSelector && openBracesToFind >= 0) {
        consumeLineCommentBackwards();
        const ch = stream.backUp(1);
        if (/\s/.test(String.fromCharCode(ch))) {
            continue;
        }
        switch (ch) {
            case slash:
                consumeBlockCommentBackwards();
                break;
            case closeBrace:
                openBracesToFind++;
                break;
            case openBrace:
                openBracesToFind--;
                break;
            default:
                if (!openBracesToFind) {
                    foundSelector = true;
                }
                break;
        }
        if (!stream.sof() && foundSelector) {
            startOffset = stream.pos;
        }
    }
    try {
        const buffer = ' '.repeat(startOffset) + document.getText().substring(startOffset, endOffset);
        return (0, css_parser_1.default)(buffer);
    }
    catch (e) {
        return;
    }
}
/**
 * Returns node corresponding to given position in the given root node
 */
function getFlatNode(root, offset, includeNodeBoundary) {
    if (!root) {
        return;
    }
    function getFlatNodeChild(child) {
        if (!child) {
            return;
        }
        const nodeStart = child.start;
        const nodeEnd = child.end;
        if ((nodeStart < offset && nodeEnd > offset)
            || (includeNodeBoundary && nodeStart <= offset && nodeEnd >= offset)) {
            return getFlatNodeChildren(child.children) ?? child;
        }
        else if ('close' in child) {
            // We have an HTML node in this case.
            // In case this node is an invalid unpaired HTML node,
            // we still want to search its children
            const htmlChild = child;
            if (htmlChild.open && !htmlChild.close) {
                return getFlatNodeChildren(htmlChild.children);
            }
        }
        return;
    }
    function getFlatNodeChildren(children) {
        for (let i = 0; i < children.length; i++) {
            const foundChild = getFlatNodeChild(children[i]);
            if (foundChild) {
                return foundChild;
            }
        }
        return;
    }
    return getFlatNodeChildren(root.children);
}
exports.allowedMimeTypesInScriptTag = ['text/html', 'text/plain', 'text/x-template', 'text/template', 'text/ng-template'];
/**
 * Finds the HTML node within an HTML document at a given position
 * If position is inside a script tag of type template, then it will be parsed to find the inner HTML node as well
 */
function getHtmlFlatNode(documentText, root, offset, includeNodeBoundary) {
    let currentNode = getFlatNode(root, offset, includeNodeBoundary);
    if (!currentNode) {
        return;
    }
    // If the currentNode is a script one, first set up its subtree and then find HTML node.
    if (currentNode.name === 'script' && currentNode.children.length === 0) {
        const scriptNodeBody = setupScriptNodeSubtree(documentText, currentNode);
        if (scriptNodeBody) {
            currentNode = getHtmlFlatNode(scriptNodeBody, currentNode, offset, includeNodeBoundary) ?? currentNode;
        }
    }
    else if (currentNode.type === 'cdata') {
        const cdataBody = setupCdataNodeSubtree(documentText, currentNode);
        currentNode = getHtmlFlatNode(cdataBody, currentNode, offset, includeNodeBoundary) ?? currentNode;
    }
    return currentNode;
}
function setupScriptNodeSubtree(documentText, scriptNode) {
    const isTemplateScript = scriptNode.name === 'script' &&
        (scriptNode.attributes &&
            scriptNode.attributes.some(x => x.name.toString() === 'type'
                && exports.allowedMimeTypesInScriptTag.includes(x.value.toString())));
    if (isTemplateScript
        && scriptNode.open) {
        // blank out the rest of the document and generate the subtree.
        const beforePadding = ' '.repeat(scriptNode.open.end);
        const endToUse = scriptNode.close ? scriptNode.close.start : scriptNode.end;
        const scriptBodyText = beforePadding + documentText.substring(scriptNode.open.end, endToUse);
        const innerRoot = (0, html_matcher_1.default)(scriptBodyText);
        innerRoot.children.forEach(child => {
            scriptNode.children.push(child);
            child.parent = scriptNode;
        });
        return scriptBodyText;
    }
    return '';
}
function setupCdataNodeSubtree(documentText, cdataNode) {
    // blank out the rest of the document and generate the subtree.
    const cdataStart = '<![CDATA[';
    const cdataEnd = ']]>';
    const startToUse = cdataNode.start + cdataStart.length;
    const endToUse = cdataNode.end - cdataEnd.length;
    const beforePadding = ' '.repeat(startToUse);
    const cdataBody = beforePadding + documentText.substring(startToUse, endToUse);
    const innerRoot = (0, html_matcher_1.default)(cdataBody);
    innerRoot.children.forEach(child => {
        cdataNode.children.push(child);
        child.parent = cdataNode;
    });
    return cdataBody;
}
function isOffsetInsideOpenOrCloseTag(node, offset) {
    const htmlNode = node;
    if ((htmlNode.open && offset > htmlNode.open.start && offset < htmlNode.open.end)
        || (htmlNode.close && offset > htmlNode.close.start && offset < htmlNode.close.end)) {
        return true;
    }
    return false;
}
function offsetRangeToSelection(document, start, end) {
    const startPos = document.positionAt(start);
    const endPos = document.positionAt(end);
    return new vscode.Selection(startPos, endPos);
}
function offsetRangeToVsRange(document, start, end) {
    const startPos = document.positionAt(start);
    const endPos = document.positionAt(end);
    return new vscode.Range(startPos, endPos);
}
/**
 * Returns the deepest non comment node under given node
 */
function getDeepestFlatNode(node) {
    if (!node || !node.children || node.children.length === 0 || !node.children.find(x => x.type !== 'comment')) {
        return node;
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
        if (node.children[i].type !== 'comment') {
            return getDeepestFlatNode(node.children[i]);
        }
    }
    return undefined;
}
function findNextWord(propertyValue, pos) {
    let foundSpace = pos === -1;
    let foundStart = false;
    let foundEnd = false;
    let newSelectionStart;
    let newSelectionEnd;
    while (pos < propertyValue.length - 1) {
        pos++;
        if (!foundSpace) {
            if (propertyValue[pos] === ' ') {
                foundSpace = true;
            }
            continue;
        }
        if (foundSpace && !foundStart && propertyValue[pos] === ' ') {
            continue;
        }
        if (!foundStart) {
            newSelectionStart = pos;
            foundStart = true;
            continue;
        }
        if (propertyValue[pos] === ' ') {
            newSelectionEnd = pos;
            foundEnd = true;
            break;
        }
    }
    if (foundStart && !foundEnd) {
        newSelectionEnd = propertyValue.length;
    }
    return [newSelectionStart, newSelectionEnd];
}
function findPrevWord(propertyValue, pos) {
    let foundSpace = pos === propertyValue.length;
    let foundStart = false;
    let foundEnd = false;
    let newSelectionStart;
    let newSelectionEnd;
    while (pos > -1) {
        pos--;
        if (!foundSpace) {
            if (propertyValue[pos] === ' ') {
                foundSpace = true;
            }
            continue;
        }
        if (foundSpace && !foundEnd && propertyValue[pos] === ' ') {
            continue;
        }
        if (!foundEnd) {
            newSelectionEnd = pos + 1;
            foundEnd = true;
            continue;
        }
        if (propertyValue[pos] === ' ') {
            newSelectionStart = pos + 1;
            foundStart = true;
            break;
        }
    }
    if (foundEnd && !foundStart) {
        newSelectionStart = 0;
    }
    return [newSelectionStart, newSelectionEnd];
}
function getNodesInBetween(node1, node2) {
    // Same node
    if (sameNodes(node1, node2)) {
        return [node1];
    }
    // Not siblings
    if (!sameNodes(node1.parent, node2.parent)) {
        // node2 is ancestor of node1
        if (node2.start < node1.start) {
            return [node2];
        }
        // node1 is ancestor of node2
        if (node2.start < node1.end) {
            return [node1];
        }
        // Get the highest ancestor of node1 that should be commented
        while (node1.parent && node1.parent.end < node2.start) {
            node1 = node1.parent;
        }
        // Get the highest ancestor of node2 that should be commented
        while (node2.parent && node2.parent.start > node1.start) {
            node2 = node2.parent;
        }
    }
    const siblings = [];
    let currentNode = node1;
    const position = node2.end;
    while (currentNode && position > currentNode.start) {
        siblings.push(currentNode);
        currentNode = currentNode.nextSibling;
    }
    return siblings;
}
function sameNodes(node1, node2) {
    // return true if they're both undefined
    if (!node1 && !node2) {
        return true;
    }
    // return false if only one of them is undefined
    if (!node1 || !node2) {
        return false;
    }
    return node1.start === node2.start && node1.end === node2.end;
}
function getEmmetConfiguration(syntax) {
    const emmetConfig = vscode.workspace.getConfiguration('emmet');
    const syntaxProfiles = Object.assign({}, emmetConfig['syntaxProfiles'] || {});
    const preferences = Object.assign({}, emmetConfig['preferences'] || {});
    // jsx, xml and xsl syntaxes need to have self closing tags unless otherwise configured by user
    if (syntax === 'jsx' || syntax === 'xml' || syntax === 'xsl') {
        syntaxProfiles[syntax] = syntaxProfiles[syntax] || {};
        if (typeof syntaxProfiles[syntax] === 'object'
            && !syntaxProfiles[syntax].hasOwnProperty('self_closing_tag') // Old Emmet format
            && !syntaxProfiles[syntax].hasOwnProperty('selfClosingStyle') // Emmet 2.0 format
        ) {
            syntaxProfiles[syntax] = {
                ...syntaxProfiles[syntax],
                selfClosingStyle: syntax === 'jsx' ? 'xhtml' : 'xml'
            };
        }
    }
    return {
        preferences,
        showExpandedAbbreviation: emmetConfig['showExpandedAbbreviation'],
        showAbbreviationSuggestions: emmetConfig['showAbbreviationSuggestions'],
        syntaxProfiles,
        variables: emmetConfig['variables'],
        excludeLanguages: emmetConfig['excludeLanguages'],
        showSuggestionsAsSnippets: emmetConfig['showSuggestionsAsSnippets']
    };
}
/**
 * Itereates by each child, as well as nested child's children, in their order
 * and invokes `fn` for each. If `fn` function returns `false`, iteration stops
 */
function iterateCSSToken(token, fn) {
    for (let i = 0, il = token.size; i < il; i++) {
        if (fn(token.item(i)) === false || iterateCSSToken(token.item(i), fn) === false) {
            return false;
        }
    }
    return true;
}
/**
 * Returns `name` CSS property from given `rule`
 */
function getCssPropertyFromRule(rule, name) {
    return rule.children.find(node => node.type === 'property' && node.name === name);
}
/**
 * Returns css property under caret in given editor or `null` if such node cannot
 * be found
 */
function getCssPropertyFromDocument(editor, position) {
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    const offset = document.offsetAt(position);
    const node = getFlatNode(rootNode, offset, true);
    if (isStyleSheet(editor.document.languageId)) {
        return node && node.type === 'property' ? node : null;
    }
    const htmlNode = node;
    if (htmlNode
        && htmlNode.name === 'style'
        && htmlNode.open && htmlNode.close
        && htmlNode.open.end < offset
        && htmlNode.close.start > offset) {
        const buffer = ' '.repeat(htmlNode.start) +
            document.getText().substring(htmlNode.start, htmlNode.end);
        const innerRootNode = (0, css_parser_1.default)(buffer);
        const innerNode = getFlatNode(innerRootNode, offset, true);
        return (innerNode && innerNode.type === 'property') ? innerNode : null;
    }
    return null;
}
function getEmbeddedCssNodeIfAny(document, currentNode, position) {
    if (!currentNode) {
        return;
    }
    const currentHtmlNode = currentNode;
    if (currentHtmlNode && currentHtmlNode.open && currentHtmlNode.close) {
        const offset = document.offsetAt(position);
        if (currentHtmlNode.open.end < offset && offset <= currentHtmlNode.close.start) {
            if (currentHtmlNode.name === 'style') {
                const buffer = ' '.repeat(currentHtmlNode.open.end) + document.getText().substring(currentHtmlNode.open.end, currentHtmlNode.close.start);
                return (0, css_parser_1.default)(buffer);
            }
        }
    }
    return;
}
function isStyleAttribute(currentNode, offset) {
    if (!currentNode) {
        return false;
    }
    const currentHtmlNode = currentNode;
    const index = (currentHtmlNode.attributes || []).findIndex(x => x.name.toString() === 'style');
    if (index === -1) {
        return false;
    }
    const styleAttribute = currentHtmlNode.attributes[index];
    return offset >= styleAttribute.value.start && offset <= styleAttribute.value.end;
}
function isNumber(obj) {
    return typeof obj === 'number';
}
function toLSTextDocument(doc) {
    return vscode_languageserver_textdocument_1.TextDocument.create(doc.uri.toString(), doc.languageId, doc.version, doc.getText());
}
function getPathBaseName(path) {
    const pathAfterSlashSplit = path.split('/').pop();
    const pathAfterBackslashSplit = pathAfterSlashSplit ? pathAfterSlashSplit.split('\\').pop() : '';
    return pathAfterBackslashSplit ?? '';
}
function getSyntaxes() {
    /**
     * List of all known syntaxes, from emmetio/emmet
     */
    return {
        markup: ['html', 'xml', 'xsl', 'jsx', 'js', 'pug', 'slim', 'haml'],
        stylesheet: ['css', 'sass', 'scss', 'less', 'sss', 'stylus']
    };
}
//# sourceMappingURL=util.js.map