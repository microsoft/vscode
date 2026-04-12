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
exports.asPlainTextWithLinks = asPlainTextWithLinks;
exports.tagsToMarkdown = tagsToMarkdown;
exports.documentationToMarkdown = documentationToMarkdown;
exports.appendDocumentationAsMarkdown = appendDocumentationAsMarkdown;
const vscode = __importStar(require("vscode"));
const openJsDocLink_1 = require("../../commands/openJsDocLink");
const typeConverters = __importStar(require("../../typeConverters"));
function getTagBodyText(tag, filePathConverter) {
    if (!tag.text) {
        return undefined;
    }
    // Convert to markdown code block if it does not already contain one
    function makeCodeblock(text) {
        if (/^\s*[~`]{3}/m.test(text)) {
            return text;
        }
        return '```tsx\n' + text + '\n```';
    }
    let text = convertLinkTags(tag.text, filePathConverter);
    switch (tag.name) {
        case 'example': {
            // Example text does not support `{@link}` as it is considered code.
            // TODO: should we support it if it appears outside of an explicit code block?
            text = asPlainText(tag.text);
            // check for caption tags, fix for #79704
            const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
            if (captionTagMatches && captionTagMatches.index === 0) {
                return captionTagMatches[1] + '\n' + makeCodeblock(text.substr(captionTagMatches[0].length));
            }
            else {
                return makeCodeblock(text);
            }
        }
        case 'author': {
            // fix obsucated email address, #80898
            const emailMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);
            if (emailMatch === null) {
                return text;
            }
            else {
                return `${emailMatch[1]} ${emailMatch[2]}`;
            }
        }
        case 'default': {
            return makeCodeblock(text);
        }
        default: {
            return text;
        }
    }
}
function getTagDocumentation(tag, filePathConverter) {
    switch (tag.name) {
        case 'augments':
        case 'extends':
        case 'param':
        case 'template': {
            const body = getTagBody(tag, filePathConverter);
            if (body?.length === 3) {
                const param = body[1];
                const doc = body[2];
                const label = `*@${tag.name}* \`${param}\``;
                if (!doc) {
                    return label;
                }
                return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` \u2014 ${doc}`);
            }
            break;
        }
        case 'return':
        case 'returns': {
            // For return(s), we require a non-empty body
            if (!tag.text?.length) {
                return undefined;
            }
            break;
        }
    }
    // Generic tag
    const label = `*@${tag.name}*`;
    const text = getTagBodyText(tag, filePathConverter);
    if (!text) {
        return label;
    }
    return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` \u2014 ${text}`);
}
function getTagBody(tag, filePathConverter) {
    if (tag.name === 'template') {
        const parts = tag.text;
        if (parts && typeof (parts) !== 'string') {
            const params = parts.filter(p => p.kind === 'typeParameterName').map(p => p.text).join(', ');
            const docs = parts.filter(p => p.kind === 'text').map(p => convertLinkTags(p.text.replace(/^\s*-?\s*/, ''), filePathConverter)).join(' ');
            return params ? ['', params, docs] : undefined;
        }
    }
    return (convertLinkTags(tag.text, filePathConverter)).split(/^(\S+)\s*-?\s*/);
}
function asPlainText(parts) {
    if (typeof parts === 'string') {
        return parts;
    }
    return parts.map(part => part.text).join('');
}
function asPlainTextWithLinks(parts, filePathConverter) {
    return convertLinkTags(parts, filePathConverter);
}
/**
 * Convert `@link` inline tags to markdown links
 */
function convertLinkTags(parts, filePathConverter) {
    if (!parts) {
        return '';
    }
    if (typeof parts === 'string') {
        return parts;
    }
    const out = [];
    let currentLink;
    for (const part of parts) {
        switch (part.kind) {
            case 'link':
                if (currentLink) {
                    if (currentLink.target) {
                        const file = filePathConverter.toResource(currentLink.target.file);
                        const args = {
                            file: { ...file.toJSON(), $mid: undefined }, // Prevent VS Code from trying to transform the uri,
                            position: typeConverters.Position.fromLocation(currentLink.target.start)
                        };
                        const command = `command:${openJsDocLink_1.OpenJsDocLinkCommand.id}?${encodeURIComponent(JSON.stringify([args]))}`;
                        const linkText = currentLink.text ? currentLink.text : escapeMarkdownSyntaxTokensForCode(currentLink.name ?? '');
                        out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${command} "${vscode.l10n.t('Open symbol link')}")`);
                    }
                    else {
                        const text = currentLink.text ?? currentLink.name;
                        if (text) {
                            if (/^https?:/.test(text)) {
                                const parts = text.split(' ');
                                if (parts.length === 1 && !currentLink.linkcode) {
                                    out.push(`<${parts[0]}>`);
                                }
                                else {
                                    const linkText = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
                                    out.push(`[${currentLink.linkcode ? '`' + escapeMarkdownSyntaxTokensForCode(linkText) + '`' : linkText}](${parts[0]})`);
                                }
                            }
                            else {
                                out.push(escapeMarkdownSyntaxTokensForCode(text));
                            }
                        }
                    }
                    currentLink = undefined;
                }
                else {
                    currentLink = {
                        linkcode: part.text === '{@linkcode '
                    };
                }
                break;
            case 'linkName':
                if (currentLink) {
                    currentLink.name = part.text;
                    currentLink.target = part.target;
                }
                break;
            case 'linkText':
                if (currentLink) {
                    currentLink.text = part.text;
                }
                break;
            default:
                out.push(part.text);
                break;
        }
    }
    return out.join('');
}
function escapeMarkdownSyntaxTokensForCode(text) {
    return text.replace(/`/g, '\\$&'); // CodeQL [SM02383] This is only meant to escape backticks. The Markdown is fully sanitized after being rendered.
}
function tagsToMarkdown(tags, filePathConverter) {
    return tags.map(tag => getTagDocumentation(tag, filePathConverter)).join('  \n\n');
}
function documentationToMarkdown(documentation, tags, filePathConverter, baseUri) {
    const out = new vscode.MarkdownString();
    appendDocumentationAsMarkdown(out, documentation, tags, filePathConverter);
    out.baseUri = baseUri;
    out.isTrusted = { enabledCommands: [openJsDocLink_1.OpenJsDocLinkCommand.id] };
    return out;
}
function appendDocumentationAsMarkdown(out, documentation, tags, converter) {
    if (documentation) {
        out.appendMarkdown(asPlainTextWithLinks(documentation, converter));
    }
    if (tags) {
        const tagsPreview = tagsToMarkdown(tags, converter);
        if (tagsPreview) {
            out.appendMarkdown('\n\n' + tagsPreview);
        }
    }
    out.isTrusted = { enabledCommands: [openJsDocLink_1.OpenJsDocLinkCommand.id] };
    return out;
}
//# sourceMappingURL=textRendering.js.map