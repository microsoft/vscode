/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IJSONEditingService = createDecorator('jsonEditingService');
export var JSONEditingErrorCode;
(function (JSONEditingErrorCode) {
    /**
     * Error when trying to write to a file that contains JSON errors.
     */
    JSONEditingErrorCode[JSONEditingErrorCode["ERROR_INVALID_FILE"] = 0] = "ERROR_INVALID_FILE";
})(JSONEditingErrorCode || (JSONEditingErrorCode = {}));
export class JSONEditingError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbkVkaXRpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRzdGLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLGVBQWUsQ0FBc0Isb0JBQW9CLENBQUMsQ0FBQztBQUU5RixNQUFNLENBQU4sSUFBa0Isb0JBTWpCO0FBTkQsV0FBa0Isb0JBQW9CO0lBRXJDOztPQUVHO0lBQ0gsMkZBQWtCLENBQUE7QUFDbkIsQ0FBQyxFQU5pQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBTXJDO0FBRUQsTUFBTSxPQUFPLGdCQUFpQixTQUFRLEtBQUs7SUFDMUMsWUFBWSxPQUFlLEVBQVMsSUFBMEI7UUFDN0QsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRG9CLFNBQUksR0FBSixJQUFJLENBQXNCO0lBRTlELENBQUM7Q0FDRCJ9