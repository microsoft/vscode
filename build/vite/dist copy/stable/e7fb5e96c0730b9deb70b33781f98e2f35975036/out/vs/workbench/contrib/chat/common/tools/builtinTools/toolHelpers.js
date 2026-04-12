/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Creates a tool result with a single text content part.
 */
export function createToolSimpleTextResult(value) {
    return {
        content: [{
                kind: 'text',
                value
            }]
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbEhlbHBlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvdG9vbEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEc7O0dBRUc7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsS0FBYTtJQUN2RCxPQUFPO1FBQ04sT0FBTyxFQUFFLENBQUM7Z0JBQ1QsSUFBSSxFQUFFLE1BQU07Z0JBQ1osS0FBSzthQUNMLENBQUM7S0FDRixDQUFDO0FBQ0gsQ0FBQyJ9