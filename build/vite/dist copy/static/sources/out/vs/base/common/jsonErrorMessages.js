/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Extracted from json.ts to keep json nls free.
 */
import { localize } from '../../nls.js';
export function getParseErrorMessage(errorCode) {
    switch (errorCode) {
        case 1 /* ParseErrorCode.InvalidSymbol */: return localize('error.invalidSymbol', 'Invalid symbol');
        case 2 /* ParseErrorCode.InvalidNumberFormat */: return localize('error.invalidNumberFormat', 'Invalid number format');
        case 3 /* ParseErrorCode.PropertyNameExpected */: return localize('error.propertyNameExpected', 'Property name expected');
        case 4 /* ParseErrorCode.ValueExpected */: return localize('error.valueExpected', 'Value expected');
        case 5 /* ParseErrorCode.ColonExpected */: return localize('error.colonExpected', 'Colon expected');
        case 6 /* ParseErrorCode.CommaExpected */: return localize('error.commaExpected', 'Comma expected');
        case 7 /* ParseErrorCode.CloseBraceExpected */: return localize('error.closeBraceExpected', 'Closing brace expected');
        case 8 /* ParseErrorCode.CloseBracketExpected */: return localize('error.closeBracketExpected', 'Closing bracket expected');
        case 9 /* ParseErrorCode.EndOfFileExpected */: return localize('error.endOfFileExpected', 'End of file expected');
        default:
            return '';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbkVycm9yTWVzc2FnZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7R0FFRztBQUNILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFHeEMsTUFBTSxVQUFVLG9CQUFvQixDQUFDLFNBQXlCO0lBQzdELFFBQVEsU0FBUyxFQUFFLENBQUM7UUFDbkIseUNBQWlDLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzVGLCtDQUF1QyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztRQUMvRyxnREFBd0MsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLDRCQUE0QixFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDbEgseUNBQWlDLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzVGLHlDQUFpQyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMscUJBQXFCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUM1Rix5Q0FBaUMsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLHFCQUFxQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDNUYsOENBQXNDLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQzlHLGdEQUF3QyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUNwSCw2Q0FBcUMsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDMUc7WUFDQyxPQUFPLEVBQUUsQ0FBQztJQUNaLENBQUM7QUFDRixDQUFDIn0=