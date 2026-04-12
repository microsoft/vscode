/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from './strings.js';
var Severity;
(function (Severity) {
    Severity[Severity["Ignore"] = 0] = "Ignore";
    Severity[Severity["Info"] = 1] = "Info";
    Severity[Severity["Warning"] = 2] = "Warning";
    Severity[Severity["Error"] = 3] = "Error";
})(Severity || (Severity = {}));
(function (Severity) {
    const _error = 'error';
    const _warning = 'warning';
    const _warn = 'warn';
    const _info = 'info';
    const _ignore = 'ignore';
    /**
     * Parses 'error', 'warning', 'warn', 'info' in call casings
     * and falls back to ignore.
     */
    function fromValue(value) {
        if (!value) {
            return Severity.Ignore;
        }
        if (strings.equalsIgnoreCase(_error, value)) {
            return Severity.Error;
        }
        if (strings.equalsIgnoreCase(_warning, value) || strings.equalsIgnoreCase(_warn, value)) {
            return Severity.Warning;
        }
        if (strings.equalsIgnoreCase(_info, value)) {
            return Severity.Info;
        }
        return Severity.Ignore;
    }
    Severity.fromValue = fromValue;
    function toString(severity) {
        switch (severity) {
            case Severity.Error: return _error;
            case Severity.Warning: return _warning;
            case Severity.Info: return _info;
            default: return _ignore;
        }
    }
    Severity.toString = toString;
})(Severity || (Severity = {}));
export default Severity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V2ZXJpdHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9zZXZlcml0eS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssT0FBTyxNQUFNLGNBQWMsQ0FBQztBQUV4QyxJQUFLLFFBS0o7QUFMRCxXQUFLLFFBQVE7SUFDWiwyQ0FBVSxDQUFBO0lBQ1YsdUNBQVEsQ0FBQTtJQUNSLDZDQUFXLENBQUE7SUFDWCx5Q0FBUyxDQUFBO0FBQ1YsQ0FBQyxFQUxJLFFBQVEsS0FBUixRQUFRLFFBS1o7QUFFRCxXQUFVLFFBQVE7SUFFakIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDO0lBQ3ZCLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQztJQUMzQixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUM7SUFDckIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDO0lBQ3JCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQztJQUV6Qjs7O09BR0c7SUFDSCxTQUFnQixTQUFTLENBQUMsS0FBYTtRQUN0QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDeEIsQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdDLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQztRQUN2QixDQUFDO1FBRUQsSUFBSSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6RixPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVDLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQztRQUN0QixDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQ3hCLENBQUM7SUFqQmUsa0JBQVMsWUFpQnhCLENBQUE7SUFFRCxTQUFnQixRQUFRLENBQUMsUUFBa0I7UUFDMUMsUUFBUSxRQUFRLEVBQUUsQ0FBQztZQUNsQixLQUFLLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztZQUNuQyxLQUFLLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQztZQUN2QyxLQUFLLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQztZQUNqQyxPQUFPLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQztJQVBlLGlCQUFRLFdBT3ZCLENBQUE7QUFDRixDQUFDLEVBdkNTLFFBQVEsS0FBUixRQUFRLFFBdUNqQjtBQUVELGVBQWUsUUFBUSxDQUFDIn0=