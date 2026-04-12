/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var ValidationState;
(function (ValidationState) {
    ValidationState[ValidationState["OK"] = 0] = "OK";
    ValidationState[ValidationState["Info"] = 1] = "Info";
    ValidationState[ValidationState["Warning"] = 2] = "Warning";
    ValidationState[ValidationState["Error"] = 3] = "Error";
    ValidationState[ValidationState["Fatal"] = 4] = "Fatal";
})(ValidationState || (ValidationState = {}));
export class ValidationStatus {
    constructor() {
        this._state = 0 /* ValidationState.OK */;
    }
    get state() {
        return this._state;
    }
    set state(value) {
        if (value > this._state) {
            this._state = value;
        }
    }
    isOK() {
        return this._state === 0 /* ValidationState.OK */;
    }
    isFatal() {
        return this._state === 4 /* ValidationState.Fatal */;
    }
}
export class Parser {
    constructor(problemReporter) {
        this._problemReporter = problemReporter;
    }
    reset() {
        this._problemReporter.status.state = 0 /* ValidationState.OK */;
    }
    get problemReporter() {
        return this._problemReporter;
    }
    info(message) {
        this._problemReporter.info(message);
    }
    warn(message) {
        this._problemReporter.warn(message);
    }
    error(message) {
        this._problemReporter.error(message);
    }
    fatal(message) {
        this._problemReporter.fatal(message);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2Vycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3BhcnNlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFOLElBQWtCLGVBTWpCO0FBTkQsV0FBa0IsZUFBZTtJQUNoQyxpREFBTSxDQUFBO0lBQ04scURBQVEsQ0FBQTtJQUNSLDJEQUFXLENBQUE7SUFDWCx1REFBUyxDQUFBO0lBQ1QsdURBQVMsQ0FBQTtBQUNWLENBQUMsRUFOaUIsZUFBZSxLQUFmLGVBQWUsUUFNaEM7QUFFRCxNQUFNLE9BQU8sZ0JBQWdCO0lBRzVCO1FBQ0MsSUFBSSxDQUFDLE1BQU0sNkJBQXFCLENBQUM7SUFDbEMsQ0FBQztJQUVELElBQVcsS0FBSztRQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBVyxLQUFLLENBQUMsS0FBc0I7UUFDdEMsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLENBQUM7SUFDRixDQUFDO0lBRU0sSUFBSTtRQUNWLE9BQU8sSUFBSSxDQUFDLE1BQU0sK0JBQXVCLENBQUM7SUFDM0MsQ0FBQztJQUVNLE9BQU87UUFDYixPQUFPLElBQUksQ0FBQyxNQUFNLGtDQUEwQixDQUFDO0lBQzlDLENBQUM7Q0FDRDtBQVVELE1BQU0sT0FBZ0IsTUFBTTtJQUkzQixZQUFZLGVBQWlDO1FBQzVDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxlQUFlLENBQUM7SUFDekMsQ0FBQztJQUVNLEtBQUs7UUFDWCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEtBQUssNkJBQXFCLENBQUM7SUFDekQsQ0FBQztJQUVELElBQVcsZUFBZTtRQUN6QixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUM5QixDQUFDO0lBRU0sSUFBSSxDQUFDLE9BQWU7UUFDMUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU0sSUFBSSxDQUFDLE9BQWU7UUFDMUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU0sS0FBSyxDQUFDLE9BQWU7UUFDM0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRU0sS0FBSyxDQUFDLE9BQWU7UUFDM0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0QifQ==