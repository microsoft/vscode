/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * A logger for xterm.js that suppresses noisy warnings during tests.
 */
export const TestXtermLogger = {
    trace: () => { },
    debug: () => { },
    info: () => { },
    warn: (message) => {
        if (message.includes('task queue')) {
            return;
        }
        console.warn(message);
    },
    error: (message) => {
        console.error(message);
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUZXN0SGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEc7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQVk7SUFDdkMsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDaEIsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDaEIsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDZixJQUFJLEVBQUUsQ0FBQyxPQUFlLEVBQUUsRUFBRTtRQUN6QixJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUNwQyxPQUFPO1FBQ1IsQ0FBQztRQUNELE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUNELEtBQUssRUFBRSxDQUFDLE9BQXVCLEVBQUUsRUFBRTtRQUNsQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7Q0FDRCxDQUFDIn0=