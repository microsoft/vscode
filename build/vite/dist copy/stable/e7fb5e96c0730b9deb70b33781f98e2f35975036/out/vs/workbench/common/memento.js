/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isEmptyObject } from '../../base/common/types.js';
import { onUnexpectedError } from '../../base/common/errors.js';
export class Memento {
    static { this.applicationMementos = new Map(); }
    static { this.profileMementos = new Map(); }
    static { this.workspaceMementos = new Map(); }
    static { this.COMMON_PREFIX = 'memento/'; }
    constructor(id, storageService) {
        this.storageService = storageService;
        this.id = Memento.COMMON_PREFIX + id;
    }
    getMemento(scope, target) {
        switch (scope) {
            case 1 /* StorageScope.WORKSPACE */: {
                let workspaceMemento = Memento.workspaceMementos.get(this.id);
                if (!workspaceMemento) {
                    workspaceMemento = new ScopedMemento(this.id, scope, target, this.storageService);
                    Memento.workspaceMementos.set(this.id, workspaceMemento);
                }
                return workspaceMemento.getMemento();
            }
            case 0 /* StorageScope.PROFILE */: {
                let profileMemento = Memento.profileMementos.get(this.id);
                if (!profileMemento) {
                    profileMemento = new ScopedMemento(this.id, scope, target, this.storageService);
                    Memento.profileMementos.set(this.id, profileMemento);
                }
                return profileMemento.getMemento();
            }
            case -1 /* StorageScope.APPLICATION */: {
                let applicationMemento = Memento.applicationMementos.get(this.id);
                if (!applicationMemento) {
                    applicationMemento = new ScopedMemento(this.id, scope, target, this.storageService);
                    Memento.applicationMementos.set(this.id, applicationMemento);
                }
                return applicationMemento.getMemento();
            }
        }
    }
    onDidChangeValue(scope, disposables) {
        return this.storageService.onDidChangeValue(scope, this.id, disposables);
    }
    saveMemento() {
        Memento.workspaceMementos.get(this.id)?.save();
        Memento.profileMementos.get(this.id)?.save();
        Memento.applicationMementos.get(this.id)?.save();
    }
    reloadMemento(scope) {
        let memento;
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                memento = Memento.applicationMementos.get(this.id);
                break;
            case 0 /* StorageScope.PROFILE */:
                memento = Memento.profileMementos.get(this.id);
                break;
            case 1 /* StorageScope.WORKSPACE */:
                memento = Memento.workspaceMementos.get(this.id);
                break;
        }
        memento?.reload();
    }
    static clear(scope) {
        switch (scope) {
            case 1 /* StorageScope.WORKSPACE */:
                Memento.workspaceMementos.clear();
                break;
            case 0 /* StorageScope.PROFILE */:
                Memento.profileMementos.clear();
                break;
            case -1 /* StorageScope.APPLICATION */:
                Memento.applicationMementos.clear();
                break;
        }
    }
}
class ScopedMemento {
    constructor(id, scope, target, storageService) {
        this.id = id;
        this.scope = scope;
        this.target = target;
        this.storageService = storageService;
        this.mementoObj = this.doLoad();
    }
    doLoad() {
        try {
            return this.storageService.getObject(this.id, this.scope, {});
        }
        catch (error) {
            // Seeing reports from users unable to open editors
            // from memento parsing exceptions. Log the contents
            // to diagnose further
            // https://github.com/microsoft/vscode/issues/102251
            onUnexpectedError(`[memento]: failed to parse contents: ${error} (id: ${this.id}, scope: ${this.scope}, contents: ${this.storageService.get(this.id, this.scope)})`);
        }
        return {};
    }
    getMemento() {
        return this.mementoObj;
    }
    reload() {
        // Clear old
        for (const name of Object.getOwnPropertyNames(this.mementoObj)) {
            delete this.mementoObj[name];
        }
        // Assign new
        Object.assign(this.mementoObj, this.doLoad());
    }
    save() {
        if (!isEmptyObject(this.mementoObj)) {
            this.storageService.store(this.id, this.mementoObj, this.scope, this.target);
        }
        else {
            this.storageService.remove(this.id, this.scope);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVtZW50by5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vbWVtZW50by50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFJaEUsTUFBTSxPQUFPLE9BQU87YUFFSyx3QkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBa0MsQ0FBQzthQUNoRSxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO2FBQzVELHNCQUFpQixHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO2FBRTlELGtCQUFhLEdBQUcsVUFBVSxDQUFDO0lBSW5ELFlBQVksRUFBVSxFQUFVLGNBQStCO1FBQS9CLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUM5RCxJQUFJLENBQUMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFRCxVQUFVLENBQUMsS0FBbUIsRUFBRSxNQUFxQjtRQUNwRCxRQUFRLEtBQUssRUFBRSxDQUFDO1lBQ2YsbUNBQTJCLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixJQUFJLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM5RCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDdkIsZ0JBQWdCLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztvQkFDbEYsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFF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