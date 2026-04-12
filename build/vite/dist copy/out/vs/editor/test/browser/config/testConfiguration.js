/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorConfiguration } from '../../../browser/config/editorConfiguration.js';
import { EditorFontLigatures, EditorFontVariations } from '../../../common/config/editorOptions.js';
import { FontInfo } from '../../../common/config/fontInfo.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
export class TestConfiguration extends EditorConfiguration {
    constructor(opts) {
        super(false, MenuId.EditorContext, opts, null, new TestAccessibilityService());
    }
    _readEnvConfiguration() {
        const envConfig = this.getRawOptions().envConfig;
        return {
            extraEditorClassName: envConfig?.extraEditorClassName ?? '',
            outerWidth: envConfig?.outerWidth ?? 100,
            outerHeight: envConfig?.outerHeight ?? 100,
            emptySelectionClipboard: envConfig?.emptySelectionClipboard ?? true,
            pixelRatio: envConfig?.pixelRatio ?? 1,
            accessibilitySupport: envConfig?.accessibilitySupport ?? 0 /* AccessibilitySupport.Unknown */,
            editContextSupported: true
        };
    }
    _readFontInfo(styling) {
        return new FontInfo({
            pixelRatio: 1,
            fontFamily: 'mockFont',
            fontWeight: 'normal',
            fontSize: 14,
            fontFeatureSettings: EditorFontLigatures.OFF,
            fontVariationSettings: EditorFontVariations.OFF,
            lineHeight: 19,
            letterSpacing: 1.5,
            isMonospace: true,
            typicalHalfwidthCharacterWidth: 10,
            typicalFullwidthCharacterWidth: 20,
            canUseHalfwidthRightwardsArrow: true,
            spaceWidth: 10,
            middotWidth: 10,
            wsmiddotWidth: 10,
            maxDigitWidth: 10,
        }, true);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL2NvbmZpZy90ZXN0Q29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQXFCLE1BQU0sZ0RBQWdELENBQUM7QUFDeEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEcsT0FBTyxFQUFnQixRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUc1RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFeEUsTUFBTSxPQUFPLGlCQUFrQixTQUFRLG1CQUFtQjtJQUV6RCxZQUFZLElBQTZDO1FBQ3hELEtBQUssQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFa0IscUJBQXFCO1FBQ3ZDLE1BQU0sU0FBUyxHQUFJLElBQUksQ0FBQyxhQUFhLEVBQW9DLENBQUMsU0FBUyxDQUFDO1FBQ3BGLE9BQU87WUFDTixvQkFBb0IsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLElBQUksRUFBRTtZQUMzRCxVQUFVLEVBQUUsU0FBUyxFQUFFLFVBQVUsSUFBSSxHQUFHO1lBQ3hDLFdBQVcsRUFBRSxTQUFTLEVBQUUsV0FBVyxJQUFJLEdBQUc7WUFDMUMsdUJBQXVCLEVBQUUsU0FBUyxFQUFFLHVCQUF1QixJQUFJLElBQUk7WUFDbkUsVUFBVSxFQUFFLFNBQVMsRUFBRSxVQUFVLElBQUksQ0FBQztZQUN0QyxvQkFBb0IsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLHdDQUFnQztZQUNyRixvQkFBb0IsRUFBRSxJQUFJO1NBQzFCLENBQUM7SUFDSCxDQUFDO0lBRWtCLGFBQWEsQ0FBQyxPQUFxQjtRQUNyRCxPQUFPLElBQUksUUFBUSxDQUFDO1lBQ25CLFVBQVUsRUFBRSxDQUFDO1lBQ2IsVUFBVSxFQUFFLFVBQVU7WUFDdEIsVUFBVSxFQUFFLFFBQVE7WUFDcEIsUUFBUSxFQUFFLEVBQUU7WUFDWixtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxHQUFHO1lBQzVDLHFCQUFxQixFQUFFLG9CQUFvQixDQUFDLEdBQUc7WUFDL0MsVUFBVSxFQUFFLEVBQUU7WUFDZCxhQUFhLEVBQUUsR0FBRztZQUNsQixXQUFXLEVBQUUsSUFBSTtZQUNqQiw4QkFBOEIsRUFBRSxFQUFFO1lBQ2xDLDhCQUE4QixFQUFFLEVBQUU7WUFDbEMsOEJBQThCLEVBQUUsSUFBSTtZQUNwQyxVQUFVLEVBQUUsRUFBRTtZQUNkLFdBQVcsRUFBRSxFQUFFO1lBQ2YsYUFBYSxFQUFFLEVBQUU7WUFDakIsYUFBYSxFQUFFLEVBQUU7U0FDakIsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNWLENBQUM7Q0FDRCJ9