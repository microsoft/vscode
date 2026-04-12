/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageAgnosticBracketTokens } from './bracketPairsTree/brackets.js';
import { lengthAdd, lengthGetColumnCountIfZeroLineCount, lengthZero } from './bracketPairsTree/length.js';
import { parseDocument } from './bracketPairsTree/parser.js';
import { DenseKeyProvider } from './bracketPairsTree/smallImmutableSet.js';
import { TextBufferTokenizer } from './bracketPairsTree/tokenizer.js';
export function fixBracketsInLine(tokens, languageConfigurationService) {
    const denseKeyProvider = new DenseKeyProvider();
    const bracketTokens = new LanguageAgnosticBracketTokens(denseKeyProvider, (languageId) => languageConfigurationService.getLanguageConfiguration(languageId));
    const tokenizer = new TextBufferTokenizer(new StaticTokenizerSource([tokens]), bracketTokens);
    const node = parseDocument(tokenizer, [], undefined, true);
    let str = '';
    const line = tokens.getLineContent();
    function processNode(node, offset) {
        if (node.kind === 2 /* AstNodeKind.Pair */) {
            processNode(node.openingBracket, offset);
            offset = lengthAdd(offset, node.openingBracket.length);
            if (node.child) {
                processNode(node.child, offset);
                offset = lengthAdd(offset, node.child.length);
            }
            if (node.closingBracket) {
                processNode(node.closingBracket, offset);
                offset = lengthAdd(offset, node.closingBracket.length);
            }
            else {
                const singleLangBracketTokens = bracketTokens.getSingleLanguageBracketTokens(node.openingBracket.languageId);
                const closingTokenText = singleLangBracketTokens.findClosingTokenText(node.openingBracket.bracketIds);
                str += closingTokenText;
            }
        }
        else if (node.kind === 3 /* AstNodeKind.UnexpectedClosingBracket */) {
            // remove the bracket
        }
        else if (node.kind === 0 /* AstNodeKind.Text */ || node.kind === 1 /* AstNodeKind.Bracket */) {
            str += line.substring(lengthGetColumnCountIfZeroLineCount(offset), lengthGetColumnCountIfZeroLineCount(lengthAdd(offset, node.length)));
        }
        else if (node.kind === 4 /* AstNodeKind.List */) {
            for (const child of node.children) {
                processNode(child, offset);
                offset = lengthAdd(offset, child.length);
            }
        }
    }
    processNode(node, lengthZero);
    return str;
}
class StaticTokenizerSource {
    constructor(lines) {
        this.lines = lines;
        this.tokenization = {
            getLineTokens: (lineNumber) => {
                return this.lines[lineNumber - 1];
            }
        };
    }
    getValue() {
        return this.lines.map(l => l.getLineContent()).join('\n');
    }
    getLineCount() {
        return this.lines.length;
    }
    getLineLength(lineNumber) {
        return this.lines[lineNumber - 1].getLineContent().length;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZml4QnJhY2tldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvZml4QnJhY2tldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0UsT0FBTyxFQUFVLFNBQVMsRUFBRSxtQ0FBbUMsRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNsSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDM0UsT0FBTyxFQUFvQixtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBR3hGLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxNQUF1QixFQUFFLDRCQUEyRDtJQUNySCxNQUFNLGdCQUFnQixHQUFHLElBQUksZ0JBQWdCLEVBQVUsQ0FBQztJQUN4RCxNQUFNLGFBQWEsR0FBRyxJQUFJLDZCQUE2QixDQUFDLGdCQUFnQixFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FDeEYsNEJBQTRCLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLENBQ2pFLENBQUM7SUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLG1CQUFtQixDQUN4QyxJQUFJLHFCQUFxQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFDbkMsYUFBYSxDQUNiLENBQUM7SUFDRixNQUFNLElBQUksR0FBRyxhQUFhLENBQUMsU0FBUyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFFM0QsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ2IsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLGNBQWMs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