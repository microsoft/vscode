/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var Constants;
(function (Constants) {
    /**
     * MAX SMI (SMall Integer) as defined in v8.
     * one bit is lost for boxing/unboxing flag.
     * one bit is lost for sign flag.
     * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
     */
    Constants[Constants["MAX_SAFE_SMALL_INTEGER"] = 1073741824] = "MAX_SAFE_SMALL_INTEGER";
    /**
     * MIN SMI (SMall Integer) as defined in v8.
     * one bit is lost for boxing/unboxing flag.
     * one bit is lost for sign flag.
     * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
     */
    Constants[Constants["MIN_SAFE_SMALL_INTEGER"] = -1073741824] = "MIN_SAFE_SMALL_INTEGER";
    /**
     * Max unsigned integer that fits on 8 bits.
     */
    Constants[Constants["MAX_UINT_8"] = 255] = "MAX_UINT_8";
    /**
     * Max unsigned integer that fits on 16 bits.
     */
    Constants[Constants["MAX_UINT_16"] = 65535] = "MAX_UINT_16";
    /**
     * Max unsigned integer that fits on 32 bits.
     */
    Constants[Constants["MAX_UINT_32"] = 4294967295] = "MAX_UINT_32";
    Constants[Constants["UNICODE_SUPPLEMENTARY_PLANE_BEGIN"] = 65536] = "UNICODE_SUPPLEMENTARY_PLANE_BEGIN";
})(Constants || (Constants = {}));
export function toUint8(v) {
    if (v < 0) {
        return 0;
    }
    if (v > 255 /* Constants.MAX_UINT_8 */) {
        return 255 /* Constants.MAX_UINT_8 */;
    }
    return v | 0;
}
export function toUint32(v) {
    if (v < 0) {
        return 0;
    }
    if (v > 4294967295 /* Constants.MAX_UINT_32 */) {
        return 4294967295 /* Constants.MAX_UINT_32 */;
    }
    return v | 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidWludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3VpbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFOLElBQWtCLFNBaUNqQjtBQWpDRCxXQUFrQixTQUFTO0lBQzFCOzs7OztPQUtHO0lBQ0gsc0ZBQWdDLENBQUE7SUFFaEM7Ozs7O09BS0c7SUFDSCx1RkFBbUMsQ0FBQTtJQUVuQzs7T0FFRztJQUNILHVEQUFnQixDQUFBO0lBRWhCOztPQUVHO0lBQ0gsMkRBQW1CLENBQUE7SUFFbkI7O09BRUc7SUFDSCxnRUFBd0IsQ0FBQTtJQUV4Qix1R0FBNEMsQ0FBQTtBQUM3QyxDQUFDLEVBakNpQixTQUFTLEtBQVQsU0FBUyxRQWlDMUI7QUFFRCxNQUFNLFVBQVUsT0FBTyxDQUFDLENBQVM7SUFDaEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFDRCxJQUFJLENBQUMsaUNBQXVCLEVBQUUsQ0FBQztRQUM5QixzQ0FBNEI7SUFDN0IsQ0FBQztJQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsUUFBUSxDQUFDLENBQVM7SUFDakMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFDRCxJQUFJLENBQUMseUNBQXdCLEVBQUUsQ0FBQztRQUMvQiw4Q0FBNkI7SUFDOUIsQ0FBQztJQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNkLENBQUMifQ==