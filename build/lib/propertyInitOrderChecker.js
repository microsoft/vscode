"use strict";
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const ts = __importStar(require("typescript"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const TS_CONFIG_PATH = path.join(__dirname, '../../', 'src', 'tsconfig.json');
//
// #############################################################################################
//
// A custom typescript checker that ensure constructor properties are NOT used to initialize
// defined properties. This is needed for the times when `useDefineForClassFields` is gone.
//
// see https://github.com/microsoft/vscode/issues/243049, https://github.com/microsoft/vscode/issues/186726,
// https://github.com/microsoft/vscode/pull/241544
//
// #############################################################################################
//
var EntryKind;
(function (EntryKind) {
    EntryKind[EntryKind["Span"] = 0] = "Span";
    EntryKind[EntryKind["Node"] = 1] = "Node";
    EntryKind[EntryKind["StringLiteral"] = 2] = "StringLiteral";
    EntryKind[EntryKind["SearchedLocalFoundProperty"] = 3] = "SearchedLocalFoundProperty";
    EntryKind[EntryKind["SearchedPropertyFoundLocal"] = 4] = "SearchedPropertyFoundLocal";
})(EntryKind || (EntryKind = {}));
const cancellationToken = {
    isCancellationRequested: () => false,
    throwIfCancellationRequested: () => { },
};
const seenFiles = new Set();
let errorCount = 0;
function createProgram(tsconfigPath) {
    const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const configHostParser = { fileExists: fs.existsSync, readDirectory: ts.sys.readDirectory, readFile: file => fs.readFileSync(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
    const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, path.resolve(path.dirname(tsconfigPath)), { noEmit: true });
    const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);
    return ts.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
}
const program = createProgram(TS_CONFIG_PATH);
program.getTypeChecker();
for (const file of program.getSourceFiles()) {
    if (!file || file.isDeclarationFile) {
        continue;
    }
    visit(file);
}
if (seenFiles.size) {
    console.log();
    console.log(`Found ${errorCount} error${errorCount === 1 ? '' : 's'} in ${seenFiles.size} file${seenFiles.size === 1 ? '' : 's'}.`);
    process.exit(errorCount);
}
function visit(node) {
    if (ts.isParameter(node) && ts.isParameterPropertyDeclaration(node, node.parent)) {
        checkParameterPropertyDeclaration(node);
    }
    ts.forEachChild(node, visit);
}
function checkParameterPropertyDeclaration(param) {
    const uses = [...collectReferences(param.name, [])];
    if (!uses.length) {
        return;
    }
    const sourceFile = param.getSourceFile();
    if (!seenFiles.has(sourceFile)) {
        if (seenFiles.size) {
            console.log(``);
        }
        console.log(`${formatFileName(param)}:`);
        seenFiles.add(sourceFile);
    }
    else {
        console.log(``);
    }
    console.log(`  Parameter property '${param.name.getText()}' is used before its declaration.`);
    for (const { stack, container } of uses) {
        const use = stack[stack.length - 1];
        console.log(`    at ${formatLocation(use)}: ${formatMember(container)} -> ${formatStack(stack)}`);
        errorCount++;
    }
}
function* collectReferences(node, stack, requiresInvocationDepth = 0, seen = new Set()) {
    for (const use of findAllReferencesInClass(node)) {
        const container = findContainer(use);
        if (!container || seen.has(container) || ts.isConstructorDeclaration(container)) {
            continue;
        }
        seen.add(container);
        const nextStack = [...stack, use];
        let nextRequiresInvocationDepth = requiresInvocationDepth;
        if (isInvocation(use) && nextRequiresInvocationDepth > 0) {
            nextRequiresInvocationDepth--;
        }
        if (ts.isPropertyDeclaration(container) && nextRequiresInvocationDepth === 0) {
            yield { stack: nextStack, container };
        }
        else if (requiresInvocation(container)) {
            nextRequiresInvocationDepth++;
        }
        yield* collectReferences(container.name ?? container, nextStack, nextRequiresInvocationDepth, seen);
    }
}
function requiresInvocation(definition) {
    return ts.isMethodDeclaration(definition) || ts.isFunctionDeclaration(definition) || ts.isFunctionExpression(definition) || ts.isArrowFunction(definition);
}
function isInvocation(use) {
    let location = use;
    if (ts.isPropertyAccessExpression(location.parent) && location.parent.name === location) {
        location = location.parent;
    }
    else if (ts.isElementAccessExpression(location.parent) && location.parent.argumentExpression === location) {
        location = location.parent;
    }
    return ts.isCallExpression(location.parent) && location.parent.expression === location
        || ts.isTaggedTemplateExpression(location.parent) && location.parent.tag === location;
}
function formatFileName(node) {
    const sourceFile = node.getSourceFile();
    return path.resolve(sourceFile.fileName);
}
function formatLocation(node) {
    const sourceFile = node.getSourceFile();
    const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
    return `${formatFileName(sourceFile)}(${line + 1},${character + 1})`;
}
function formatStack(stack) {
    return stack.slice().reverse().map((use) => formatUse(use)).join(' -> ');
}
function formatMember(container) {
    const name = container.name?.getText();
    if (name) {
        const className = findClass(container)?.name?.getText();
        if (className) {
            return `${className}.${name}`;
        }
        return name;
    }
    return '<unknown>';
}
function formatUse(use) {
    let text = use.getText();
    if (use.parent && ts.isPropertyAccessExpression(use.parent) && use.parent.name === use) {
        if (use.parent.expression.kind === ts.SyntaxKind.ThisKeyword) {
            text = `this.${text}`;
        }
        use = use.parent;
    }
    else if (use.parent && ts.isElementAccessExpression(use.parent) && use.parent.argumentExpression === use) {
        if (use.parent.expression.kind === ts.SyntaxKind.ThisKeyword) {
            text = `this['${text}']`;
        }
        use = use.parent;
    }
    if (ts.isCallExpression(use.parent)) {
        text = `${text}(...)`;
    }
    return text;
}
function findContainer(node) {
    return ts.findAncestor(node, ancestor => {
        switch (ancestor.kind) {
            case ts.SyntaxKind.PropertyDeclaration:
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.GetAccessor:
            case ts.SyntaxKind.SetAccessor:
            case ts.SyntaxKind.Constructor:
            case ts.SyntaxKind.ClassStaticBlockDeclaration:
            case ts.SyntaxKind.ArrowFunction:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.Parameter:
                return true;
        }
        return false;
    });
}
function findClass(node) {
    return ts.findAncestor(node, ts.isClassLike);
}
function* findAllReferencesInClass(node) {
    const classDecl = findClass(node);
    if (!classDecl) {
        return [];
    }
    for (const ref of findAllReferences(node)) {
        for (const entry of ref.references) {
            if (entry.kind !== EntryKind.Node || entry.node === node) {
                continue;
            }
            if (findClass(entry.node) === classDecl) {
                yield entry.node;
            }
        }
    }
}
// NOTE: The following uses TypeScript internals and are subject to change from version to version.
function findAllReferences(node) {
    const sourceFile = node.getSourceFile();
    const position = node.getStart();
    const name = ts.getTouchingPropertyName(sourceFile, position);
    const options = { use: ts.FindAllReferences.FindReferencesUse.References };
    return ts.FindAllReferences.Core.getReferencedSymbolsForNode(position, name, program, [sourceFile], cancellationToken, options) ?? [];
}
var DefinitionKind;
(function (DefinitionKind) {
    DefinitionKind[DefinitionKind["Symbol"] = 0] = "Symbol";
    DefinitionKind[DefinitionKind["Label"] = 1] = "Label";
    DefinitionKind[DefinitionKind["Keyword"] = 2] = "Keyword";
    DefinitionKind[DefinitionKind["This"] = 3] = "This";
    DefinitionKind[DefinitionKind["String"] = 4] = "String";
    DefinitionKind[DefinitionKind["TripleSlashReference"] = 5] = "TripleSlashReference";
})(DefinitionKind || (DefinitionKind = {}));
//# sourceMappingURL=propertyInitOrderChecker.js.map