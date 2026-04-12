/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RunOnceScheduler } from '../../../base/common/async.js';
import { Color } from '../../../base/common/color.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import * as platform from '../../registry/common/platform.js';
const TOKEN_TYPE_WILDCARD = '*';
const TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR = ':';
const CLASSIFIER_MODIFIER_SEPARATOR = '.';
const idPattern = '\\w+[-_\\w+]*';
export const typeAndModifierIdPattern = `^${idPattern}$`;
const selectorPattern = `^(${idPattern}|\\*)(\\${CLASSIFIER_MODIFIER_SEPARATOR}${idPattern})*(${TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR}${idPattern})?$`;
const fontStylePattern = '^(\\s*(italic|bold|underline|strikethrough))*\\s*$';
export class TokenStyle {
    constructor(foreground, bold, underline, strikethrough, italic) {
        this.foreground = foreground;
        this.bold = bold;
        this.underline = underline;
        this.strikethrough = strikethrough;
        this.italic = italic;
    }
}
(function (TokenStyle) {
    function toJSONObject(style) {
        return {
            _foreground: style.foreground === undefined ? null : Color.Format.CSS.formatHexA(style.foreground, true),
            _bold: style.bold === undefined ? null : style.bold,
            _underline: style.underline === undefined ? null : style.underline,
            _italic: style.italic === undefined ? null : style.italic,
            _strikethrough: style.strikethrough === undefined ? null : style.strikethrough,
        };
    }
    TokenStyle.toJSONObject = toJSONObject;
    function fromJSONObject(obj) {
        if (obj) {
            const boolOrUndef = (b) => (typeof b === 'boolean') ? b : undefined;
            const colorOrUndef = (s) => (typeof s === 'string') ? Color.fromHex(s) : undefined;
            return new TokenStyle(colorOrUndef(obj._foreground), boolOrUndef(obj._bold), boolOrUndef(obj._underline), boolOrUndef(obj._strikethrough), boolOrUndef(obj._italic));
        }
        return undefined;
    }
    TokenStyle.fromJSONObject = fromJSONObject;
    function equals(s1, s2) {
        if (s1 === s2) {
            return true;
        }
        return s1 !== undefined && s2 !== undefined
            && (s1.foreground instanceof Color ? s1.foreground.equals(s2.foreground) : s2.foreground === undefined)
            && s1.bold === s2.bold
            && s1.underline === s2.underline
            && s1.strikethrough === s2.strikethrough
            && s1.italic === s2.italic;
    }
    TokenStyle.equals = equals;
    function is(s) {
        return s instanceof TokenStyle;
    }
    TokenStyle.is = is;
    function fromData(data) {
        return new TokenStyle(data.foreground, data.bold, data.underline, data.strikethrough, data.italic);
    }
    TokenStyle.fromData = fromData;
    function fromSettings(foreground, fontStyle, bold, underline, strikethrough, italic) {
        let foregroundColor = undefined;
        if (foreground !== undefined) {
            foregroundColor = Color.fromHex(foreground);
        }
        if (fontStyle !== undefined) {
            bold = italic = underline = strikethrough = false;
            const expression = /italic|bold|underline|strikethrough/g;
            let match;
            while ((match = expression.exec(fontStyle))) {
                switch (match[0]) {
                    case 'bold':
                        bold = true;
                        break;
                    case 'italic':
                        italic = true;
                        break;
                    case 'underline':
                        underline = true;
                        break;
                    case 'strikethrough':
                        strikethrough = true;
                        break;
                }
            }
        }
        return new TokenStyle(foregroundColor, bold, underline, strikethrough, italic);
    }
    TokenStyle.fromSettings = fromSettings;
})(TokenStyle || (TokenStyle = {}));
export var SemanticTokenRule;
(function (SemanticTokenRule) {
    function fromJSONObject(registry, o) {
        if (o && typeof o._selector === 'string' && o._style) {
            const style = TokenStyle.fromJSONObject(o._style);
            if (style) {
                try {
                    return { selector: registry.parseTokenSelector(o._selector), style };
                }
                catch (_ignore) {
                }
            }
        }
        return undefined;
    }
    SemanticTokenRule.fromJSONObject = fromJSONObject;
    function toJSONObject(rule) {
        return {
            _selector: rule.selector.id,
            _style: TokenStyle.toJSONObject(rule.style)
        };
    }
    SemanticTokenRule.toJSONObject = toJSONObject;
    function equals(r1, r2) {
        if (r1 === r2) {
            return true;
        }
        return r1 !== undefined && r2 !== undefined
            && r1.selector && r2.selector && r1.selector.id === r2.selector.id
            && TokenStyle.equals(r1.style, r2.style);
    }
    SemanticTokenRule.equals = equals;
    function is(r) {
        return r && r.selector && typeof r.selector.id === 'string' && TokenStyle.is(r.style);
    }
    SemanticTokenRule.is = is;
})(SemanticTokenRule || (SemanticTokenRule = {}));
// TokenStyle registry
const Extensions = {
    TokenClassificationContribution: 'base.contributions.tokenClassification'
};
class TokenClassificationRegistry extends Disposable {
    constructor() {
        super();
        this._onDidChangeSchema = this._register(new Emitter());
        this.onDidChangeSchema = this._onDidChangeSchema.event;
        this.currentTypeNumber = 0;
        this.currentModifierBit = 1;
        this.tokenStylingDefaultRules = [];
        this.tokenStylingSchema = {
            type: 'object',
            properties: {},
            patternProperties: {
                [selectorPattern]: getStylingSchemeEntry()
            },
            //errorMessage: nls.localize('schema.token.errors', 'Valid token selectors have the form (*|tokenType)(.tokenModifier)*(:tokenLanguage)?.'),
            additionalProperties: false,
            definitions: {
                style: {
                    type: 'object',
                    description: nls.localize('schema.token.settings', 'Colors and styles for the token.'),
                    properties: {
                        foreground: {
                            type: 'string',
                            description: nls.localize('schema.token.foreground', 'Foreground color for the token.'),
                            format: 'color-hex',
                            default: '#ff0000'
                        },
                        background: {
                            type: 'string',
                            deprecationMessage: nls.localize('schema.token.background.warning', 'Token background colors are currently not supported.')
                        },
                        fontStyle: {
                            type: 'string',
                            description: nls.localize('schema.token.fontStyle', 'Sets the all font styles of the rule: \'italic\', \'bold\', \'underline\' or \'strikethrough\' or a combination. All styles that are not listed are unset. The empty string unsets all styles.'),
                            pattern: fontStylePattern,
                            patternErrorMessage: nls.localize('schema.fontStyle.error', 'Font style must be \'italic\', \'bold\', \'underline\' or \'strikethrough\' or a combination. The empty string unsets all styles.'),
                            defaultSnippets: [
                                { label: nls.localize('schema.token.fontStyle.none', 'None (clear inherited style)'), bodyText: '""' },
                                { body: 'italic' },
                                { body: 'bold' },
                                { body: 'underline' },
                                { body: 'strikethrough' },
                                { body: 'italic bold' },
                                { body: 'italic underline' },
                                { body: 'italic strikethrough' },
                                { body: 'bold underline' },
                                { body: 'bold strikethrough' },
                                { body: 'underline strikethrough' },
                                { body: 'italic bold underline' },
                                { body: 'italic bold strikethrough' },
                                { body: 'italic underline strikethrough' },
                                { body: 'bold underline strikethrough' },
                                { body: 'italic bold underline strikethrough' }
                            ]
                        },
                        bold: {
                            type: 'boolean',
                            description: nls.localize('schema.token.bold', 'Sets or unsets the font style to bold. Note, the presence of \'fontStyle\' overrides this setting.'),
                        },
                        italic: {
                            type: 'boolean',
                            description: nls.localize('schema.token.italic', 'Sets or unsets the font style to italic. Note, the presence of \'fontStyle\' overrides this setting.'),
                        },
                        underline: {
                            type: 'boolean',
                            description: nls.localize('schema.token.underline', 'Sets or unsets the font style to underline. Note, the presence of \'fontStyle\' overrides this setting.'),
                        },
                        strikethrough: {
                            type: 'boolean',
                            description: nls.localize('schema.token.strikethrough', 'Sets or unsets the font style to strikethrough. Note, the presence of \'fontStyle\' overrides this setting.'),
                        }
                    },
                    defaultSnippets: [{ body: { foreground: '${1:#FF0000}', fontStyle: '${2:bold}' } }]
                }
            }
        };
        this.tokenTypeById = Object.create(null);
        this.tokenModifierById = Object.create(null);
        this.typeHierarchy = Object.create(null);
    }
    registerTokenType(id, description, superType, deprecationMessage) {
        if (!id.match(typeAndModifierIdPattern)) {
            throw new Error('Invalid token type id.');
        }
        if (superType && !superType.match(typeAndModifierIdPattern)) {
            throw new Error('Invalid token super type id.');
        }
        const num = this.currentTypeNumber++;
        const tokenStyleContribution = { num, id, superType, description, deprecationMessage };
        this.tokenTypeById[id] = tokenStyleContribution;
        const stylingSchemeEntry = getStylingSchemeEntry(description, deprecationMessage);
        this.tokenStylingSchema.properties[id] = stylingSchemeEntry;
        this.typeHierarchy = Object.create(null);
    }
    registerTokenModifier(id, description, deprecationMessage) {
        if (!id.match(typeAndModifierIdPattern)) {
            throw new Error('Invalid token modifier id.');
        }
        const num = this.currentModifierBit;
        this.currentModifierBit = this.currentModifierBit * 2;
        const tokenStyleContribution = { num, id, description, deprecationMessage };
        this.tokenModifierById[id] = tokenStyleContribution;
        this.tokenStylingSchema.properties[`*.${id}`] = getStylingSchemeEntry(description, deprecationMessage);
    }
    parseTokenSelector(selectorString, language) {
        const selector = parseClassifierString(selectorString, language);
        if (!selector.type) {
            return {
                match: () => -1,
                id: '$invalid'
            };
        }
        return {
            match: (type, modifiers, language) => {
                let score = 0;
                if (selector.language !== undefined) {
                    if (selector.language !== language) {
                        return -1;
                    }
                    score += 10;
                }
                if (selector.type !== TOKEN_TYPE_WILDCARD) {
                    const hierarchy = this.getTypeHierarchy(type);
                    const level = hierarchy.indexOf(selector.type);
                    if (level === -1) {
                        return -1;
                    }
                    score += (100 - level);
                }
                // all selector modifiers must be present
                for (const selectorModifier of selector.modifiers) {
                    if (modifiers.indexOf(selectorModifier) === -1) {
                        return -1;
                    }
                }
                return score + selector.modifiers.length * 100;
            },
            id: `${[selector.type, ...selector.modifiers.sort()].join('.')}${selector.language !== undefined ? ':' + selector.language : ''}`
        };
    }
    registerTokenStyleDefault(selector, defaults) {
        this.tokenStylingDefaultRules.push({ selector, defaults });
    }
    deregisterTokenStyleDefault(selector) {
        const selectorString = selector.id;
        this.tokenStylingDefaultRules = this.tokenStylingDefaultRules.filter(r => r.selector.id !== selectorString);
    }
    deregisterTokenType(id) {
        delete this.tokenTypeById[id];
        delete this.tokenStylingSchema.properties[id];
        this.typeHierarchy = Object.create(null);
    }
    deregisterTokenModifier(id) {
        delete this.tokenModifierById[id];
        delete this.tokenStylingSchema.properties[`*.${id}`];
    }
    getTokenTypes() {
        return Object.keys(this.tokenTypeById).map(id => this.tokenTypeById[id]);
    }
    getTokenModifiers() {
        return Object.keys(this.tokenModifierById).map(id => this.tokenModifierById[id]);
    }
    getTokenStylingSchema() {
        return this.tokenStylingSchema;
    }
    getTokenStylingDefaultRules() {
        return this.tokenStylingDefaultRules;
    }
    getTypeHierarchy(typeId) {
        let hierarchy = this.typeHierarchy[typeId];
        if (!hierarchy) {
            this.typeHierarchy[typeId] = hierarchy = [typeId];
            let type = this.tokenTypeById[typeId];
            while (type && type.superType) {
                hierarchy.push(type.superType);
                type = this.tokenTypeById[type.superType];
            }
        }
        return hierarchy;
    }
    toString() {
        const sorter = (a, b) => {
            const cat1 = a.indexOf('.') === -1 ? 0 : 1;
            const cat2 = b.indexOf('.') === -1 ? 0 : 1;
            if (cat1 !== cat2) {
                return cat1 - cat2;
            }
            return a.localeCompare(b);
        };
        return Object.keys(this.tokenTypeById).sort(sorter).map(k => `- \`${k}\`: ${this.tokenTypeById[k].description}`).join('\n');
    }
}
const CHAR_LANGUAGE = TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR.charCodeAt(0);
const CHAR_MODIFIER = CLASSIFIER_MODIFIER_SEPARATOR.charCodeAt(0);
export function parseClassifierString(s, defaultLanguage) {
    let k = s.length;
    let language = defaultLanguage;
    const modifiers = [];
    for (let i = k - 1; i >= 0; i--) {
        const ch = s.charCodeAt(i);
        if (ch === CHAR_LANGUAGE || ch === CHAR_MODIFIER) {
            const segment = s.substring(i + 1, k);
            k = i;
            if (ch === CHAR_LANGUAGE) {
                language = segment;
            }
            else {
                modifiers.push(segment);
            }
        }
    }
    const type = s.substring(0, k);
    return { type, modifiers, language };
}
const tokenClassificationRegistry = createDefaultTokenClassificationRegistry();
platform.Registry.add(Extensions.TokenClassificationContribution, tokenClassificationRegistry);
function createDefaultTokenClassificationRegistry() {
    const registry = new TokenClassificationRegistry();
    function registerTokenType(id, description, scopesToProbe = [], superType, deprecationMessage) {
        registry.registerTokenType(id, description, superType, deprecationMessage);
        if (scopesToProbe) {
            registerTokenStyleDefault(id, scopesToProbe);
        }
        return id;
    }
    function registerTokenStyleDefault(selectorString, scopesToProbe) {
        try {
            const selector = registry.parseTokenSelector(selectorString);
            registry.registerTokenStyleDefault(selector, { scopesToProbe });
        }
        catch (e) {
            console.log(e);
        }
    }
    // default token types
    registerTokenType('comment', nls.localize('comment', "Style for comments."), [['comment']]);
    registerTokenType('string', nls.localize('string', "Style for strings."), [['string']]);
    registerTokenType('keyword', nls.localize('keyword', "Style for keywords."), [['keyword.control']]);
    registerTokenType('number', nls.localize('number', "Style for numbers."), [['constant.numeric']]);
    registerTokenType('regexp', nls.localize('regexp', "Style for expressions."), [['constant.regexp']]);
    registerTokenType('operator', nls.localize('operator', "Style for operators."), [['keyword.operator']]);
    registerTokenType('namespace', nls.localize('namespace', "Style for namespaces."), [['entity.name.namespace']]);
    registerTokenType('type', nls.localize('type', "Style for types."), [['entity.name.type'], ['support.type']]);
    registerTokenType('struct', nls.localize('struct', "Style for structs."), [['entity.name.type.struct']]);
    registerTokenType('class', nls.localize('class', "Style for classes."), [['entity.name.type.class'], ['support.class']]);
    registerTokenType('interface', nls.localize('interface', "Style for interfaces."), [['entity.name.type.interface']]);
    registerTokenType('enum', nls.localize('enum', "Style for enums."), [['entity.name.type.enum']]);
    registerTokenType('typeParameter', nls.localize('typeParameter', "Style for type parameters."), [['entity.name.type.parameter']]);
    registerTokenType('function', nls.localize('function', "Style for functions"), [['entity.name.function'], ['support.function']]);
    registerTokenType('member', nls.localize('member', "Style for member functions"), [], 'method', 'Deprecated use `method` instead');
    registerTokenType('method', nls.localize('method', "Style for method (member functions)"), [['entity.name.function.member'], ['support.function']]);
    registerTokenType('macro', nls.localize('macro', "Style for macros."), [['entity.name.function.preprocessor']]);
    registerTokenType('variable', nls.localize('variable', "Style for variables."), [['variable.other.readwrite'], ['entity.name.variable']]);
    registerTokenType('parameter', nls.localize('parameter', "Style for parameters."), [['variable.parameter']]);
    registerTokenType('property', nls.localize('property', "Style for properties."), [['variable.other.property']]);
    registerTokenType('enumMember', nls.localize('enumMember', "Style for enum members."), [['variable.other.enummember']]);
    registerTokenType('event', nls.localize('event', "Style for events."), [['variable.other.event']]);
    registerTokenType('decorator', nls.localize('decorator', "Style for decorators & annotations."), [['entity.name.decorator'], ['entity.name.function']]);
    registerTokenType('label', nls.localize('labels', "Style for labels. "), undefined);
    // default token modifiers
    registry.registerTokenModifier('declaration', nls.localize('declaration', "Style for all symbol declarations."), undefined);
    registry.registerTokenModifier('documentation', nls.localize('documentation', "Style to use for references in documentation."), undefined);
    registry.registerTokenModifier('static', nls.localize('static', "Style to use for symbols that are static."), undefined);
    registry.registerTokenModifier('abstract', nls.localize('abstract', "Style to use for symbols that are abstract."), undefined);
    registry.registerTokenModifier('deprecated', nls.localize('deprecated', "Style to use for symbols that are deprecated."), undefined);
    registry.registerTokenModifier('modification', nls.localize('modification', "Style to use for write accesses."), undefined);
    registry.registerTokenModifier('async', nls.localize('async', "Style to use for symbols that are async."), undefined);
    registry.registerTokenModifier('readonly', nls.localize('readonly', "Style to use for symbols that are read-only."), undefined);
    registerTokenStyleDefault('variable.readonly', [['variable.other.constant']]);
    registerTokenStyleDefault('property.readonly', [['variable.other.constant.property']]);
    registerTokenStyleDefault('type.defaultLibrary', [['support.type']]);
    registerTokenStyleDefault('class.defaultLibrary', [['support.class']]);
    registerTokenStyleDefault('interface.defaultLibrary', [['support.class']]);
    registerTokenStyleDefault('variable.defaultLibrary', [['support.variable'], ['support.other.variable']]);
    registerTokenStyleDefault('variable.defaultLibrary.readonly', [['support.constant']]);
    registerTokenStyleDefault('property.defaultLibrary', [['support.variable.property']]);
    registerTokenStyleDefault('property.defaultLibrary.readonly', [['support.constant.property']]);
    registerTokenStyleDefault('function.defaultLibrary', [['support.function']]);
    registerTokenStyleDefault('member.defaultLibrary', [['support.function']]);
    return registry;
}
export function getTokenClassificationRegistry() {
    return tokenClassificationRegistry;
}
function getStylingSchemeEntry(description, deprecationMessage) {
    return {
        description,
        deprecationMessage,
        defaultSnippets: [{ body: '${1:#ff0000}' }],
        anyOf: [
            {
                type: 'string',
                format: 'color-hex'
            },
            {
                $ref: '#/definitions/style'
            }
        ]
    };
}
export const tokenStylingSchemaId = 'vscode://schemas/token-styling';
const schemaRegistry = platform.Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(tokenStylingSchemaId, tokenClassificationRegistry.getTokenStylingSchema());
const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(tokenStylingSchemaId), 200);
tokenClassificationRegistry.onDidChangeSchema(() => {
    if (!delayer.isScheduled()) {
        delayer.schedule();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGhlbWUvY29tbW9uL3Rva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBRS9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxVQUFVLElBQUksY0FBYyxFQUE2QixNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sS0FBSyxRQUFRLE1BQU0sbUNBQW1DLENBQUM7QUFHOUQsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUM7QUFDaEMsTUFBTSxtQ0FBbUMsR0FBRyxHQUFHLENBQUM7QUFDaEQsTUFBTSw2QkFBNkIsR0FBRyxHQUFHLENBQUM7QUFLMUMsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLElBQUksU0FBUyxHQUFHLENBQUM7QUFFekQsTUFBTSxlQUFlLEdBQUcsS0FBSyxTQUFTLFdBQVcsNkJBQTZCLEdBQUcsU0FBUyxNQUFNLG1DQUFtQyxHQUFHLFNBQVMsS0FBSyxDQUFDO0FBRXJKLE1BQU0sZ0JBQWdCLEdBQUcsb0RBQW9ELENBQUM7QUF3QjlFLE1BQU0sT0FBTyxVQUFVO0lBQ3RCLFlBQ2lCLFVBQTZCLEVBQzdCLElBQXlCLEVBQ3pCLFNBQThCLEVBQzlCLGFBQWtDLEVB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