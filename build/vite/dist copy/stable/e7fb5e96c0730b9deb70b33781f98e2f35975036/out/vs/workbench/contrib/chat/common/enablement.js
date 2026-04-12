/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export var ContributionEnablementState;
(function (ContributionEnablementState) {
    ContributionEnablementState[ContributionEnablementState["DisabledProfile"] = 0] = "DisabledProfile";
    ContributionEnablementState[ContributionEnablementState["DisabledWorkspace"] = 1] = "DisabledWorkspace";
    ContributionEnablementState[ContributionEnablementState["EnabledProfile"] = 2] = "EnabledProfile";
    ContributionEnablementState[ContributionEnablementState["EnabledWorkspace"] = 3] = "EnabledWorkspace";
})(ContributionEnablementState || (ContributionEnablementState = {}));
export function isContributionEnabled(state) {
    return state === 2 /* ContributionEnablementState.EnabledProfile */ || state === 3 /* ContributionEnablementState.EnabledWorkspace */;
}
export function isContributionDisabled(state) {
    return !isContributionEnabled(state);
}
function mapToStorage(value) {
    return JSON.stringify([...value]);
}
function mapFromStorage(value) {
    const parsed = JSON.parse(value);
    return new Map(Array.isArray(parsed) ? parsed : []);
}
/**
 * A reusable enablement model for string-keyed contributions. Uses
 * `observableMemento` to persist enable/disable state in both profile-scoped
 * and workspace-scoped storage.
 *
 * Resolution order: if a workspace-scoped entry exists for a key, it wins.
 * Otherwise, the profile-scoped entry is used. The default (absence of any
 * entry) is {@link ContributionEnablementState.EnabledProfile}.
 */
let EnablementModel = class EnablementModel extends Disposable {
    constructor(storageKey, storageService) {
        super();
        const mapMemento = observableMemento({
            key: storageKey,
            defaultValue: new Map(),
            toStorage: mapToStorage,
            fromStorage: mapFromStorage,
        });
        this._profileState = this._register(mapMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, storageService));
        this._workspaceState = this._register(mapMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, storageService));
    }
    readEnabled(key, reader) {
        const wsMap = this._workspaceState.read(reader);
        if (wsMap.has(key)) {
            return wsMap.get(key)
                ? 3 /* ContributionEnablementState.EnabledWorkspace */
                : 1 /* ContributionEnablementState.DisabledWorkspace */;
        }
        const profileMap = this._profileState.read(reader);
        if (profileMap.has(key)) {
            return profileMap.get(key)
                ? 2 /* ContributionEnablementState.EnabledProfile */
                : 0 /* ContributionEnablementState.DisabledProfile */;
        }
        return 2 /* ContributionEnablementState.EnabledProfile */;
    }
    setEnabled(key, state) {
        switch (state) {
            case 2 /* ContributionEnablementState.EnabledProfile */: {
                // Enabled-profile is the default: remove key from profile state,
                // and also remove any workspace override.
                this._deleteFromMap(this._profileState, key);
                this._deleteFromMap(this._workspaceState, key);
                break;
            }
            case 0 /* ContributionEnablementState.DisabledProfile */: {
                // Store disabled in profile, remove workspace override.
                this._setInMap(this._profileState, key, false);
                this._deleteFromMap(this._workspaceState, key);
                break;
            }
            case 3 /* ContributionEnablementState.EnabledWorkspace */: {
                // Workspace override: always store explicitly.
                this._setInMap(this._workspaceState, key, true);
                break;
            }
            case 1 /* ContributionEnablementState.DisabledWorkspace */: {
                // Workspace override: always store explicitly.
                this._setInMap(this._workspaceState, key, false);
                break;
            }
        }
    }
    remove(key) {
        this._deleteFromMap(this._profileState, key);
        this._deleteFromMap(this._workspaceState, key);
    }
    _setInMap(memento, key, value) {
        const current = memento.get();
        if (current.get(key) === value) {
            return;
        }
        const next = new Map(current);
        next.set(key, value);
        memento.set(next, undefined);
    }
    _deleteFromMap(memento, key) {
        const current = memento.get();
        if (!current.has(key)) {
            return;
        }
        const next = new Map(current);
        next.delete(key);
        memento.set(next, undefined);
    }
};
EnablementModel = __decorate([
    __param(1, IStorageService)
], EnablementModel);
export { EnablementModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5hYmxlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBRTlHLE1BQU0sQ0FBTixJQUFrQiwyQkFLakI7QUFMRCxXQUFrQiwyQkFBMkI7SUFDNUMsbUdBQWUsQ0FBQTtJQUNmLHVHQUFpQixDQUFBO0lBQ2pCLGlHQUFjLENBQUE7SUFDZCxxR0FBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBTGlCLDJCQUEyQixLQUEzQiwyQkFBMkIsUUFLNUM7QUFFRCxNQUFNLFVBQVUscUJBQXFCLENBQUMsS0FBa0M7SUFDdkUsT0FBTyxLQUFLLHVEQUErQyxJQUFJLEtBQUsseURBQWlELENBQUM7QUFDdkgsQ0FBQztBQUVELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxLQUFrQztJQUN4RSxPQUFPLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQVVELFNBQVMsWUFBWSxDQUFDLEtBQW9CO0lBQ3pDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBYTtJQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMs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