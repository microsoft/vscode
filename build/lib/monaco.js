/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
// PREREQUISITE:
// SET VSCODE_BUILD_DECLARATION_FILES=1
// run gulp watch once
var fs = require('fs');
var ts = require('typescript');
var path = require('path');
var SRC = path.join(__dirname, '../../src');
var OUT = path.join(__dirname, '../../out');
function moduleIdToPath(moduleId) {
    if (/\.d\.ts/.test(moduleId)) {
        return path.join(SRC, moduleId);
    }
    return path.join(OUT, moduleId) + '.d.ts';
}
var SOURCE_FILE_MAP = {};
function getSourceFile(moduleId) {
    if (!SOURCE_FILE_MAP[moduleId]) {
        var filePath = moduleIdToPath(moduleId);
        var fileContents = fs.readFileSync(filePath).toString();
        var sourceFile = ts.createSourceFile(filePath, fileContents, ts.ScriptTarget.ES5);
        SOURCE_FILE_MAP[moduleId] = sourceFile;
    }
    return SOURCE_FILE_MAP[moduleId];
}
function isDeclaration(a) {
    var tmp = a;
    return tmp.name && typeof tmp.name.text === 'string';
}
function visitTopLevelDeclarations(sourceFile, visitor) {
    var stop = false;
    var visit = function (node) {
        if (stop) {
            return;
        }
        switch (node.kind) {
            case ts.SyntaxKind.InterfaceDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.VariableStatement:
            case ts.SyntaxKind.TypeAliasDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
                stop = visitor(node);
                break;
        }
        if (node.kind !== ts.SyntaxKind.SourceFile) {
            if (getNodeText(sourceFile, node).indexOf('cursorStyleToString') >= 0) {
                console.log('FOUND TEXT IN NODE: ' + ts.SyntaxKind[node.kind]);
                console.log(getNodeText(sourceFile, node));
            }
        }
        if (stop) {
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}
function getAllTopLevelDeclarations(sourceFile) {
    var all = [];
    visitTopLevelDeclarations(sourceFile, function (node) {
        all.push(node);
        return false /*continue*/;
    });
    return all;
}
function getTopLevelDeclaration(sourceFile, typeName) {
    var result = null;
    visitTopLevelDeclarations(sourceFile, function (node) {
        if (isDeclaration(node)) {
            if (node.name.text === typeName) {
                result = node;
                return true /*stop*/;
            }
            return false /*continue*/;
        }
        // node is ts.VariableStatement
        return (getNodeText(sourceFile, node).indexOf(typeName) >= 0);
    });
    return result;
}
function getNodeText(sourceFile, node) {
    return sourceFile.getFullText().substring(node.pos, node.end);
}
function getMassagedTopLevelDeclarationText(sourceFile, declaration) {
    var result = getNodeText(sourceFile, declaration);
    result = result.replace(/export default/g, 'export');
    result = result.replace(/export declare/g, 'export');
    return result;
}
function format(text) {
    var options = getDefaultOptions();
    // Parse the source text
    var sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    var edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(options), options);
    // Apply the edits on the input code
    return applyEdits(text, edits);
    function getRuleProvider(options) {
        // Share this between multiple formatters using the same options.
        // This represents the bulk of the space the formatter uses.
        var ruleProvider = new ts.formatting.RulesProvider();
        ruleProvider.ensureUpToDate(options);
        return ruleProvider;
    }
    function applyEdits(text, edits) {
        // Apply edits in reverse on the existing text
        var result = text;
        for (var i = edits.length - 1; i >= 0; i--) {
            var change = edits[i];
            var head = result.slice(0, change.span.start);
            var tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }
    function getDefaultOptions() {
        return {
            IndentSize: 4,
            TabSize: 4,
            NewLineCharacter: '\r\n',
            ConvertTabsToSpaces: true,
            IndentStyle: ts.IndentStyle.Block,
            InsertSpaceAfterCommaDelimiter: true,
            InsertSpaceAfterSemicolonInForStatements: true,
            InsertSpaceBeforeAndAfterBinaryOperators: true,
            InsertSpaceAfterKeywordsInControlFlowStatements: true,
            InsertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
            InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
            PlaceOpenBraceOnNewLineForFunctions: false,
            PlaceOpenBraceOnNewLineForControlBlocks: false,
        };
    }
}
var recipe = fs.readFileSync(path.join(__dirname, './monaco-editor.d.ts.recipe')).toString();
var lines = recipe.split(/\r\n|\n|\r/);
var result = [];
lines.forEach(function (line) {
    var m1 = line.match(/^\s*#include\(([^\)]*)\)\:(.*)$/);
    if (m1) {
        var moduleId = m1[1];
        var sourceFile_1 = getSourceFile(moduleId);
        var typeNames = m1[2].split(/,/);
        typeNames.forEach(function (typeName) {
            typeName = typeName.trim();
            if (typeName.length === 0) {
                return;
            }
            var declaration = getTopLevelDeclaration(sourceFile_1, typeName);
            result.push(getMassagedTopLevelDeclarationText(sourceFile_1, declaration));
        });
        return;
    }
    var m2 = line.match(/^\s*#includeAll\(([^\)]*)\)\:(.*)$/);
    if (m2) {
        var moduleId = m2[1];
        var sourceFile_2 = getSourceFile(moduleId);
        var typeNames = m2[2].split(/,/);
        var typesToExclude_1 = {};
        typeNames.forEach(function (typeName) {
            typeName = typeName.trim();
            if (typeName.length === 0) {
                return;
            }
            typesToExclude_1[typeName] = true;
        });
        getAllTopLevelDeclarations(sourceFile_2).forEach(function (declaration) {
            result.push(getMassagedTopLevelDeclarationText(sourceFile_2, declaration));
        });
        return;
    }
    result.push(line);
});
var resultTxt = result.join('\n');
resultTxt = resultTxt.replace(/\beditorCommon\./g, '');
resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
resultTxt = format(resultTxt);
resultTxt = resultTxt.replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(__dirname, './monaco-editor.d.ts'), resultTxt);
