/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IndentAction } from './languageConfiguration.js';
import { getIndentationAtPosition } from './languageConfigurationRegistry.js';
import { IndentationContextProcessor } from './supports/indentationLineProcessor.js';
export function getEnterAction(autoIndent, model, range, languageConfigurationService) {
    model.tokenization.forceTokenization(range.startLineNumber);
    const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
    const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
    if (!richEditSupport) {
        return null;
    }
    const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
    const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
    const previousLineText = processedContextTokens.previousLineProcessedTokens.getLineContent();
    const beforeEnterText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
    const afterEnterText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
    const enterResult = richEditSupport.onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText);
    if (!enterResult) {
        return null;
    }
    const indentAction = enterResult.indentAction;
    let appendText = enterResult.appendText;
    const removeText = enterResult.removeText || 0;
    // Here we add `\t` to appendText first because enterAction is leveraging appendText and removeText to change indentation.
    if (!appendText) {
        if ((indentAction === IndentAction.Indent) ||
            (indentAction === IndentAction.IndentOutdent)) {
            appendText = '\t';
        }
        else {
            appendText = '';
        }
    }
    else if (indentAction === IndentAction.Indent) {
        appendText = '\t' + appendText;
    }
    let indentation = getIndentationAtPosition(model, range.startLineNumber, range.startColumn);
    if (removeText) {
        indentation = indentation.substring(0, indentation.length - removeText);
    }
    return {
        indentAction: indentAction,
        appendText: appendText,
        removeText: removeText,
        indentation: indentation
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50ZXJBY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9lbnRlckFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsWUFBWSxFQUF1QixNQUFNLDRCQUE0QixDQUFDO0FBRS9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBaUMsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRixNQUFNLFVBQVUsY0FBYyxDQUM3QixVQUFvQyxFQUNwQyxLQUFpQixFQUNqQixLQUFZLEVBQ1osNEJBQTJEO0lBRTNELEtBQUssQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzVELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMzRixNQUFNLGVBQWUsR0FBRyw0QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMxRixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLDJCQUEyQixDQUFDLEtBQUssRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0lBQ3pHLE1BQU0sc0JBQXNCLEdBQUcsMkJBQTJCLENBQUMsbUNBQW1DLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEcsTUFBTSxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUM3RixNQUFNLGVBQWUsR0FBRyxzQkFBc0IsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUMzRixNQUFNLGNBQWMsR0FBRyxzQkFBc0IsQ0FBQyx5QkFBeUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUV6RixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDM0csSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2xCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUM7SUFDOUMsSUFBSSxVQUFVLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQztJQUN4QyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQztJQUUvQywwSEFBMEg7SUFDMUgsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pCLElBQ0MsQ0FBQyxZQUFZLEtBQUssWUFBWSxDQUFDLE1BQU0sQ0FBQztZQUN0QyxDQUFDLFlBQVksS0FBSyxZQUFZLENBQUMsYUFBYSxDQUFDLEVBQzVDLENBQUM7WUFDRixVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ25CLENBQUM7YUFBTSxDQUFDO1lBQ1AsVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQztTQUFNLElBQUksWUFBWSxLQUFLLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNqRCxVQUFVLEdBQUcsSUFBSSxHQUFHLFVBQVUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsSUFBSSxXQUFXLEdBQUcsd0JBQXdCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzVGLElBQUksVUFBVSxFQUFFLENBQUM7UUFDaEIsV0FBVyxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELE9BQU87UUFDTixZQUFZLEVBQUUsWUFBWTtRQUMxQixVQUFVLEVBQUUsVUFBVTtRQUN0QixVQUFVLEVBQUUsVUFBVTtRQUN0QixXQUFXLEVBQUUsV0FBVztLQUN4QixDQUFDO0FBQ0gsQ0FBQyJ9