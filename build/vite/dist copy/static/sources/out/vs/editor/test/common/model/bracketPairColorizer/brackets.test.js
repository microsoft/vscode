/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguageAgnosticBracketTokens } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/brackets.js';
import { SmallImmutableSet, DenseKeyProvider } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet.js';
import { TestLanguageConfigurationService } from '../../modes/testLanguageConfigurationService.js';
suite('Bracket Pair Colorizer - Brackets', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Basic', () => {
        const languageId = 'testMode1';
        const denseKeyProvider = new DenseKeyProvider();
        const getImmutableSet = (elements) => {
            let newSet = SmallImmutableSet.getEmpty();
            elements.forEach(x => newSet = newSet.add(`${languageId}:::${x}`, denseKeyProvider));
            return newSet;
        };
        const getKey = (value) => {
            return denseKeyProvider.getKey(`${languageId}:::${value}`);
        };
        const disposableStore = new DisposableStore();
        const languageConfigService = disposableStore.add(new TestLanguageConfigurationService());
        disposableStore.add(languageConfigService.register(languageId, {
            brackets: [
                ['{', '}'], ['[', ']'], ['(', ')'],
                ['begin', 'end'], ['case', 'endcase'], ['casez', 'endcase'], // Verilog
                ['\\left(', '\\right)'], ['\\left(', '\\right.'], ['\\left.', '\\right)'], // LaTeX Parentheses
                ['\\left[', '\\right]'], ['\\left[', '\\right.'], ['\\left.', '\\right]'] // LaTeX Brackets
            ]
        }));
        const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, l => languageConfigService.getLanguageConfiguration(l));
        const bracketsExpected = [
            { text: '{', length: 1, kind: 'OpeningBracket', bracketId: getKey('{'), bracketIds: getImmutableSet(['{']) },
            { text: '[', length: 1, kind: 'OpeningBracket', bracketId: getKey('['), bracketIds: getImmutableSet(['[']) },
            { text: '(', length: 1, kind: 'OpeningBracket', bracketId: getKey('('), bracketIds: getImmutableSet(['(']) },
            { text: 'begin', length: 5, kind: 'OpeningBracket', bracketId: getKey('begin'), bracketIds: getImmutableSet(['begin']) },
            { text: 'case', length: 4, kind: 'OpeningBracket', bracketId: getKey('case'), bracketIds: getImmutableSet(['case']) },
            { text: 'casez', length: 5, kind: 'OpeningBracket', bracketId: getKey('casez'), bracketIds: getImmutableSet(['casez']) },
            { text: '\\left(', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(']) },
            { text: '\\left.', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left.'), bracketIds: getImmutableSet(['\\left.']) },
            { text: '\\left[', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left['), bracketIds: getImmutableSet(['\\left[']) },
            { text: '}', length: 1, kind: 'ClosingBracket', bracketId: getKey('{'), bracketIds: getImmutableSet(['{']) },
            { text: ']', length: 1, kind: 'ClosingBracket', bracketId: getKey('['), bracketIds: getImmutableSet(['[']) },
            { text: ')', length: 1, kind: 'ClosingBracket', bracketId: getKey('('), bracketIds: getImmutableSet(['(']) },
            { text: 'end', length: 3, kind: 'ClosingBracket', bracketId: getKey('begin'), bracketIds: getImmutableSet(['begin']) },
            { text: 'endcase', length: 7, kind: 'ClosingBracket', bracketId: getKey('case'), bracketIds: getImmutableSet(['case', 'casez']) },
            { text: '\\right)', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(', '\\left.']) },
            { text: '\\right.', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(', '\\left[']) },
            { text: '\\right]', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left['), bracketIds: getImmutableSet(['\\left[', '\\left.']) }
        ];
        const bracketsActual = bracketsExpected.map(x => tokenToObject(brackets.getToken(x.text, languageId), x.text));
        assert.deepStrictEqual(bracketsActual, bracketsExpected);
        disposableStore.dispose();
    });
});
function tokenToObject(token, text) {
    if (token === undefined) {
        return undefined;
    }
    return {
        text: text,
        length: token.length,
        bracketId: token.bracketId,
        bracketIds: token.bracketIds,
        kind: {
            [2 /* TokenKind.ClosingBracket */]: 'ClosingBracket',
            [1 /* TokenKind.OpeningBracket */]: 'OpeningBracket',
            [0 /* TokenKind.Text */]: 'Text',
        }[token.kind],
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhY2tldHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9icmFja2V0UGFpckNvbG9yaXplci9icmFja2V0cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0saUZBQWlGLENBQUM7QUFDaEksT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEZBQTBGLENBQUM7QUFFL0ksT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFbkcsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtJQUMvQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1FBQ2xCLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQztRQUMvQixNQUFNLGdCQUFnQixHQUFHLElBQUksZ0JBQWdCLEVBQVUsQ0FBQztRQUN4RCxNQUFNLGVBQWUsR0FBRyxDQUFDLFFBQWtCLEVBQUUsRUFBRTtZQUM5QyxJQUFJLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMxQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxVQUFVLE1BQU0sQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQ3JGLE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUNoQyxPQUFPLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsTUFBTSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzVELENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDOUMsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLGVBQWUsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRTtZQUM5RCxRQUFRLEVBQUU7Z0JBQ1QsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO2dCQUNsQyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsRUFBTSxVQUFVO2dCQUMzRSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsRUFBRyxvQkFBb0I7Z0JBQ2hHLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFFLGlCQUFpQjthQUM1RjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxRQUFRLEdBQUcsSUFBSSw2QkFBNkIsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0gsTUFBTSxnQkFBZ0IsR0FBRztZQUN4QixFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRTtZQUN4SCxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRTtZQUNySCxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRTtZQUN4SCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRTtZQUM5SCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRTtZQUM5SCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRTtZQUU5SCxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1RyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRTtZQUN0SCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUU7WUFDakksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsVUFBVSxFQUFFLGVBQWUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxFQUFFO1lBQzFJLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxlQUFlLENBQUMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsRUFBRTtZQUMxSSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUU7U0FDMUksQ0FBQztRQUNGLE1BQU0sY0FBYyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFL0csTUFBTSxDQUFDLGVBQWUsQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUV6RCxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDM0IsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILFNBQVMsYUFBYSxDQUFDLEtBQXdCLEVBQUUsSUFBWTtJQUM1RCxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUN6QixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsT0FBTztRQUNOLElBQUksRUFBRSxJQUFJO1FBQ1YsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1FBQ3BCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztRQUMxQixVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVU7UUFDNUIsSUFBSSxFQUFFO1lBQ0wsa0NBQTBCLEVBQUUsZ0JBQWdCO1lBQzVDLGtDQUEwQixFQUFFLGdCQUFnQjtZQUM1Qyx3QkFBZ0IsRUFBRSxNQUFNO1NBQ3hCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztLQUNiLENBQUM7QUFDSCxDQUFDIn0=