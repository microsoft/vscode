/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Open ended enum at runtime
 */
export var LanguageId;
(function (LanguageId) {
    LanguageId[LanguageId["Null"] = 0] = "Null";
    LanguageId[LanguageId["PlainText"] = 1] = "PlainText";
})(LanguageId || (LanguageId = {}));
/**
 * A font style. Values are 2^x such that a bit mask can be used.
 */
export var FontStyle;
(function (FontStyle) {
    FontStyle[FontStyle["NotSet"] = -1] = "NotSet";
    FontStyle[FontStyle["None"] = 0] = "None";
    FontStyle[FontStyle["Italic"] = 1] = "Italic";
    FontStyle[FontStyle["Bold"] = 2] = "Bold";
    FontStyle[FontStyle["Underline"] = 4] = "Underline";
    FontStyle[FontStyle["Strikethrough"] = 8] = "Strikethrough";
})(FontStyle || (FontStyle = {}));
/**
 * Open ended enum at runtime
 */
export var ColorId;
(function (ColorId) {
    ColorId[ColorId["None"] = 0] = "None";
    ColorId[ColorId["DefaultForeground"] = 1] = "DefaultForeground";
    ColorId[ColorId["DefaultBackground"] = 2] = "DefaultBackground";
})(ColorId || (ColorId = {}));
/**
 * A standard token type.
 */
export var StandardTokenType;
(function (StandardTokenType) {
    StandardTokenType[StandardTokenType["Other"] = 0] = "Other";
    StandardTokenType[StandardTokenType["Comment"] = 1] = "Comment";
    StandardTokenType[StandardTokenType["String"] = 2] = "String";
    StandardTokenType[StandardTokenType["RegEx"] = 3] = "RegEx";
})(StandardTokenType || (StandardTokenType = {}));
/**
 * Helpers to manage the "collapsed" metadata of an entire StackElement stack.
 * The following assumptions have been made:
 *  - languageId < 256 => needs 8 bits
 *  - unique color count < 512 => needs 9 bits
 *
 * The binary format is:
 * - -------------------------------------------
 *     3322 2222 2222 1111 1111 1100 0000 0000
 *     1098 7654 3210 9876 5432 1098 7654 3210
 * - -------------------------------------------
 *     xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx
 *     bbbb bbbb ffff ffff fFFF FBTT LLLL LLLL
 * - -------------------------------------------
 *  - L = LanguageId (8 bits)
 *  - T = StandardTokenType (2 bits)
 *  - B = Balanced bracket (1 bit)
 *  - F = FontStyle (4 bits)
 *  - f = foreground color (9 bits)
 *  - b = background color (8 bits)
 *
 */
export var MetadataConsts;
(function (MetadataConsts) {
    MetadataConsts[MetadataConsts["LANGUAGEID_MASK"] = 255] = "LANGUAGEID_MASK";
    MetadataConsts[MetadataConsts["TOKEN_TYPE_MASK"] = 768] = "TOKEN_TYPE_MASK";
    MetadataConsts[MetadataConsts["BALANCED_BRACKETS_MASK"] = 1024] = "BALANCED_BRACKETS_MASK";
    MetadataConsts[MetadataConsts["FONT_STYLE_MASK"] = 30720] = "FONT_STYLE_MASK";
    MetadataConsts[MetadataConsts["FOREGROUND_MASK"] = 16744448] = "FOREGROUND_MASK";
    MetadataConsts[MetadataConsts["BACKGROUND_MASK"] = 4278190080] = "BACKGROUND_MASK";
    MetadataConsts[MetadataConsts["ITALIC_MASK"] = 2048] = "ITALIC_MASK";
    MetadataConsts[MetadataConsts["BOLD_MASK"] = 4096] = "BOLD_MASK";
    MetadataConsts[MetadataConsts["UNDERLINE_MASK"] = 8192] = "UNDERLINE_MASK";
    MetadataConsts[MetadataConsts["STRIKETHROUGH_MASK"] = 16384] = "STRIKETHROUGH_MASK";
    // Semantic tokens cannot set the language id, so we can
    // use the first 8 bits for control purposes
    MetadataConsts[MetadataConsts["SEMANTIC_USE_ITALIC"] = 1] = "SEMANTIC_USE_ITALIC";
    MetadataConsts[MetadataConsts["SEMANTIC_USE_BOLD"] = 2] = "SEMANTIC_USE_BOLD";
    MetadataConsts[MetadataConsts["SEMANTIC_USE_UNDERLINE"] = 4] = "SEMANTIC_USE_UNDERLINE";
    MetadataConsts[MetadataConsts["SEMANTIC_USE_STRIKETHROUGH"] = 8] = "SEMANTIC_USE_STRIKETHROUGH";
    MetadataConsts[MetadataConsts["SEMANTIC_USE_FOREGROUND"] = 16] = "SEMANTIC_USE_FOREGROUND";
    MetadataConsts[MetadataConsts["SEMANTIC_USE_BACKGROUND"] = 32] = "SEMANTIC_USE_BACKGROUND";
    MetadataConsts[MetadataConsts["LANGUAGEID_OFFSET"] = 0] = "LANGUAGEID_OFFSET";
    MetadataConsts[MetadataConsts["TOKEN_TYPE_OFFSET"] = 8] = "TOKEN_TYPE_OFFSET";
    MetadataConsts[MetadataConsts["BALANCED_BRACKETS_OFFSET"] = 10] = "BALANCED_BRACKETS_OFFSET";
    MetadataConsts[MetadataConsts["FONT_STYLE_OFFSET"] = 11] = "FONT_STYLE_OFFSET";
    MetadataConsts[MetadataConsts["FOREGROUND_OFFSET"] = 15] = "FOREGROUND_OFFSET";
    MetadataConsts[MetadataConsts["BACKGROUND_OFFSET"] = 24] = "BACKGROUND_OFFSET";
})(MetadataConsts || (MetadataConsts = {}));
/**
 */
export class TokenMetadata {
    static getLanguageId(metadata) {
        return (metadata & 255 /* MetadataConsts.LANGUAGEID_MASK */) >>> 0 /* MetadataConsts.LANGUAGEID_OFFSET */;
    }
    static getTokenType(metadata) {
        return (metadata & 768 /* MetadataConsts.TOKEN_TYPE_MASK */) >>> 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */;
    }
    static containsBalancedBrackets(metadata) {
        return (metadata & 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */) !== 0;
    }
    static getFontStyle(metadata) {
        return (metadata & 30720 /* MetadataConsts.FONT_STYLE_MASK */) >>> 11 /* MetadataConsts.FONT_STYLE_OFFSET */;
    }
    static getForeground(metadata) {
        return (metadata & 16744448 /* MetadataConsts.FOREGROUND_MASK */) >>> 15 /* MetadataConsts.FOREGROUND_OFFSET */;
    }
    static getBackground(metadata) {
        return (metadata & 4278190080 /* MetadataConsts.BACKGROUND_MASK */) >>> 24 /* MetadataConsts.BACKGROUND_OFFSET */;
    }
    static getClassNameFromMetadata(metadata) {
        const foreground = this.getForeground(metadata);
        let className = 'mtk' + foreground;
        const fontStyle = this.getFontStyle(metadata);
        if (fontStyle & 1 /* FontStyle.Italic */) {
            className += ' mtki';
        }
        if (fontStyle & 2 /* FontStyle.Bold */) {
            className += ' mtkb';
        }
        if (fontStyle & 4 /* FontStyle.Underline */) {
            className += ' mtku';
        }
        if (fontStyle & 8 /* FontStyle.Strikethrough */) {
            className += ' mtks';
        }
        return className;
    }
    static getInlineStyleFromMetadata(metadata, colorMap) {
        const foreground = this.getForeground(metadata);
        const fontStyle = this.getFontStyle(metadata);
        let result = `color: ${colorMap[foreground]};`;
        if (fontStyle & 1 /* FontStyle.Italic */) {
            result += 'font-style: italic;';
        }
        if (fontStyle & 2 /* FontStyle.Bold */) {
            result += 'font-weight: bold;';
        }
        let textDecoration = '';
        if (fontStyle & 4 /* FontStyle.Underline */) {
            textDecoration += ' underline';
        }
        if (fontStyle & 8 /* FontStyle.Strikethrough */) {
            textDecoration += ' line-through';
        }
        if (textDecoration) {
            result += `text-decoration:${textDecoration};`;
        }
        return result;
    }
    static getPresentationFromMetadata(metadata) {
        const foreground = this.getForeground(metadata);
        const fontStyle = this.getFontStyle(metadata);
        return {
            foreground: foreground,
            italic: Boolean(fontStyle & 1 /* FontStyle.Italic */),
            bold: Boolean(fontStyle & 2 /* FontStyle.Bold */),
            underline: Boolean(fontStyle & 4 /* FontStyle.Underline */),
            strikethrough: Boolean(fontStyle & 8 /* FontStyle.Strikethrough */),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFrQixVQUdqQjtBQUhELFdBQWtCLFVBQVU7SUFDM0IsMkNBQVEsQ0FBQTtJQUNSLHFEQUFhLENBQUE7QUFDZCxDQUFDLEVBSGlCLFVBQVUsS0FBVixVQUFVLFFBRzNCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsU0FPakI7QUFQRCxXQUFrQixTQUFTO0lBQzFCLDhDQUFXLENBQUE7SUFDWCx5Q0FBUSxDQUFBO0lBQ1IsNkNBQVUsQ0FBQTtJQUNWLHlDQUFRLENBQUE7SUFDUixtREFBYSxDQUFBO0lBQ2IsMkRBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQVBpQixTQUFTLEtBQVQsU0FBUyxRQU8xQjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLE9BSWpCO0FBSkQsV0FBa0IsT0FBTztJQUN4QixxQ0FBUSxDQUFBO0lBQ1IsK0RBQXFCLENBQUE7SUFDckIsK0RBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQUppQixPQUFPLEtBQVAsT0FBTyxRQUl4QjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGlCQUtqQjtBQUxELFdBQWtCLGlCQUFpQjtJQUNsQywyREFBUyxDQUFBO0lBQ1QsK0RBQVcsQ0FBQTtJQUNYLDZEQUFVLENBQUE7SUFDViwyREFBUyxDQUFBO0FBQ1YsQ0FBQyxFQUxpQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBS2xDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXFCRztBQUNILE1BQU0sQ0FBTixJQUFrQixjQTRCakI7QUE1QkQsV0FBa0IsY0FBYztJQUMv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