/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var Constants;
(function (Constants) {
    Constants[Constants["START_CH_CODE"] = 32] = "START_CH_CODE";
    Constants[Constants["END_CH_CODE"] = 126] = "END_CH_CODE";
    Constants[Constants["UNKNOWN_CODE"] = 65533] = "UNKNOWN_CODE";
    Constants[Constants["CHAR_COUNT"] = 96] = "CHAR_COUNT";
    Constants[Constants["SAMPLED_CHAR_HEIGHT"] = 16] = "SAMPLED_CHAR_HEIGHT";
    Constants[Constants["SAMPLED_CHAR_WIDTH"] = 10] = "SAMPLED_CHAR_WIDTH";
    Constants[Constants["BASE_CHAR_HEIGHT"] = 2] = "BASE_CHAR_HEIGHT";
    Constants[Constants["BASE_CHAR_WIDTH"] = 1] = "BASE_CHAR_WIDTH";
    Constants[Constants["RGBA_CHANNELS_CNT"] = 4] = "RGBA_CHANNELS_CNT";
    Constants[Constants["RGBA_SAMPLED_ROW_WIDTH"] = 3840] = "RGBA_SAMPLED_ROW_WIDTH";
})(Constants || (Constants = {}));
export const allCharCodes = (() => {
    const v = [];
    for (let i = 32 /* Constants.START_CH_CODE */; i <= 126 /* Constants.END_CH_CODE */; i++) {
        v.push(i);
    }
    v.push(65533 /* Constants.UNKNOWN_CODE */);
    return v;
})();
export const getCharIndex = (chCode, fontScale) => {
    chCode -= 32 /* Constants.START_CH_CODE */;
    if (chCode < 0 || chCode > 96 /* Constants.CHAR_COUNT */) {
        if (fontScale <= 2) {
            // for smaller scales, we can get away with using any ASCII character...
            return (chCode + 96 /* Constants.CHAR_COUNT */) % 96 /* Constants.CHAR_COUNT */;
        }
        return 96 /* Constants.CHAR_COUNT */ - 1; // unknown symbol
    }
    return chCode;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hcENoYXJTaGVldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9taW5pbWFwL21pbmltYXBDaGFyU2hlZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFOLElBQWtCLFNBY2pCO0FBZEQsV0FBa0IsU0FBUztJQUMxQiw0REFBa0IsQ0FBQTtJQUNsQix5REFBaUIsQ0FBQTtJQUNqQiw2REFBb0IsQ0FBQTtJQUNwQixzREFBNEMsQ0FBQTtJQUU1Qyx3RUFBd0IsQ0FBQTtJQUN4QixzRUFBdUIsQ0FBQTtJQUV2QixpRUFBb0IsQ0FBQTtJQUNwQiwrREFBbUIsQ0FBQTtJQUVuQixtRUFBcUIsQ0FBQTtJQUNyQixnRkFBNEUsQ0FBQTtBQUM3RSxDQUFDLEVBZGlCLFNBQVMsS0FBVCxTQUFTLFFBYzFCO0FBRUQsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUEwQixDQUFDLEdBQUcsRUFBRTtJQUN4RCxNQUFNLENBQUMsR0FBYSxFQUFFLENBQUM7SUFDdkIsS0FBSyxJQUFJLENBQUMsbUNBQTBCLEVBQUUsQ0FBQyxtQ0FBeUIsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3ZFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDWCxDQUFDO0lBRUQsQ0FBQyxDQUFDLElBQUksb0NBQXdCLENBQUM7SUFDL0IsT0FBTyxDQUFDLENBQUM7QUFDVixDQUFDLENBQUMsRUFBRSxDQUFDO0FBRUwsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBYyxFQUFFLFNBQWlCLEVBQUUsRUFBRTtJQUNqRSxNQUFNLG9DQUEyQixDQUFDO0lBQ2xDLElBQUksTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLGdDQUF1QixFQUFFLENBQUM7UUFDakQsSUFBSSxTQUFTLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDcEIsd0VBQXdFO1lBQ3hFLE9BQU8sQ0FBQyxNQUFNLGdDQUF1QixDQUFDLGdDQUF1QixDQUFDO1FBQy9ELENBQUM7UUFDRCxPQUFPLGdDQUF1QixDQUFDLENBQUMsQ0FBQyxpQkFBaUI7SUFDbkQsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyxDQUFDIn0=