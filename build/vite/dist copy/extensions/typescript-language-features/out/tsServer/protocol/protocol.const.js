"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizeImportsMode = exports.EventName = exports.DisplayPartKind = exports.KindModifiers = exports.DiagnosticCategory = exports.Kind = void 0;
class Kind {
    static alias = 'alias';
    static callSignature = 'call';
    static class = 'class';
    static const = 'const';
    static constructorImplementation = 'constructor';
    static constructSignature = 'construct';
    static directory = 'directory';
    static enum = 'enum';
    static enumMember = 'enum member';
    static externalModuleName = 'external module name';
    static function = 'function';
    static indexSignature = 'index';
    static interface = 'interface';
    static keyword = 'keyword';
    static let = 'let';
    static localFunction = 'local function';
    static localVariable = 'local var';
    static method = 'method';
    static memberGetAccessor = 'getter';
    static memberSetAccessor = 'setter';
    static memberVariable = 'property';
    static module = 'module';
    static primitiveType = 'primitive type';
    static script = 'script';
    static type = 'type';
    static variable = 'var';
    static warning = 'warning';
    static string = 'string';
    static parameter = 'parameter';
    static typeParameter = 'type parameter';
}
exports.Kind = Kind;
class DiagnosticCategory {
    static error = 'error';
    static warning = 'warning';
    static suggestion = 'suggestion';
}
exports.DiagnosticCategory = DiagnosticCategory;
class KindModifiers {
    static optional = 'optional';
    static deprecated = 'deprecated';
    static color = 'color';
    static dtsFile = '.d.ts';
    static tsFile = '.ts';
    static tsxFile = '.tsx';
    static jsFile = '.js';
    static jsxFile = '.jsx';
    static jsonFile = '.json';
    static fileExtensionKindModifiers = [
        KindModifiers.dtsFile,
        KindModifiers.tsFile,
        KindModifiers.tsxFile,
        KindModifiers.jsFile,
        KindModifiers.jsxFile,
        KindModifiers.jsonFile,
    ];
}
exports.KindModifiers = KindModifiers;
class DisplayPartKind {
    static functionName = 'functionName';
    static methodName = 'methodName';
    static parameterName = 'parameterName';
    static propertyName = 'propertyName';
    static punctuation = 'punctuation';
    static text = 'text';
}
exports.DisplayPartKind = DisplayPartKind;
var EventName;
(function (EventName) {
    EventName["syntaxDiag"] = "syntaxDiag";
    EventName["semanticDiag"] = "semanticDiag";
    EventName["suggestionDiag"] = "suggestionDiag";
    EventName["regionSemanticDiag"] = "regionSemanticDiag";
    EventName["configFileDiag"] = "configFileDiag";
    EventName["telemetry"] = "telemetry";
    EventName["projectLanguageServiceState"] = "projectLanguageServiceState";
    EventName["projectsUpdatedInBackground"] = "projectsUpdatedInBackground";
    EventName["beginInstallTypes"] = "beginInstallTypes";
    EventName["endInstallTypes"] = "endInstallTypes";
    EventName["typesInstallerInitializationFailed"] = "typesInstallerInitializationFailed";
    EventName["surveyReady"] = "surveyReady";
    EventName["projectLoadingStart"] = "projectLoadingStart";
    EventName["projectLoadingFinish"] = "projectLoadingFinish";
    EventName["createFileWatcher"] = "createFileWatcher";
    EventName["createDirectoryWatcher"] = "createDirectoryWatcher";
    EventName["closeFileWatcher"] = "closeFileWatcher";
    EventName["requestCompleted"] = "requestCompleted";
})(EventName || (exports.EventName = EventName = {}));
var OrganizeImportsMode;
(function (OrganizeImportsMode) {
    OrganizeImportsMode["All"] = "All";
    OrganizeImportsMode["SortAndCombine"] = "SortAndCombine";
    OrganizeImportsMode["RemoveUnused"] = "RemoveUnused";
})(OrganizeImportsMode || (exports.OrganizeImportsMode = OrganizeImportsMode = {}));
//# sourceMappingURL=protocol.const.js.map