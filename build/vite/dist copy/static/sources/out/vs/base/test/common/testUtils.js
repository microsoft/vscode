/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function flakySuite(title, fn) {
    return suite(title, function () {
        // Flaky suites need retries and timeout to complete
        // e.g. because they access browser features which can
        // be unreliable depending on the environment.
        this.retries(3);
        this.timeout(1000 * 20);
        // Invoke suite ensuring that `this` is
        // properly wired in.
        fn.call(this);
    });
}
/**
 * (pseudo)Random boolean generator.
 *
 * ## Examples
 *
 * ```typescript
 * randomBoolean(); // generates either `true` or `false`
 * ```
 *
 */
export const randomBoolean = () => {
    return Math.random() > 0.5;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi90ZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsTUFBTSxVQUFVLFVBQVUsQ0FBQyxLQUFhLEVBQUUsRUFBYztJQUN2RCxPQUFPLEtBQUssQ0FBQyxLQUFLLEVBQUU7UUFFbkIsb0RBQW9EO1FBQ3BELHNEQUFzRDtRQUN0RCw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQztRQUV4Qix1Q0FBdUM7UUFDdkMscUJBQXFCO1FBQ3JCLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsR0FBWSxFQUFFO0lBQzFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQztBQUM1QixDQUFDLENBQUMifQ==