/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Toggle } from '../toggle/toggle.js';
import { Codicon } from '../../../common/codicons.js';
import * as nls from '../../../../nls.js';
const NLS_CASE_SENSITIVE_TOGGLE_LABEL = nls.localize('caseDescription', "Match Case");
const NLS_WHOLE_WORD_TOGGLE_LABEL = nls.localize('wordsDescription', "Match Whole Word");
const NLS_REGEX_TOGGLE_LABEL = nls.localize('regexDescription', "Use Regular Expression");
export class CaseSensitiveToggle extends Toggle {
    constructor(opts) {
        super({
            icon: Codicon.caseSensitive,
            title: NLS_CASE_SENSITIVE_TOGGLE_LABEL + opts.appendTitle,
            isChecked: opts.isChecked,
            hoverLifecycleOptions: opts.hoverLifecycleOptions,
            inputActiveOptionBorder: opts.inputActiveOptionBorder,
            inputActiveOptionForeground: opts.inputActiveOptionForeground,
            inputActiveOptionBackground: opts.inputActiveOptionBackground
        });
    }
}
export class WholeWordsToggle extends Toggle {
    constructor(opts) {
        super({
            icon: Codicon.wholeWord,
            title: NLS_WHOLE_WORD_TOGGLE_LABEL + opts.appendTitle,
            isChecked: opts.isChecked,
            hoverLifecycleOptions: opts.hoverLifecycleOptions,
            inputActiveOptionBorder: opts.inputActiveOptionBorder,
            inputActiveOptionForeground: opts.inputActiveOptionForeground,
            inputActiveOptionBackground: opts.inputActiveOptionBackground
        });
    }
}
export class RegexToggle extends Toggle {
    constructor(opts) {
        super({
            icon: Codicon.regex,
            title: NLS_REGEX_TOGGLE_LABEL + opts.appendTitle,
            isChecked: opts.isChecked,
            hoverLifecycleOptions: opts.hoverLifecycleOptions,
            inputActiveOptionBorder: opts.inputActiveOptionBorder,
            inputActiveOptionForeground: opts.inputActiveOptionForeground,
            inputActiveOptionBackground: opts.inputActiveOptionBackground
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZElucHV0VG9nZ2xlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9maW5kaW5wdXQvZmluZElucHV0VG9nZ2xlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDN0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFZMUMsTUFBTSwrQkFBK0IsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ3RGLE1BQU0sMkJBQTJCLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3pGLE1BQU0sc0JBQXNCLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0FBRTFGLE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxNQUFNO0lBQzlDLFlBQVksSUFBMEI7UUFDckMsS0FBSyxDQUFDO1lBQ0wsSUFBSSxFQUFFLE9BQU8sQ0FBQyxhQUFhO1lBQzNCLEtBQUssRUFBRSwrQkFBK0IsR0FBRyxJQUFJLENBQUMsV0FBVztZQUN6RCxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDekIscUJBQXFCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQjtZQUNqRCx1QkFBdUIsRUFBRSxJQUFJLENBQUMsdUJBQXVCO1lBQ3JELDJCQUEyQixFQUFFLElBQUksQ0FBQywyQkFBMkI7WUFDN0QsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLDJCQUEyQjtTQUM3RCxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsTUFBTTtJQUMzQyxZQUFZLElBQTBCO1FBQ3JDLEtBQUssQ0FBQztZQUNMLElBQUksRUFBRSxPQUFPLENBQUMsU0FBUztZQUN2QixLQUFLLEVBQUUsMkJBQTJCLEdBQUcsSUFBSSxDQUFDLFdBQVc7WUFDckQsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLHFCQUFxQixFQUFFLElBQUksQ0FBQyxxQkFBcUI7WUFDakQsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLHVCQUF1QjtZQUNyRCwyQkFBMkIsRUFBRSxJQUFJLENBQUMsMkJBQTJCO1lBQzdELDJCQUEyQixFQUFFLElBQUksQ0FBQywyQkFBMkI7U0FDN0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFdBQVksU0FBUSxNQUFNO0lBQ3RDLFlBQVksSUFBMEI7UUFDckMsS0FBSyxDQUFDO1lBQ0wsSUFBSSxFQUFFLE9BQU8sQ0FBQyxLQUFLO1lBQ25CLEtBQUssRUFBRSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsV0FBVztZQUNoRCxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDekIscUJBQXFCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQjtZQUNqRCx1QkFBdUIsRUFBRSxJQUFJLENBQUMsdUJBQXVCO1lBQ3JELDJCQUEyQixFQUFFLElBQUksQ0FBQywyQkFBMkI7WUFDN0QsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLDJCQUEyQjtTQUM3RCxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QifQ==