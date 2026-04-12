/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IndentAction } from '../../../../common/languages/languageConfiguration.js';
export const javascriptOnEnterRules = [
    {
        // e.g. /** | */
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
    }, {
        // e.g. /** ...|
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: IndentAction.None, appendText: ' * ' }
    }, {
        // e.g.  * ...|
        beforeText: /^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
        previousLineText: /(?=^(\s*(\/\*\*|\*)).*)(?=(?!(\s*\*\/)))/,
        action: { indentAction: IndentAction.None, appendText: '* ' }
    }, {
        // e.g.  */|
        beforeText: /^(\t|[ ])*[ ]\*\/\s*$/,
        action: { indentAction: IndentAction.None, removeText: 1 }
    },
    {
        // e.g.  *-----*/|
        beforeText: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$/,
        action: { indentAction: IndentAction.None, removeText: 1 }
    },
    {
        beforeText: /^\s*(\bcase\s.+:|\bdefault:)$/,
        afterText: /^(?!\s*(\bcase\b|\bdefault\b))/,
        action: { indentAction: IndentAction.Indent }
    },
    {
        previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
        beforeText: /^\s+([^{i\s]|i(?!f\b))/,
        action: { indentAction: IndentAction.Outdent }
    },
    // Indent when pressing enter from inside ()
    {
        beforeText: /^.*\([^\)]*$/,
        afterText: /^\s*\).*$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
    },
    // Indent when pressing enter from inside {}
    {
        beforeText: /^.*\{[^\}]*$/,
        afterText: /^\s*\}.*$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
    },
    // Indent when pressing enter from inside []
    {
        beforeText: /^.*\[[^\]]*$/,
        afterText: /^\s*\].*$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
    },
];
export const phpOnEnterRules = [
    {
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
            indentAction: IndentAction.IndentOutdent,
            appendText: ' * ',
        }
    },
    {
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        action: {
            indentAction: IndentAction.None,
            appendText: ' * ',
        }
    },
    {
        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: {
            indentAction: IndentAction.None,
            appendText: '* ',
        }
    },
    {
        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
        action: {
            indentAction: IndentAction.None,
            removeText: 1,
        }
    },
    {
        beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
        action: {
            indentAction: IndentAction.None,
            removeText: 1,
        }
    },
    {
        beforeText: /^\s+([^{i\s]|i(?!f\b))/,
        previousLineText: /^\s*(((else ?)?if|for(each)?|while)\s*\(.*\)\s*|else\s*)$/,
        action: {
            indentAction: IndentAction.Outdent
        }
    },
];
export const cppOnEnterRules = [
    {
        previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
        beforeText: /^\s+([^{i\s]|i(?!f\b))/,
        action: {
            indentAction: IndentAction.Outdent
        }
    }
];
export const htmlOnEnterRules = [
    {
        beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
        afterText: /^<\/([_:\w][_:\w\-.\d]*)\s*>/i,
        action: {
            indentAction: IndentAction.IndentOutdent
        }
    },
    {
        beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
        action: {
            indentAction: IndentAction.Indent
        }
    }
];
export const vbOnEnterRules = [
    // Prevent indent after End statements and block terminators (but NOT ElseIf...Then or Else which should indent)
    {
        beforeText: /^\s*((End\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator))|Loop|Next|Wend|Until)\b.*$/i,
        action: {
            indentAction: IndentAction.None
        }
    }
];
/*
export enum IndentAction {
    None = 0,
    Indent = 1,
    IndentOutdent = 2,
    Outdent = 3
}
*/
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25FbnRlclJ1bGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL29uRW50ZXJSdWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFckYsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUc7SUFDckM7UUFDQyxnQkFBZ0I7UUFDaEIsVUFBVSxFQUFFLG9DQUFvQztRQUNoRCxTQUFTLEVBQUUsV0FBVztRQUN0QixNQUFNLEVBQUUsRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFO0tBQ3ZFLEVBQUU7UUFDRixnQkFBZ0I7UUFDaEIsVUFBVSxFQUFFLG9DQUFvQztRQUNoRCxNQUFNLEVBQUUsRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFO0tBQzlELEVBQUU7UUFDRixlQUFlO1FBQ2YsVUFBVSxFQUFFLHlDQUF5QztRQUNyRCxnQkFBZ0IsRUFBRSwwQ0FBMEM7UUFDNUQsTUFBTSxFQUFFLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRTtLQUM3RCxFQUFFO1FBQ0YsWUFBWTtRQUNaLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsTUFBTSxFQUFFLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRTtLQUMxRDtJQUNEO1FBQ0Msa0JBQWtCO1FBQ2xCLFVBQVUsRUFBRSw4QkFBOEI7UUFDMUMsTUFBTSxFQUFFLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRTtLQUMxRDtJ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