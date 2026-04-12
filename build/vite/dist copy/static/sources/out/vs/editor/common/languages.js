/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../base/common/codicons.js';
import { URI } from '../../base/common/uri.js';
import { EditOperation } from './core/editOperation.js';
import { Range } from './core/range.js';
import { TokenizationRegistry as TokenizationRegistryImpl } from './tokenizationRegistry.js';
import { localize } from '../../nls.js';
export class Token {
    constructor(offset, type, language) {
        this.offset = offset;
        this.type = type;
        this.language = language;
        this._tokenBrand = undefined;
    }
    toString() {
        return '(' + this.offset + ', ' + this.type + ')';
    }
}
/**
 * @internal
 */
export class TokenizationResult {
    constructor(tokens, endState) {
        this.tokens = tokens;
        this.endState = endState;
        this._tokenizationResultBrand = undefined;
    }
}
/**
 * @internal
 */
export class EncodedTokenizationResult {
    constructor(
    /**
     * The tokens in binary format. Each token occupies two array indices. For token i:
     *  - at offset 2*i => startIndex
     *  - at offset 2*i + 1 => metadata
     *
     */
    tokens, fontInfo, endState) {
        this.tokens = tokens;
        this.fontInfo = fontInfo;
        this.endState = endState;
        this._encodedTokenizationResultBrand = undefined;
    }
}
export var HoverVerbosityAction;
(function (HoverVerbosityAction) {
    /**
     * Increase the verbosity of the hover
     */
    HoverVerbosityAction[HoverVerbosityAction["Increase"] = 0] = "Increase";
    /**
     * Decrease the verbosity of the hover
     */
    HoverVerbosityAction[HoverVerbosityAction["Decrease"] = 1] = "Decrease";
})(HoverVerbosityAction || (HoverVerbosityAction = {}));
export var CompletionItemKind;
(function (CompletionItemKind) {
    CompletionItemKind[CompletionItemKind["Method"] = 0] = "Method";
    CompletionItemKind[CompletionItemKind["Function"] = 1] = "Function";
    CompletionItemKind[CompletionItemKind["Constructor"] = 2] = "Constructor";
    CompletionItemKind[CompletionItemKind["Field"] = 3] = "Field";
    CompletionItemKind[CompletionItemKind["Variable"] = 4] = "Variable";
    CompletionItemKind[CompletionItemKind["Class"] = 5] = "Class";
    CompletionItemKind[CompletionItemKind["Struct"] = 6] = "Struct";
    CompletionItemKind[CompletionItemKind["Interface"] = 7] = "Interface";
    CompletionItemKind[CompletionItemKind["Module"] = 8] = "Module";
    CompletionItemKind[CompletionItemKind["Property"] = 9] = "Property";
    CompletionItemKind[CompletionItemKind["Event"] = 10] = "Event";
    CompletionItemKind[CompletionItemKind["Operator"] = 11] = "Operator";
    CompletionItemKind[CompletionItemKind["Unit"] = 12] = "Unit";
    CompletionItemKind[CompletionItemKind["Value"] = 13] = "Value";
    CompletionItemKind[CompletionItemKind["Constant"] = 14] = "Constant";
    CompletionItemKind[CompletionItemKind["Enum"] = 15] = "Enum";
    CompletionItemKind[CompletionItemKind["EnumMember"] = 16] = "EnumMember";
    CompletionItemKind[CompletionItemKind["Keyword"] = 17] = "Keyword";
    CompletionItemKind[CompletionItemKind["Text"] = 18] = "Text";
    CompletionItemKind[CompletionItemKind["Color"] = 19] = "Color";
    CompletionItemKind[CompletionItemKind["File"] = 20] = "File";
    CompletionItemKind[CompletionItemKind["Reference"] = 21] = "Reference";
    CompletionItemKind[CompletionItemKind["Customcolor"] = 22] = "Customcolor";
    CompletionItemKind[CompletionItemKind["Folder"] = 23] = "Folder";
    CompletionItemKind[CompletionItemKind["TypeParameter"] = 24] = "TypeParameter";
    CompletionItemKind[CompletionItemKind["User"] = 25] = "User";
    CompletionItemKind[CompletionItemKind["Issue"] = 26] = "Issue";
    CompletionItemKind[CompletionItemKind["Tool"] = 27] = "Tool";
    CompletionItemKind[CompletionItemKind["Snippet"] = 28] = "Snippet";
})(CompletionItemKind || (CompletionItemKind = {}));
/**
 * @internal
 */
export var CompletionItemKinds;
(function (CompletionItemKinds) {
    const byKind = new Map();
    byKind.set(0 /* CompletionItemKind.Method */, Codicon.symbolMethod);
    byKind.set(1 /* CompletionItemKind.Function */, Codicon.symbolFunction);
    byKind.set(2 /* CompletionItemKind.Constructor */, Codicon.symbolConstructor);
    byKind.set(3 /* CompletionItemKind.Field */, Codicon.symbolField);
    byKind.set(4 /* CompletionItemKind.Variable */, Codicon.symbolVariable);
    byKind.set(5 /* CompletionItemKind.Class */, Codicon.symbolClass);
    byKind.set(6 /* CompletionItemKind.Struct */, Codicon.symbolStruct);
    byKind.set(7 /* CompletionItemKind.Interface */, Codicon.symbolInterface);
    byKind.set(8 /* CompletionItemKind.Module */, Codicon.symbolModule);
    byKind.set(9 /* CompletionItemKind.Property */, Codicon.symbolProperty);
    byKind.set(10 /* CompletionItemKind.Event */, Codicon.symbolEvent);
    byKind.set(11 /* CompletionItemKind.Operator */, Codicon.symbolOperator);
    byKind.set(12 /* CompletionItemKind.Unit */, Codicon.symbolUnit);
    byKind.set(13 /* CompletionItemKind.Value */, Codicon.symbolValue);
    byKind.set(15 /* CompletionItemKind.Enum */, Codicon.symbolEnum);
    byKind.set(14 /* CompletionItemKind.Constant */, Codicon.symbolConstant);
    byKind.set(15 /* CompletionItemKind.Enum */, Codicon.symbolEnum);
    byKind.set(16 /* CompletionItemKind.EnumMember */, Codicon.symbolEnumMember);
    byKind.set(17 /* CompletionItemKind.Keyword */, Codicon.symbolKeyword);
    byKind.set(28 /* CompletionItemKind.Snippet */, Codicon.symbolSnippet);
    byKind.set(18 /* CompletionItemKind.Text */, Codicon.symbolText);
    byKind.set(19 /* CompletionItemKind.Color */, Codicon.symbolColor);
    byKind.set(20 /* CompletionItemKind.File */, Codicon.symbolFile);
    byKind.set(21 /* CompletionItemKind.Reference */, Codicon.symbolReference);
    byKind.set(22 /* CompletionItemKind.Customcolor */, Codicon.symbolCustomColor);
    byKind.set(23 /* CompletionItemKind.Folder */, Codicon.symbolFolder);
    byKind.set(24 /* CompletionItemKind.TypeParameter */, Codicon.symbolTypeParameter);
    byKind.set(25 /* CompletionItemKind.User */, Codicon.account);
    byKind.set(26 /* CompletionItemKind.Issue */, Codicon.issues);
    byKind.set(27 /* CompletionItemKind.Tool */, Codicon.tools);
    /**
     * @internal
     */
    function toIcon(kind) {
        let codicon = byKind.get(kind);
        if (!codicon) {
            console.info('No codicon found for CompletionItemKind ' + kind);
            codicon = Codicon.symbolProperty;
        }
        return codicon;
    }
    CompletionItemKinds.toIcon = toIcon;
    /**
     * @internal
     */
    function toLabel(kind) {
        switch (kind) {
            case 0 /* CompletionItemKind.Method */: return localize('suggestWidget.kind.method', 'Method');
            case 1 /* CompletionItemKind.Function */: return localize('suggestWidget.kind.function', 'Function');
            case 2 /* CompletionItemKind.Constructor */: return localize('suggestWidget.kind.constructor', 'Constructor');
            case 3 /* CompletionItemKind.Field */: return localize('suggestWidget.kind.field', 'Field');
            case 4 /* CompletionItemKind.Variable */: return localize('suggestWidget.kind.variable', 'Variable');
            case 5 /* CompletionItemKind.Class */: return localize('suggestWidget.kind.class', 'Class');
            case 6 /* CompletionItemKind.Struct */: return localize('suggestWidget.kind.struct', 'Struct');
            case 7 /* CompletionItemKind.Interface */: return localize('suggestWidget.kind.interface', 'Interface');
            case 8 /* CompletionItemKind.Module */: return localize('suggestWidget.kind.module', 'Module');
            case 9 /* CompletionItemKind.Property */: return localize('suggestWidget.kind.property', 'Property');
            case 10 /* CompletionItemKind.Event */: return localize('suggestWidget.kind.event', 'Event');
            case 11 /* CompletionItemKind.Operator */: return localize('suggestWidget.kind.operator', 'Operator');
            case 12 /* CompletionItemKind.Unit */: return localize('suggestWidget.kind.unit', 'Unit');
            case 13 /* CompletionItemKind.Value */: return localize('suggestWidget.kind.value', 'Value');
            case 14 /* CompletionItemKind.Constant */: return localize('suggestWidget.kind.constant', 'Constant');
            case 15 /* CompletionItemKind.Enum */: return localize('suggestWidget.kind.enum', 'Enum');
            case 16 /* CompletionItemKind.EnumMember */: return localize('suggestWidget.kind.enumMember', 'Enum Member');
            case 17 /* CompletionItemKind.Keyword */: return localize('suggestWidget.kind.keyword', 'Keyword');
            case 18 /* CompletionItemKind.Text */: return localize('suggestWidget.kind.text', 'Text');
            case 19 /* CompletionItemKind.Color */: return localize('suggestWidget.kind.color', 'Color');
            case 20 /* CompletionItemKind.File */: return localize('suggestWidget.kind.file', 'File');
            case 21 /* CompletionItemKind.Reference */: return localize('suggestWidget.kind.reference', 'Reference');
            case 22 /* CompletionItemKind.Customcolor */: return localize('suggestWidget.kind.customcolor', 'Custom Color');
            case 23 /* CompletionItemKind.Folder */: return localize('suggestWidget.kind.folder', 'Folder');
            case 24 /* CompletionItemKind.TypeParameter */: return localize('suggestWidget.kind.typeParameter', 'Type Parameter');
            case 25 /* CompletionItemKind.User */: return localize('suggestWidget.kind.user', 'User');
            case 26 /* CompletionItemKind.Issue */: return localize('suggestWidget.kind.issue', 'Issue');
            case 27 /* CompletionItemKind.Tool */: return localize('suggestWidget.kind.tool', 'Tool');
            case 28 /* CompletionItemKind.Snippet */: return localize('suggestWidget.kind.snippet', 'Snippet');
            default: return '';
        }
    }
    CompletionItemKinds.toLabel = toLabel;
    const data = new Map();
    data.set('method', 0 /* CompletionItemKind.Method */);
    data.set('function', 1 /* CompletionItemKind.Function */);
    data.set('constructor', 2 /* CompletionItemKind.Constructor */);
    data.set('field', 3 /* CompletionItemKind.Field */);
    data.set('variable', 4 /* CompletionItemKind.Variable */);
    data.set('class', 5 /* CompletionItemKind.Class */);
    data.set('struct', 6 /* CompletionItemKind.Struct */);
    data.set('interface', 7 /* CompletionItemKind.Interface */);
    data.set('module', 8 /* CompletionItemKind.Module */);
    data.set('property', 9 /* CompletionItemKind.Property */);
    data.set('event', 10 /* CompletionItemKind.Event */);
    data.set('operator', 11 /* CompletionItemKind.Operator */);
    data.set('unit', 12 /* CompletionItemKind.Unit */);
    data.set('value', 13 /* CompletionItemKind.Value */);
    data.set('constant', 14 /* CompletionItemKind.Constant */);
    data.set('enum', 15 /* CompletionItemKind.Enum */);
    data.set('enum-member', 16 /* CompletionItemKind.EnumMember */);
    data.set('enumMember', 16 /* CompletionItemKind.EnumMember */);
    data.set('keyword', 17 /* CompletionItemKind.Keyword */);
    data.set('snippet', 28 /* CompletionItemKind.Snippet */);
    data.set('text', 18 /* CompletionItemKind.Text */);
    data.set('color', 19 /* CompletionItemKind.Color */);
    data.set('file', 20 /* CompletionItemKind.File */);
    data.set('reference', 21 /* CompletionItemKind.Reference */);
    data.set('customcolor', 22 /* CompletionItemKind.Customcolor */);
    data.set('folder', 23 /* CompletionItemKind.Folder */);
    data.set('type-parameter', 24 /* CompletionItemKind.TypeParameter */);
    data.set('typeParameter', 24 /* CompletionItemKind.TypeParameter */);
    data.set('account', 25 /* CompletionItemKind.User */);
    data.set('issue', 26 /* CompletionItemKind.Issue */);
    data.set('tool', 27 /* CompletionItemKind.Tool */);
    /**
     * @internal
     */
    function fromString(value, strict) {
        let res = data.get(value);
        if (typeof res === 'undefined' && !strict) {
            res = 9 /* CompletionItemKind.Property */;
        }
        return res;
    }
    CompletionItemKinds.fromString = fromString;
})(CompletionItemKinds || (CompletionItemKinds = {}));
export var CompletionItemTag;
(function (CompletionItemTag) {
    CompletionItemTag[CompletionItemTag["Deprecated"] = 1] = "Deprecated";
})(CompletionItemTag || (CompletionItemTag = {}));
export var CompletionItemInsertTextRule;
(function (CompletionItemInsertTextRule) {
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["None"] = 0] = "None";
    /**
     * Adjust whitespace/indentation of multiline insert texts to
     * match the current line indentation.
     */
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["KeepWhitespace"] = 1] = "KeepWhitespace";
    /**
     * `insertText` is a snippet.
     */
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["InsertAsSnippet"] = 4] = "InsertAsSnippet";
})(CompletionItemInsertTextRule || (CompletionItemInsertTextRule = {}));
/**
 * How a partial acceptance was triggered.
 */
export var PartialAcceptTriggerKind;
(function (PartialAcceptTriggerKind) {
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Word"] = 0] = "Word";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Line"] = 1] = "Line";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Suggest"] = 2] = "Suggest";
})(PartialAcceptTriggerKind || (PartialAcceptTriggerKind = {}));
/**
 * How a suggest provider was triggered.
 */
export var CompletionTriggerKind;
(function (CompletionTriggerKind) {
    CompletionTriggerKind[CompletionTriggerKind["Invoke"] = 0] = "Invoke";
    CompletionTriggerKind[CompletionTriggerKind["TriggerCharacter"] = 1] = "TriggerCharacter";
    CompletionTriggerKind[CompletionTriggerKind["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
})(CompletionTriggerKind || (CompletionTriggerKind = {}));
/**
 * How an {@link InlineCompletionsProvider inline completion provider} was triggered.
 */
export var InlineCompletionTriggerKind;
(function (InlineCompletionTriggerKind) {
    /**
     * Completion was triggered automatically while editing.
     * It is sufficient to return a single completion item in this case.
     */
    InlineCompletionTriggerKind[InlineCompletionTriggerKind["Automatic"] = 0] = "Automatic";
    /**
     * Completion was triggered explicitly by a user gesture.
     * Return multiple completion items to enable cycling through them.
     */
    InlineCompletionTriggerKind[InlineCompletionTriggerKind["Explicit"] = 1] = "Explicit";
})(InlineCompletionTriggerKind || (InlineCompletionTriggerKind = {}));
export class SelectedSuggestionInfo {
    constructor(range, text, completionKind, isSnippetText) {
        this.range = range;
        this.text = text;
        this.completionKind = completionKind;
        this.isSnippetText = isSnippetText;
    }
    equals(other) {
        return Range.lift(this.range).equalsRange(other.range)
            && this.text === other.text
            && this.completionKind === other.completionKind
            && this.isSnippetText === other.isSnippetText;
    }
}
export var InlineCompletionHintStyle;
(function (InlineCompletionHintStyle) {
    InlineCompletionHintStyle[InlineCompletionHintStyle["Code"] = 1] = "Code";
    InlineCompletionHintStyle[InlineCompletionHintStyle["Label"] = 2] = "Label";
})(InlineCompletionHintStyle || (InlineCompletionHintStyle = {}));
/** @internal */
export class ProviderId {
    static fromExtensionId(extensionId) {
        return new ProviderId(extensionId, undefined, undefined);
    }
    constructor(extensionId, extensionVersion, providerId) {
        this.extensionId = extensionId;
        this.extensionVersion = extensionVersion;
        this.providerId = providerId;
    }
    toString() {
        let result = '';
        if (this.extensionId) {
            result += this.extensionId;
        }
        if (this.extensionVersion) {
            result += `@${this.extensionVersion}`;
        }
        if (this.providerId) {
            result += `:${this.providerId}`;
        }
        if (result.length === 0) {
            result = 'unknown';
        }
        return result;
    }
    toStringWithoutVersion() {
        let result = '';
        if (this.extensionId) {
            result += this.extensionId;
        }
        if (this.providerId) {
            result += `:${this.providerId}`;
        }
        return result;
    }
}
/** @internal */
export class VersionedExtensionId {
    static tryCreate(extensionId, version) {
        if (!extensionId || !version) {
            return undefined;
        }
        return new VersionedExtensionId(extensionId, version);
    }
    constructor(extensionId, version) {
        this.extensionId = extensionId;
        this.version = version;
    }
    toString() {
        return `${this.extensionId}@${this.version}`;
    }
}
export var InlineCompletionEndOfLifeReasonKind;
(function (InlineCompletionEndOfLifeReasonKind) {
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Accepted"] = 0] = "Accepted";
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Rejected"] = 1] = "Rejected";
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Ignored"] = 2] = "Ignored";
})(InlineCompletionEndOfLifeReasonKind || (InlineCompletionEndOfLifeReasonKind = {}));
export var CodeActionTriggerType;
(function (CodeActionTriggerType) {
    CodeActionTriggerType[CodeActionTriggerType["Invoke"] = 1] = "Invoke";
    CodeActionTriggerType[CodeActionTriggerType["Auto"] = 2] = "Auto";
})(CodeActionTriggerType || (CodeActionTriggerType = {}));
/**
 * @internal
 */
export var DocumentPasteTriggerKind;
(function (DocumentPasteTriggerKind) {
    DocumentPasteTriggerKind[DocumentPasteTriggerKind["Automatic"] = 0] = "Automatic";
    DocumentPasteTriggerKind[DocumentPasteTriggerKind["PasteAs"] = 1] = "PasteAs";
})(DocumentPasteTriggerKind || (DocumentPasteTriggerKind = {}));
export var SignatureHelpTriggerKind;
(function (SignatureHelpTriggerKind) {
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["Invoke"] = 1] = "Invoke";
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["TriggerCharacter"] = 2] = "TriggerCharacter";
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["ContentChange"] = 3] = "ContentChange";
})(SignatureHelpTriggerKind || (SignatureHelpTriggerKind = {}));
/**
 * A document highlight kind.
 */
export var DocumentHighlightKind;
(function (DocumentHighlightKind) {
    /**
     * A textual occurrence.
     */
    DocumentHighlightKind[DocumentHighlightKind["Text"] = 0] = "Text";
    /**
     * Read-access of a symbol, like reading a variable.
     */
    DocumentHighlightKind[DocumentHighlightKind["Read"] = 1] = "Read";
    /**
     * Write-access of a symbol, like writing to a variable.
     */
    DocumentHighlightKind[DocumentHighlightKind["Write"] = 2] = "Write";
})(DocumentHighlightKind || (DocumentHighlightKind = {}));
/**
 * @internal
 */
export function isLocationLink(thing) {
    return !!thing
        && URI.isUri(thing.uri)
        && Range.isIRange(thing.range)
        && (Range.isIRange(thing.originSelectionRange) || Range.isIRange(thing.targetSelectionRange));
}
/**
 * @internal
 */
export function isLocation(thing) {
    return !!thing
        && URI.isUri(thing.uri)
        && Range.isIRange(thing.range);
}
/**
 * A symbol kind.
 */
export var SymbolKind;
(function (SymbolKind) {
    SymbolKind[SymbolKind["File"] = 0] = "File";
    SymbolKind[SymbolKind["Module"] = 1] = "Module";
    SymbolKind[SymbolKind["Namespace"] = 2] = "Namespace";
    SymbolKind[SymbolKind["Package"] = 3] = "Package";
    SymbolKind[SymbolKind["Class"] = 4] = "Class";
    SymbolKind[SymbolKind["Method"] = 5] = "Method";
    SymbolKind[SymbolKind["Property"] = 6] = "Property";
    SymbolKind[SymbolKind["Field"] = 7] = "Field";
    SymbolKind[SymbolKind["Constructor"] = 8] = "Constructor";
    SymbolKind[SymbolKind["Enum"] = 9] = "Enum";
    SymbolKind[SymbolKind["Interface"] = 10] = "Interface";
    SymbolKind[SymbolKind["Function"] = 11] = "Function";
    SymbolKind[SymbolKind["Variable"] = 12] = "Variable";
    SymbolKind[SymbolKind["Constant"] = 13] = "Constant";
    SymbolKind[SymbolKind["String"] = 14] = "String";
    SymbolKind[SymbolKind["Number"] = 15] = "Number";
    SymbolKind[SymbolKind["Boolean"] = 16] = "Boolean";
    SymbolKind[SymbolKind["Array"] = 17] = "Array";
    SymbolKind[SymbolKind["Object"] = 18] = "Object";
    SymbolKind[SymbolKind["Key"] = 19] = "Key";
    SymbolKind[SymbolKind["Null"] = 20] = "Null";
    SymbolKind[SymbolKind["EnumMember"] = 21] = "EnumMember";
    SymbolKind[SymbolKind["Struct"] = 22] = "Struct";
    SymbolKind[SymbolKind["Event"] = 23] = "Event";
    SymbolKind[SymbolKind["Operator"] = 24] = "Operator";
    SymbolKind[SymbolKind["TypeParameter"] = 25] = "TypeParameter";
})(SymbolKind || (SymbolKind = {}));
/**
 * @internal
 */
export const symbolKindNames = {
    [17 /* SymbolKind.Array */]: localize('Array', "array"),
    [16 /* SymbolKind.Boolean */]: localize('Boolean', "boolean"),
    [4 /* SymbolKind.Class */]: localize('Class', "class"),
    [13 /* SymbolKind.Constant */]: localize('Constant', "constant"),
    [8 /* SymbolKind.Constructor */]: localize('Constructor', "constructor"),
    [9 /* SymbolKind.Enum */]: localize('Enum', "enumeration"),
    [21 /* SymbolKind.EnumMember */]: localize('EnumMember', "enumeration member"),
    [23 /* SymbolKind.Event */]: localize('Event', "event"),
    [7 /* SymbolKind.Field */]: localize('Field', "field"),
    [0 /* SymbolKind.File */]: localize('File', "file"),
    [11 /* SymbolKind.Function */]: localize('Function', "function"),
    [10 /* SymbolKind.Interface */]: localize('Interface', "interface"),
    [19 /* SymbolKind.Key */]: localize('Key', "key"),
    [5 /* SymbolKind.Method */]: localize('Method', "method"),
    [1 /* SymbolKind.Module */]: localize('Module', "module"),
    [2 /* SymbolKind.Namespace */]: localize('Namespace', "namespace"),
    [20 /* SymbolKind.Null */]: localize('Null', "null"),
    [15 /* SymbolKind.Number */]: localize('Number', "number"),
    [18 /* SymbolKind.Object */]: localize('Object', "object"),
    [24 /* SymbolKind.Operator */]: localize('Operator', "operator"),
    [3 /* SymbolKind.Package */]: localize('Package', "package"),
    [6 /* SymbolKind.Property */]: localize('Property', "property"),
    [14 /* SymbolKind.String */]: localize('String', "string"),
    [22 /* SymbolKind.Struct */]: localize('Struct', "struct"),
    [25 /* SymbolKind.TypeParameter */]: localize('TypeParameter', "type parameter"),
    [12 /* SymbolKind.Variable */]: localize('Variable', "variable"),
};
/**
 * @internal
 */
export function getAriaLabelForSymbol(symbolName, kind) {
    return localize('symbolAriaLabel', '{0} ({1})', symbolName, symbolKindNames[kind]);
}
export var SymbolTag;
(function (SymbolTag) {
    SymbolTag[SymbolTag["Deprecated"] = 1] = "Deprecated";
})(SymbolTag || (SymbolTag = {}));
/**
 * @internal
 */
export var SymbolKinds;
(function (SymbolKinds) {
    const byKind = new Map();
    byKind.set(0 /* SymbolKind.File */, Codicon.symbolFile);
    byKind.set(1 /* SymbolKind.Module */, Codicon.symbolModule);
    byKind.set(2 /* SymbolKind.Namespace */, Codicon.symbolNamespace);
    byKind.set(3 /* SymbolKind.Package */, Codicon.symbolPackage);
    byKind.set(4 /* SymbolKind.Class */, Codicon.symbolClass);
    byKind.set(5 /* SymbolKind.Method */, Codicon.symbolMethod);
    byKind.set(6 /* SymbolKind.Property */, Codicon.symbolProperty);
    byKind.set(7 /* SymbolKind.Field */, Codicon.symbolField);
    byKind.set(8 /* SymbolKind.Constructor */, Codicon.symbolConstructor);
    byKind.set(9 /* SymbolKind.Enum */, Codicon.symbolEnum);
    byKind.set(10 /* SymbolKind.Interface */, Codicon.symbolInterface);
    byKind.set(11 /* SymbolKind.Function */, Codicon.symbolFunction);
    byKind.set(12 /* SymbolKind.Variable */, Codicon.symbolVariable);
    byKind.set(13 /* SymbolKind.Constant */, Codicon.symbolConstant);
    byKind.set(14 /* SymbolKind.String */, Codicon.symbolString);
    byKind.set(15 /* SymbolKind.Number */, Codicon.symbolNumber);
    byKind.set(16 /* SymbolKind.Boolean */, Codicon.symbolBoolean);
    byKind.set(17 /* SymbolKind.Array */, Codicon.symbolArray);
    byKind.set(18 /* SymbolKind.Object */, Codicon.symbolObject);
    byKind.set(19 /* SymbolKind.Key */, Codicon.symbolKey);
    byKind.set(20 /* SymbolKind.Null */, Codicon.symbolNull);
    byKind.set(21 /* SymbolKind.EnumMember */, Codicon.symbolEnumMember);
    byKind.set(22 /* SymbolKind.Struct */, Codicon.symbolStruct);
    byKind.set(23 /* SymbolKind.Event */, Codicon.symbolEvent);
    byKind.set(24 /* SymbolKind.Operator */, Codicon.symbolOperator);
    byKind.set(25 /* SymbolKind.TypeParameter */, Codicon.symbolTypeParameter);
    /**
     * @internal
     */
    function toIcon(kind) {
        let icon = byKind.get(kind);
        if (!icon) {
            console.info('No codicon found for SymbolKind ' + kind);
            icon = Codicon.symbolProperty;
        }
        return icon;
    }
    SymbolKinds.toIcon = toIcon;
    const byCompletionKind = new Map();
    byCompletionKind.set(0 /* SymbolKind.File */, 20 /* CompletionItemKind.File */);
    byCompletionKind.set(1 /* SymbolKind.Module */, 8 /* CompletionItemKind.Module */);
    byCompletionKind.set(2 /* SymbolKind.Namespace */, 8 /* CompletionItemKind.Module */);
    byCompletionKind.set(3 /* SymbolKind.Package */, 8 /* CompletionItemKind.Module */);
    byCompletionKind.set(4 /* SymbolKind.Class */, 5 /* CompletionItemKind.Class */);
    byCompletionKind.set(5 /* SymbolKind.Method */, 0 /* CompletionItemKind.Method */);
    byCompletionKind.set(6 /* SymbolKind.Property */, 9 /* CompletionItemKind.Property */);
    byCompletionKind.set(7 /* SymbolKind.Field */, 3 /* CompletionItemKind.Field */);
    byCompletionKind.set(8 /* SymbolKind.Constructor */, 2 /* CompletionItemKind.Constructor */);
    byCompletionKind.set(9 /* SymbolKind.Enum */, 15 /* CompletionItemKind.Enum */);
    byCompletionKind.set(10 /* SymbolKind.Interface */, 7 /* CompletionItemKind.Interface */);
    byCompletionKind.set(11 /* SymbolKind.Function */, 1 /* CompletionItemKind.Function */);
    byCompletionKind.set(12 /* SymbolKind.Variable */, 4 /* CompletionItemKind.Variable */);
    byCompletionKind.set(13 /* SymbolKind.Constant */, 14 /* CompletionItemKind.Constant */);
    byCompletionKind.set(14 /* SymbolKind.String */, 18 /* CompletionItemKind.Text */);
    byCompletionKind.set(15 /* SymbolKind.Number */, 13 /* CompletionItemKind.Value */);
    byCompletionKind.set(16 /* SymbolKind.Boolean */, 13 /* CompletionItemKind.Value */);
    byCompletionKind.set(17 /* SymbolKind.Array */, 13 /* CompletionItemKind.Value */);
    byCompletionKind.set(18 /* SymbolKind.Object */, 13 /* CompletionItemKind.Value */);
    byCompletionKind.set(19 /* SymbolKind.Key */, 17 /* CompletionItemKind.Keyword */);
    byCompletionKind.set(20 /* SymbolKind.Null */, 13 /* CompletionItemKind.Value */);
    byCompletionKind.set(21 /* SymbolKind.EnumMember */, 16 /* CompletionItemKind.EnumMember */);
    byCompletionKind.set(22 /* SymbolKind.Struct */, 6 /* CompletionItemKind.Struct */);
    byCompletionKind.set(23 /* SymbolKind.Event */, 10 /* CompletionItemKind.Event */);
    byCompletionKind.set(24 /* SymbolKind.Operator */, 11 /* CompletionItemKind.Operator */);
    byCompletionKind.set(25 /* SymbolKind.TypeParameter */, 24 /* CompletionItemKind.TypeParameter */);
    /**
     * @internal
     */
    function toCompletionKind(kind) {
        let completionKind = byCompletionKind.get(kind);
        if (completionKind === undefined) {
            console.info('No completion kind found for SymbolKind ' + kind);
            completionKind = 20 /* CompletionItemKind.File */;
        }
        return completionKind;
    }
    SymbolKinds.toCompletionKind = toCompletionKind;
})(SymbolKinds || (SymbolKinds = {}));
/** @internal */
export class TextEdit {
    static asEditOperation(edit) {
        const range = Range.lift(edit.range);
        return range.isEmpty()
            ? EditOperation.insert(range.getStartPosition(), edit.text) // moves marker
            : EditOperation.replace(range, edit.text);
    }
    static isTextEdit(thing) {
        const possibleTextEdit = thing;
        return typeof possibleTextEdit.text === 'string' && Range.isIRange(possibleTextEdit.range);
    }
}
export class FoldingRangeKind {
    /**
     * Kind for folding range representing a comment. The value of the kind is 'comment'.
     */
    static { this.Comment = new FoldingRangeKind('comment'); }
    /**
     * Kind for folding range representing a import. The value of the kind is 'imports'.
     */
    static { this.Imports = new FoldingRangeKind('imports'); }
    /**
     * Kind for folding range representing regions (for example marked by `#region`, `#endregion`).
     * The value of the kind is 'region'.
     */
    static { this.Region = new FoldingRangeKind('region'); }
    /**
     * Returns a {@link FoldingRangeKind} for the given value.
     *
     * @param value of the kind.
     */
    static fromValue(value) {
        switch (value) {
            case 'comment': return FoldingRangeKind.Comment;
            case 'imports': return FoldingRangeKind.Imports;
            case 'region': return FoldingRangeKind.Region;
        }
        return new FoldingRangeKind(value);
    }
    /**
     * Creates a new {@link FoldingRangeKind}.
     *
     * @param value of the kind.
     */
    constructor(value) {
        this.value = value;
    }
}
export var NewSymbolNameTag;
(function (NewSymbolNameTag) {
    NewSymbolNameTag[NewSymbolNameTag["AIGenerated"] = 1] = "AIGenerated";
})(NewSymbolNameTag || (NewSymbolNameTag = {}));
export var NewSymbolNameTriggerKind;
(function (NewSymbolNameTriggerKind) {
    NewSymbolNameTriggerKind[NewSymbolNameTriggerKind["Invoke"] = 0] = "Invoke";
    NewSymbolNameTriggerKind[NewSymbolNameTriggerKind["Automatic"] = 1] = "Automatic";
})(NewSymbolNameTriggerKind || (NewSymbolNameTriggerKind = {}));
/**
 * @internal
 */
export var Command;
(function (Command) {
    /**
     * @internal
     */
    function is(obj) {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        return typeof obj.id === 'string' &&
            typeof obj.title === 'string';
    }
    Command.is = is;
})(Command || (Command = {}));
/**
 * @internal
 */
export var CommentThreadCollapsibleState;
(function (CommentThreadCollapsibleState) {
    /**
     * Determines an item is collapsed
     */
    CommentThreadCollapsibleState[CommentThreadCollapsibleState["Collapsed"] = 0] = "Collapsed";
    /**
     * Determines an item is expanded
     */
    CommentThreadCollapsibleState[CommentThreadCollapsibleState["Expanded"] = 1] = "Expanded";
})(CommentThreadCollapsibleState || (CommentThreadCollapsibleState = {}));
/**
 * @internal
 */
export var CommentThreadState;
(function (CommentThreadState) {
    CommentThreadState[CommentThreadState["Unresolved"] = 0] = "Unresolved";
    CommentThreadState[CommentThreadState["Resolved"] = 1] = "Resolved";
})(CommentThreadState || (CommentThreadState = {}));
/**
 * @internal
 */
export var CommentThreadApplicability;
(function (CommentThreadApplicability) {
    CommentThreadApplicability[CommentThreadApplicability["Current"] = 0] = "Current";
    CommentThreadApplicability[CommentThreadApplicability["Outdated"] = 1] = "Outdated";
})(CommentThreadApplicability || (CommentThreadApplicability = {}));
/**
 * @internal
 */
export var CommentMode;
(function (CommentMode) {
    CommentMode[CommentMode["Editing"] = 0] = "Editing";
    CommentMode[CommentMode["Preview"] = 1] = "Preview";
})(CommentMode || (CommentMode = {}));
/**
 * @internal
 */
export var CommentState;
(function (CommentState) {
    CommentState[CommentState["Published"] = 0] = "Published";
    CommentState[CommentState["Draft"] = 1] = "Draft";
})(CommentState || (CommentState = {}));
export var InlayHintKind;
(function (InlayHintKind) {
    InlayHintKind[InlayHintKind["Type"] = 1] = "Type";
    InlayHintKind[InlayHintKind["Parameter"] = 2] = "Parameter";
})(InlayHintKind || (InlayHintKind = {}));
/**
 * @internal
 */
export class LazyTokenizationSupport {
    constructor(createSupport) {
        this.createSupport = createSupport;
        this._tokenizationSupport = null;
    }
    dispose() {
        if (this._tokenizationSupport) {
            this._tokenizationSupport.then((support) => {
                if (support) {
                    support.dispose();
                }
            });
        }
    }
    get tokenizationSupport() {
        if (!this._tokenizationSupport) {
            this._tokenizationSupport = this.createSupport();
        }
        return this._tokenizationSupport;
    }
}
/**
 * @internal
 */
export const TokenizationRegistry = new TokenizationRegistryImpl();
/**
 * @internal
 */
export var ExternalUriOpenerPriority;
(function (ExternalUriOpenerPriority) {
    ExternalUriOpenerPriority[ExternalUriOpenerPriority["None"] = 0] = "None";
    ExternalUriOpenerPriority[ExternalUriOpenerPriority["Option"] = 1] = "Option";
    ExternalUriOpenerPriority[ExternalUriOpenerPriority["Default"] = 2] = "Default";
    ExternalUriOpenerPriority[ExternalUriOpenerPriority["Preferred"] = 3] = "Preferred";
})(ExternalUriOpenerPriority || (ExternalUriOpenerPriority = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBUXhELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sMEJBQTBCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBd0IsTUFBTSx5QkFBeUIsQ0FBQztBQUU5RSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFLaEQsT0FBTyxFQUFFLG9CQUFvQixJQUFJLHdCQUF3QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQWN4QyxNQUFNLE9BQU8sS0FBSztJQUdqQixZQUNpQixNQUFjLEVBQ2QsSUFBWSxFQUNaLFFBQWdCO1FBRmhCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDZCxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUxqQyxnQkFBVyxHQUFTLFNBQVMsQ0FBQztJQU85QixDQUFDO0lBRU0sUUFBUTtRQUNkLE9BQU8sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDO0lBQ25ELENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGtCQUFrQjtJQUc5QixZQUNpQixNQUFlLEVBQ2YsUUFBZ0I7UUFEaEIsV0FBTSxHQUFOLE1BQU0sQ0FBUztRQUNmLGFBQVEsR0FBUixRQUFRLENBQVE7UUFKakMsNkJBQXdCLEdBQVMsU0FBUyxDQUFDO0lBTTNDLENBQUM7Q0FDRDtBQWFEOztHQUVHO0FBQ0gsTUFBTSxP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