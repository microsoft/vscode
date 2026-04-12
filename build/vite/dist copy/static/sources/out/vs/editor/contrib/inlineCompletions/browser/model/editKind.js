const syntacticalChars = new Set([';', ',', '=', '+', '-', '*', '/', '{', '}', '(', ')', '[', ']', '<', '>', ':', '.', '!', '?', '&', '|', '^', '%', '@', '#', '~', '`', '\\', '\'', '"', '$']);
function isSyntacticalChar(char) {
    return syntacticalChars.has(char);
}
function isIdentifierChar(char) {
    return /[a-zA-Z0-9_]/.test(char);
}
function isWhitespaceChar(char) {
    return char === ' ' || char === '\t';
}
function analyzeTextShape(text) {
    const lines = text.split(/\r\n|\r|\n/);
    if (lines.length > 1) {
        return {
            kind: 'multiLine',
            lineCount: lines.length,
        };
    }
    const isSingleChar = text.length === 1;
    let singleCharKind;
    if (isSingleChar) {
        if (isSyntacticalChar(text)) {
            singleCharKind = 'syntactical';
        }
        else if (isIdentifierChar(text)) {
            singleCharKind = 'identifier';
        }
        else if (isWhitespaceChar(text)) {
            singleCharKind = 'whitespace';
        }
    }
    // Analyze whitespace patterns
    const whitespaceMatches = text.match(/[ \t]+/g) || [];
    const isMultipleWhitespace = whitespaceMatches.some(ws => ws.length > 1);
    const hasDuplicatedWhitespace = whitespaceMatches.some(ws => (ws.includes('  ') || ws.includes('\t\t')));
    // Analyze word patterns
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const isWord = words.length === 1 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(words[0]);
    const isMultipleWords = words.length > 1;
    return {
        kind: 'singleLine',
        isSingleCharacter: isSingleChar,
        singleCharacterKind: singleCharKind,
        isWord,
        isMultipleWords,
        isMultipleWhitespace,
        hasDuplicatedWhitespace,
    };
}
export class InlineSuggestionEditKind {
    constructor(edits) {
        this.edits = edits;
    }
    toString() {
        return JSON.stringify({ edits: this.edits });
    }
}
export function computeEditKind(edit, textModel, cursorPosition) {
    if (edit.replacements.length === 0) {
        // Empty edit - return undefined as there's no edit to classify
        return undefined;
    }
    return new InlineSuggestionEditKind(edit.replacements.map(rep => computeSingleEditKind(rep, textModel, cursorPosition)));
}
function countLines(text) {
    if (text.length === 0) {
        return 0;
    }
    return text.split(/\r\n|\r|\n/).length - 1;
}
function computeSingleEditKind(replacement, textModel, cursorPosition) {
    const replaceRange = replacement.replaceRange;
    const newText = replacement.newText;
    const deletedLength = replaceRange.length;
    const insertedLength = newText.length;
    const linesInserted = countLines(newText);
    const kind = replaceRange.isEmpty ? 'insert' : (newText.length === 0 ? 'delete' : 'replace');
    switch (kind) {
        case 'insert':
            return {
                operation: 'insert',
                properties: computeInsertProperties(replaceRange.start, newText, textModel, cursorPosition),
                charactersInserted: insertedLength,
                charactersDeleted: 0,
                linesInserted,
                linesDeleted: 0,
            };
        case 'delete': {
            const deletedText = textModel.getValue().substring(replaceRange.start, replaceRange.endExclusive);
            return {
                operation: 'delete',
                properties: computeDeleteProperties(replaceRange.start, replaceRange.endExclusive, textModel),
                charactersInserted: 0,
                charactersDeleted: deletedLength,
                linesInserted: 0,
                linesDeleted: countLines(deletedText),
            };
        }
        case 'replace': {
            const oldText = textModel.getValue().substring(replaceRange.start, replaceRange.endExclusive);
            return {
                operation: 'replace',
                properties: computeReplaceProperties(oldText, newText),
                charactersInserted: insertedLength,
                charactersDeleted: deletedLength,
                linesInserted,
                linesDeleted: countLines(oldText),
            };
        }
    }
}
function computeInsertProperties(offset, newText, textModel, cursorPosition) {
    const textShape = analyzeTextShape(newText);
    const insertPosition = textModel.getPositionAt(offset);
    const lineContent = textModel.getLineContent(insertPosition.lineNumber);
    const lineLength = lineContent.length;
    // Determine location shape
    let locationShape;
    const isLineEmpty = lineContent.trim().length === 0;
    const isAtEndOfLine = insertPosition.column > lineLength;
    const isAtStartOfLine = insertPosition.column === 1;
    if (isLineEmpty) {
        locationShape = 'emptyLine';
    }
    else if (isAtEndOfLine) {
        locationShape = 'endOfLine';
    }
    else if (isAtStartOfLine) {
        locationShape = 'startOfLine';
    }
    else {
        locationShape = 'middleOfLine';
    }
    // Compute relative to cursor if cursor position is provided
    let relativeToCursor;
    if (cursorPosition) {
        const cursorLine = cursorPosition.lineNumber;
        const insertLine = insertPosition.lineNumber;
        const cursorColumn = cursorPosition.column;
        const insertColumn = insertPosition.column;
        const atCursor = cursorLine === insertLine && cursorColumn === insertColumn;
        const beforeCursorOnSameLine = cursorLine === insertLine && insertColumn < cursorColumn;
        const afterCursorOnSameLine = cursorLine === insertLine && insertColumn > cursorColumn;
        const linesAbove = insertLine < cursorLine ? cursorLine - insertLine : undefined;
        const linesBelow = insertLine > cursorLine ? insertLine - cursorLine : undefined;
        relativeToCursor = {
            atCursor,
            beforeCursorOnSameLine,
            afterCursorOnSameLine,
            linesAbove,
            linesBelow,
        };
    }
    return {
        textShape,
        locationShape,
        relativeToCursor,
    };
}
function computeDeleteProperties(startOffset, endOffset, textModel) {
    const deletedText = textModel.getValue().substring(startOffset, endOffset);
    const textShape = analyzeTextShape(deletedText);
    const startPosition = textModel.getPositionAt(startOffset);
    const endPosition = textModel.getPositionAt(endOffset);
    // Check if delete is at end of line
    const lineContent = textModel.getLineContent(endPosition.lineNumber);
    const isAtEndOfLine = endPosition.column > lineContent.length;
    // Check if entire line content is deleted
    const deletesEntireLineContent = startPosition.lineNumber === endPosition.lineNumber &&
        startPosition.column === 1 &&
        endPosition.column > lineContent.length;
    return {
        textShape,
        isAtEndOfLine,
        deletesEntireLineContent,
    };
}
function computeReplaceProperties(oldText, newText) {
    const oldShape = analyzeTextShape(oldText);
    const newShape = analyzeTextShape(newText);
    const oldIsWord = oldShape.kind === 'singleLine' && oldShape.isWord;
    const newIsWord = newShape.kind === 'singleLine' && newShape.isWord;
    const isWordToWordReplacement = oldIsWord && newIsWord;
    const isAdditive = newText.length > oldText.length;
    const isSubtractive = newText.length < oldText.length;
    const isSingleLineToSingleLine = oldShape.kind === 'singleLine' && newShape.kind === 'singleLine';
    const isSingleLineToMultiLine = oldShape.kind === 'singleLine' && newShape.kind === 'multiLine';
    const isMultiLineToSingleLine = oldShape.kind === 'multiLine' && newShape.kind === 'singleLine';
    return {
        isWordToWordReplacement,
        isAdditive,
        isSubtractive,
        isSingleLineToSingleLine,
        isSingleLineToMultiLine,
        isMultiLineToSingleLine,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdEtpbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2VkaXRLaW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQVFBLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhNLFNBQVMsaUJBQWlCLENBQUMsSUFBWTtJQUN0QyxPQUFPLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFZO0lBQ3JDLE9BQU8sY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNsQyxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFZO0lBQ3JDLE9BQU8sSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDO0FBQ3RDLENBQUM7QUFxQkQsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFZO0lBQ3JDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDdkMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE9BQU87WUFDTixJQUFJLEVBQUUsV0FBVztZQUNqQixTQUFTLEVBQUUsS0FBSyxDQUFDLE1BQU07U0FDdkIsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztJQUN2QyxJQUFJLGNBQStDLENBQUM7SUFDcEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztRQUNsQixJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDN0IsY0FBYyxHQUFHLGFBQWEsQ0FBQztRQUNoQyxDQUFDO2FBQU0sSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25DLGNBQWMsR0FBRyxZQUFZLENBQUM7UUFDL0IsQ0FBQzthQUFNLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNuQyxjQUFjLEdBQUcsWUFBWSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRUQsOEJBQThCO0lBQzlCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEQsTUFBTSxvQkFBb0IsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLE1BQU0sdUJBQXVCLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQzNELENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQzFDLENBQUM7SUFFRix3QkFBd0I7SUFDeEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvRSxNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUV6QyxPQUFPO1FBQ04sSUFBSSxFQUFFLFlBQVk7UUFDbEIsaUJBQWlCLEVBQUUsWUFBWTtRQUMvQixtQkFBbUIsRUFBRSxjQUFjO1FBQ25DLE1BQU07UUFDTixlQUFlO1FBQ2Ysb0JBQW9CO1FBQ3BCLHVCQUF1QjtLQUN2QixDQUFDO0FBQ0gsQ0FBQztBQTJDRCxNQUFNLE9BQU8sd0JBQXdCO0lBQ3BDLFlBQXFCLEtBQXNDO1FBQXRDLFVBQUssR0FBTCxLQUFLLENBQWlDO0lBQUksQ0FBQztJQUNoRSxRQUFRO1FBQ1AsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVSxlQUFlLENBQUMsSUFBZ0IsRUFBRSxTQUFxQixFQUFFLGNBQXlCO0lBQ2pHLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDcEMsK0RBQStEO1FBQy9ELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxPQUFPLElBQUksd0JBQXdCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxSCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsSUFBWTtJQUMvQixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsV0FBOEIsRUFBRSxTQUFxQixFQUFFLGNBQXlCO0lBQzlHLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUM7SUFDOUMsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQztJQUNwQyxNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO0lBQzFDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7SUFDdEMsTUFBTSxhQUFhLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRTFDLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM3RixRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2QsS0FBSyxRQUFRO1lBQ1osT0FBTztnQkFDTixTQUFTLEVBQUUsUUFBUTtnQkFDbkIsVUFBVSxFQUFFLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxjQUFjLENBQUM7Z0JBQzNGLGtCQUFrQixFQUFFLGNBQWM7Z0JBQ2xDLGlCQUFpQixFQUFFLENBQUM7Z0JBQ3BCLGFBQWE7Z0JBQ2IsWUFBWSxFQUFFLENBQUM7YUFDZixDQUFDO1FBQ0gsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ2YsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNsRyxPQUFPO2dCQUNOLFNBQVMsRUFBRSxRQUFRO2dCQUNuQixVQUFVLEVBQUUsdUJBQXVCLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQztnQkFDN0Ysa0JBQWtCLEVBQUUsQ0FBQztnQkFDckIsaUJBQWlCLEVBQUUsYUFBYTtnQkFDaEMsYUFBYSxFQUFFLENBQUM7Z0JBQ2hCLFlBQVksRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDO2FBQ3JDLENBQUM7UUFDSCxDQUFDO1FBQ0QsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDOUYsT0FBTztnQkFDTixTQUFTLEVBQUUsU0FBUztnQkFDcEIsVUFBVSxFQUFFLHdCQUF3QixDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7Z0JBQ3RELGtCQUFrQixFQUFFLGNBQWM7Z0JBQ2xDLGlCQUFpQixFQUFFLGFBQWE7Z0JBQ2hDLGFBQWE7Z0JBQ2IsWUFBWSxFQUFFLFVBQVUsQ0FBQyxPQUFPLENBQUM7YUFDakMsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsTUFBYyxFQUFFLE9BQWUsRUFBRSxTQUFxQixFQUFFLGNBQXlCO0lBQ2pILE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVDLE1BQU0sY0FBYyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkQsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEUsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztJQUV0QywyQkFBMkI7SUFDM0IsSUFBSSxhQUFrQyxDQUFDO0lBQ3ZDLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0lBQ3BELE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDO0lBQ3pELE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0lBRXBELElBQUksV0FBVyxFQUFFLENBQUM7UUFDakIsYUFBYSxHQUFHLFdBQVcsQ0FBQztJQUM3QixDQUFDO1NBQU0sSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUMxQixhQUFhLEdBQUcsV0FBVyxDQUFDO0lBQzdCLENBQUM7U0FBTSxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGFBQWEsR0FBRyxhQUFhLENBQUM7SUFDL0IsQ0FBQztTQUFNLENBQUM7UUFDUCxhQUFhLEdBQUcsY0FBYyxDQUFDO0lBQ2hDLENBQUM7SUFFRCw0REFBNEQ7SUFDNUQsSUFBSSxnQkFBNEQsQ0FBQztJQUNqRSxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3BCLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQztRQUM3QyxNQUFNLFlBQVksR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBQzNDLE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUM7UUFFM0MsTUFBTSxRQUFRLEdBQUcsVUFBVSxLQUFLLFVBQVUsSUFBSSxZQUFZLEtBQUssWUFBWSxDQUFDO1FBQzVFLE1BQU0sc0JBQXNCLEdBQUcsVUFBVSxLQUFLLFVBQVUsSUFBSSxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ3hGLE1BQU0scUJBQXFCLEdBQUcsVUFBVSxLQUFLLFVBQVUsSUFBSSxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ3ZGLE1BQU0sVUFBVSxHQUFHLFVBQVUsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNqRixNQUFNLFVBQVUsR0FBRyxVQUFVLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFakYsZ0JBQWdCLEdBQUc7WUFDbEIsUUFBUTtZQUNSLHNCQUFzQjtZQUN0QixxQkFBcUI7WUFDckIsVUFBVTtZQUNWLFVBQVU7U0FDVixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU87UUFDTixTQUFTO1FBQ1QsYUFBYTtRQUNiLGdCQUFnQjtLQUNoQixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsV0FBbUIsRUFBRSxTQUFpQixFQUFFLFNBQXFCO0lBQzdGLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzNFLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRWhELE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDM0QsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUV2RCxvQ0FBb0M7SUFDcEMsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDckUsTUFBTSxhQUFhLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO0lBRTlELDBDQUEwQztJQUMxQyxNQUFNLHdCQUF3QixHQUM3QixhQUFhLENBQUMsVUFBVSxLQUFLLFdBQVcsQ0FBQyxVQUFVO1FBQ25ELGFBQWEsQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUMxQixXQUFXLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7SUFFekMsT0FBTztRQUNOLFNBQVM7UUFDVCxhQUFhO1FBQ2Isd0JBQXdCO0tBQ3hCLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxPQUFlLEVBQUUsT0FBZTtJQUNqRSxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMzQyxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUUzQyxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsSUFBSSxLQUFLLFlBQVksSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQ3BFLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEtBQUssWUFBWSxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDcEUsTUFBTSx1QkFBdUIsR0FBRyxTQUFTLElBQUksU0FBUyxDQUFDO0lBRXZELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztJQUNuRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7SUFFdEQsTUFBTSx3QkFBd0IsR0FBRyxRQUFRLENBQUMsSUFBSSxLQUFLLFlBQVksSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQztJQUNsRyxNQUFNLHVCQUF1QixHQUFHLFFBQVEsQ0FBQyxJQUFJLEtBQUssWUFBWSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDO0lBQ2hHLE1BQU0sdUJBQXVCLEdBQUcsUUFBUSxDQUFDLElBQUksS0FBSyxXQUFXLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7SUFFaEcsT0FBTztRQUNOLHVCQUF1QjtRQUN2QixVQUFVO1FBQ1YsYUFBYTtRQUNiLHdCQUF3QjtRQUN4Qix1QkFBdUI7UUFDdkIsdUJBQXVCO0tBQ3ZCLENBQUM7QUFDSCxDQUFDIn0=