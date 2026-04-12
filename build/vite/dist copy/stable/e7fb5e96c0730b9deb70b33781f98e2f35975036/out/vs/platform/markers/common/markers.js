/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Severity from '../../../base/common/severity.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var MarkerTag;
(function (MarkerTag) {
    MarkerTag[MarkerTag["Unnecessary"] = 1] = "Unnecessary";
    MarkerTag[MarkerTag["Deprecated"] = 2] = "Deprecated";
})(MarkerTag || (MarkerTag = {}));
export var MarkerSeverity;
(function (MarkerSeverity) {
    MarkerSeverity[MarkerSeverity["Hint"] = 1] = "Hint";
    MarkerSeverity[MarkerSeverity["Info"] = 2] = "Info";
    MarkerSeverity[MarkerSeverity["Warning"] = 4] = "Warning";
    MarkerSeverity[MarkerSeverity["Error"] = 8] = "Error";
})(MarkerSeverity || (MarkerSeverity = {}));
(function (MarkerSeverity) {
    function compare(a, b) {
        return b - a;
    }
    MarkerSeverity.compare = compare;
    const _displayStrings = Object.create(null);
    _displayStrings[MarkerSeverity.Error] = localize('sev.error', "Error");
    _displayStrings[MarkerSeverity.Warning] = localize('sev.warning', "Warning");
    _displayStrings[MarkerSeverity.Info] = localize('sev.info', "Info");
    function toString(a) {
        return _displayStrings[a] || '';
    }
    MarkerSeverity.toString = toString;
    const _displayStringsPlural = Object.create(null);
    _displayStringsPlural[MarkerSeverity.Error] = localize('sev.errors', "Errors");
    _displayStringsPlural[MarkerSeverity.Warning] = localize('sev.warnings', "Warnings");
    _displayStringsPlural[MarkerSeverity.Info] = localize('sev.infos', "Infos");
    function toStringPlural(a) {
        return _displayStringsPlural[a] || '';
    }
    MarkerSeverity.toStringPlural = toStringPlural;
    function fromSeverity(severity) {
        switch (severity) {
            case Severity.Error: return MarkerSeverity.Error;
            case Severity.Warning: return MarkerSeverity.Warning;
            case Severity.Info: return MarkerSeverity.Info;
            case Severity.Ignore: return MarkerSeverity.Hint;
        }
    }
    MarkerSeverity.fromSeverity = fromSeverity;
    function toSeverity(severity) {
        switch (severity) {
            case MarkerSeverity.Error: return Severity.Error;
            case MarkerSeverity.Warning: return Severity.Warning;
            case MarkerSeverity.Info: return Severity.Info;
            case MarkerSeverity.Hint: return Severity.Ignore;
        }
    }
    MarkerSeverity.toSeverity = toSeverity;
})(MarkerSeverity || (MarkerSeverity = {}));
export var IMarkerData;
(function (IMarkerData) {
    const emptyString = '';
    function makeKey(markerData) {
        return makeKeyOptionalMessage(markerData, true);
    }
    IMarkerData.makeKey = makeKey;
    function makeKeyOptionalMessage(markerData, useMessage) {
        const result = [emptyString];
        if (markerData.source) {
            result.push(markerData.source.replace('¦', '\\¦'));
        }
        else {
            result.push(emptyString);
        }
        if (markerData.code) {
            if (typeof markerData.code === 'string') {
                result.push(markerData.code.replace('¦', '\\¦'));
            }
            else {
                result.push(markerData.code.value.replace('¦', '\\¦'));
            }
        }
        else {
            result.push(emptyString);
        }
        if (markerData.severity !== undefined && markerData.severity !== null) {
            result.push(MarkerSeverity.toString(markerData.severity));
        }
        else {
            result.push(emptyString);
        }
        // Modifed to not include the message as part of the marker key to work around
        // https://github.com/microsoft/vscode/issues/77475
        if (markerData.message && useMessage) {
            result.push(markerData.message.replace('¦', '\\¦'));
        }
        else {
            result.push(emptyString);
        }
        if (markerData.startLineNumber !== undefined && markerData.startLineNumber !== null) {
            result.push(markerData.startLineNumber.toString());
        }
        else {
            result.push(emptyString);
        }
        if (markerData.startColumn !== undefined && markerData.startColumn !== null) {
            result.push(markerData.startColumn.toString());
        }
        else {
            result.push(emptyString);
        }
        if (markerData.endLineNumber !== undefined && markerData.endLineNumber !== null) {
            result.push(markerData.endLineNumber.toString());
        }
        else {
            result.push(emptyString);
        }
        if (markerData.endColumn !== undefined && markerData.endColumn !== null) {
            result.push(markerData.endColumn.toString());
        }
        else {
            result.push(emptyString);
        }
        result.push(emptyString);
        return result.join('¦');
    }
    IMarkerData.makeKeyOptionalMessage = makeKeyOptionalMessage;
})(IMarkerData || (IMarkerData = {}));
export const IMarkerService = createDecorator('markerService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFFeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQXdDOUUsTUFBTSxDQUFOLElBQWtCLFNBR2pCO0FBSEQsV0FBa0IsU0FBUztJQUMxQix1REFBZSxDQUFBO0lBQ2YscURBQWMsQ0FBQTtBQUNmLENBQUMsRUFIaUIsU0FBUyxLQUFULFNBQVMsUUFHMUI7QUFFRCxNQUFNLENBQU4sSUFBWSxjQUtYO0FBTEQsV0FBWSxjQUFjO0lBQ3pCLG1EQUFRLENBQUE7SUFDUixtREFBUSxDQUFBO0lBQ1IseURBQVcsQ0FBQTtJQUNYLHFEQUFTLENBQUE7QUFDVixDQUFDLEVBTFcsY0FBYyxLQUFkLGNBQWMsUUFLekI7QUFFRCxXQUFpQixjQUFjO0lBRTlCLFNBQWdCLE9BQU8sQ0FBQyxDQUFpQixFQUFFLENBQWlCO1FBQzNELE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNkLENBQUM7SUFGZSxzQkFBTyxVQUV0QixDQUFBO0lBRUQsTUFBTSxlQUFlLEdBQWdDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekUsZUFBZSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZFLGVBQWUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM3RSxlQUFlLENBQUMsY0FBYyxD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