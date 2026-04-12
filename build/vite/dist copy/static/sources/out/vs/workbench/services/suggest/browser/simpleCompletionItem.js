/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FuzzyScore } from '../../../../base/common/filters.js';
export class SimpleCompletionItem {
    constructor(completion) {
        this.completion = completion;
        // sorting, filtering
        this.score = FuzzyScore.Default;
        // validation
        this.isInvalid = false;
        // ensure lower-variants (perf)
        this.textLabel = typeof completion.label === 'string'
            ? completion.label
            : completion.label?.label;
        this.labelLow = this.textLabel.toLowerCase();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlQ29tcGxldGlvbkl0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc3VnZ2VzdC9icm93c2VyL3NpbXBsZUNvbXBsZXRpb25JdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQWdEaEUsTUFBTSxPQUFPLG9CQUFvQjtJQWVoQyxZQUNVLFVBQTZCO1FBQTdCLGVBQVUsR0FBVixVQUFVLENBQW1CO1FBVHZDLHFCQUFxQjtRQUNyQixVQUFLLEdBQWUsVUFBVSxDQUFDLE9BQU8sQ0FBQztRQUl2QyxhQUFhO1FBQ2IsY0FBUyxHQUFZLEtBQUssQ0FBQztRQUsxQiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLFVBQVUsQ0FBQyxLQUFLLEtBQUssUUFBUTtZQUNwRCxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUs7WUFDbEIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM5QyxDQUFDO0NBQ0QifQ==