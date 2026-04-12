/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
export function registerTerminalContribution(id, ctor, canRunInDetachedTerminals = false) {
    // eslint-disable-next-line local/code-no-dangerous-type-assertions
    TerminalContributionRegistry.INSTANCE.registerTerminalContribution({ id, ctor, canRunInDetachedTerminals });
}
/**
 * The registry of terminal contributions.
 *
 * **WARNING**: This is internal and should only be used by core terminal code that activates the
 * contributions.
 */
export var TerminalExtensionsRegistry;
(function (TerminalExtensionsRegistry) {
    function getTerminalContributions() {
        return TerminalContributionRegistry.INSTANCE.getTerminalContributions();
    }
    TerminalExtensionsRegistry.getTerminalContributions = getTerminalContributions;
})(TerminalExtensionsRegistry || (TerminalExtensionsRegistry = {}));
class TerminalContributionRegistry {
    static { this.INSTANCE = new TerminalContributionRegistry(); }
    constructor() {
        this._terminalContributions = [];
    }
    registerTerminalContribution(description) {
        this._terminalContributions.push(description);
    }
    getTerminalContributions() {
        return this._terminalContributions.slice(0);
    }
}
var Extensions;
(function (Extensions) {
    Extensions["TerminalContributions"] = "terminal.contributions";
})(Extensions || (Extensions = {}));
Registry.add("terminal.contributions" /* Extensions.TerminalContributions */, TerminalContributionRegistry.INSTANCE);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFeHRlbnNpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBcUM1RSxNQUFNLFVBQVUsNEJBQTRCLENBQUMsRUFBVSxFQUFFLElBQTJFLEVBQUUsNEJBQXFDLEtBQUs7SUFDL0ssbUVBQW1FO0lBQ25FLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUseUJBQXlCLEVBQXNDLENBQUMsQ0FBQztBQUNqSixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLEtBQVcsMEJBQTBCLENBSTFDO0FBSkQsV0FBaUIsMEJBQTBCO0lBQzFDLFNBQWdCLHdCQUF3QjtRQUN2QyxPQUFPLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO0lBQ3pFLENBQUM7SUFGZSxtREFBd0IsMkJBRXZDLENBQUE7QUFDRixDQUFDLEVBSmdCLDBCQUEwQixLQUExQiwwQkFBMEIsUUFJMUM7QUFFRCxNQUFNLDRCQUE0QjthQUVWLGFBQVEsR0FBRyxJQUFJLDRCQUE0QixFQUFFLEFBQXJDLENBQXNDO0lBSXJFO1FBRmlCLDJCQUFzQixHQUF1QyxFQUFFLENBQUM7SUFHakYsQ0FBQztJQUVNLDRCQUE0QixDQUFDLFdBQTZDO1FBQ2hGLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVNLHdCQUF3QjtRQUM5QixPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0MsQ0FBQzs7QUFHRixJQUFXLFVBRVY7QUFGRCxXQUFXLFVBQVU7SUFDcEIsOERBQWdELENBQUE7QUFDakQsQ0FBQyxFQUZVLFVBQVUsS0FBVixVQUFVLFFBRXBCO0FBRUQsUUFBUSxDQUFDLEdBQUcsa0VBQW1DLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyxDQUFDIn0=