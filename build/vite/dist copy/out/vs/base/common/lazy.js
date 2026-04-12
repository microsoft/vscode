/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var LazyValueState;
(function (LazyValueState) {
    LazyValueState[LazyValueState["Uninitialized"] = 0] = "Uninitialized";
    LazyValueState[LazyValueState["Running"] = 1] = "Running";
    LazyValueState[LazyValueState["Completed"] = 2] = "Completed";
})(LazyValueState || (LazyValueState = {}));
export class Lazy {
    constructor(executor) {
        this.executor = executor;
        this._state = LazyValueState.Uninitialized;
    }
    /**
     * True if the lazy value has been resolved.
     */
    get hasValue() { return this._state === LazyValueState.Completed; }
    /**
     * Get the wrapped value.
     *
     * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
     * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
     */
    get value() {
        if (this._state === LazyValueState.Uninitialized) {
            this._state = LazyValueState.Running;
            try {
                this._value = this.executor();
            }
            catch (err) {
                this._error = err;
            }
            finally {
                this._state = LazyValueState.Completed;
            }
        }
        else if (this._state === LazyValueState.Running) {
            throw new Error('Cannot read the value of a lazy that is being initialized');
        }
        if (this._error) {
            throw this._error;
        }
        return this._value;
    }
    /**
     * Get the wrapped value without forcing evaluation.
     */
    get rawValue() { return this._value; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF6eS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2xhenkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsSUFBSyxjQUlKO0FBSkQsV0FBSyxjQUFjO0lBQ2xCLHFFQUFhLENBQUE7SUFDYix5REFBTyxDQUFBO0lBQ1AsNkRBQVMsQ0FBQTtBQUNWLENBQUMsRUFKSSxjQUFjLEtBQWQsY0FBYyxRQUlsQjtBQUVELE1BQU0sT0FBTyxJQUFJO0lBTWhCLFlBQ2tCLFFBQWlCO1FBQWpCLGFBQVEsR0FBUixRQUFRLENBQVM7UUFMM0IsV0FBTSxHQUFHLGNBQWMsQ0FBQyxhQUFhLENBQUM7SUFNMUMsQ0FBQztJQUVMOztPQUVHO0lBQ0gsSUFBSSxRQUFRLEtBQWMsT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRTVFOzs7OztPQUtHO0lBQ0gsSUFBSSxLQUFLO1FBQ1IsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNsRCxJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUM7WUFDckMsSUFBSSxDQUFDO2dCQUNKLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQy9CLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO1lBQ25CLENBQUM7b0JBQVMsQ0FBQztnQkFDVixJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUM7WUFDeEMsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssY0FBYyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25ELE1BQU0sSUFBSSxLQUFLLENBQUMsMkRBQTJELENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ25CLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxNQUFPLENBQUM7SUFDckIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxRQUFRLEtBQW9CLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Q0FDckQifQ==