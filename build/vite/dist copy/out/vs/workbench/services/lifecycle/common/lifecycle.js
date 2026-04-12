/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const ILifecycleService = createDecorator('lifecycleService');
export var WillShutdownJoinerOrder;
(function (WillShutdownJoinerOrder) {
    /**
     * Joiners to run before the `Last` joiners. This is the default order and best for
     * most cases. You can be sure that services are still functional at this point.
     */
    WillShutdownJoinerOrder[WillShutdownJoinerOrder["Default"] = 1] = "Default";
    /**
     * The joiners to run last. This should ONLY be used in rare cases when you have no
     * dependencies to workbench services or state. The workbench may be in a state where
     * resources can no longer be accessed or changed.
     */
    WillShutdownJoinerOrder[WillShutdownJoinerOrder["Last"] = 2] = "Last";
})(WillShutdownJoinerOrder || (WillShutdownJoinerOrder = {}));
export var ShutdownReason;
(function (ShutdownReason) {
    /**
     * The window is closed.
     */
    ShutdownReason[ShutdownReason["CLOSE"] = 1] = "CLOSE";
    /**
     * The window closes because the application quits.
     */
    ShutdownReason[ShutdownReason["QUIT"] = 2] = "QUIT";
    /**
     * The window is reloaded.
     */
    ShutdownReason[ShutdownReason["RELOAD"] = 3] = "RELOAD";
    /**
     * The window is loaded into a different workspace context.
     */
    ShutdownReason[ShutdownReason["LOAD"] = 4] = "LOAD";
})(ShutdownReason || (ShutdownReason = {}));
export var StartupKind;
(function (StartupKind) {
    StartupKind[StartupKind["NewWindow"] = 1] = "NewWindow";
    StartupKind[StartupKind["ReloadedWindow"] = 3] = "ReloadedWindow";
    StartupKind[StartupKind["ReopenedWindow"] = 4] = "ReopenedWindow";
})(StartupKind || (StartupKind = {}));
export function StartupKindToString(startupKind) {
    switch (startupKind) {
        case 1 /* StartupKind.NewWindow */: return 'NewWindow';
        case 3 /* StartupKind.ReloadedWindow */: return 'ReloadedWindow';
        case 4 /* StartupKind.ReopenedWindow */: return 'ReopenedWindow';
    }
}
export var LifecyclePhase;
(function (LifecyclePhase) {
    /**
     * The first phase signals that we are about to startup getting ready.
     *
     * Note: doing work in this phase blocks an editor from showing to
     * the user, so please rather consider to use `Restored` phase.
     */
    LifecyclePhase[LifecyclePhase["Starting"] = 1] = "Starting";
    /**
     * Services are ready and the window is about to restore its UI state.
     *
     * Note: doing work in this phase blocks an editor from showing to
     * the user, so please rather consider to use `Restored` phase.
     */
    LifecyclePhase[LifecyclePhase["Ready"] = 2] = "Ready";
    /**
     * Views, panels and editors have restored. Editors are given a bit of
     * time to restore their contents.
     */
    LifecyclePhase[LifecyclePhase["Restored"] = 3] = "Restored";
    /**
     * The last phase after views, panels and editors have restored and
     * some time has passed (2-5 seconds).
     */
    LifecyclePhase[LifecyclePhase["Eventually"] = 4] = "Eventually";
})(LifecyclePhase || (LifecyclePhase = {}));
export function LifecyclePhaseToString(phase) {
    switch (phase) {
        case 1 /* LifecyclePhase.Starting */: return 'Starting';
        case 2 /* LifecyclePhase.Ready */: return 'Ready';
        case 3 /* LifecyclePhase.Restored */: return 'Restored';
        case 4 /* LifecyclePhase.Eventually */: return 'Eventually';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQW9CLGtCQUFrQixDQUFDLENBQUM7QUEwRHhGLE1BQU0sQ0FBTixJQUFZLHVCQWNYO0FBZEQsV0FBWSx1QkFBdUI7SUFFbEM7OztPQUdHO0lBQ0gsMkVBQVcsQ0FBQTtJQUVYOzs7O09BSUc7SUFDSCxxRUFBSSxDQUFBO0FBQ0wsQ0FBQyxFQWRXLHVCQUF1QixLQUF2Qix1QkFBdUIsUUFjbEM7QUFxRUQsTUFBTSxDQUFOLElBQWtCLGNBcUJqQjtBQXJCRCxXQUFrQixjQUFjO0lBRS9COztPQUVHO0lBQ0gscURBQVMsQ0FBQTtJQUVUOztPQUVHO0lBQ0gsbURBQUksQ0FBQTtJQUVKOztPQUVHO0lBQ0gsdURBQU0sQ0FBQTtJQUVOOztPQUVHO0lBQ0gsbURBQUksQ0FBQTtBQUNMLENBQUMsRUFyQmlCLGNBQWMsS0FBZCxjQUFjLFFBcUIvQjtBQUVELE1BQU0sQ0FBTixJQUFrQixXQUlqQjtBQUpELFdBQWtCLFdBQVc7SUFDNUIsdURBQWEsQ0FBQTtJQUNiLGlFQUFrQixDQUFBO0lBQ2xCLGlFQUFrQixDQUFBO0FBQ25CLENBQUMsRUFKaUIsV0FBVyxLQUFYLFdBQVcsUUFJNUI7QUFFRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsV0FBd0I7SUFDM0QsUUFBUSxXQUFXLEVBQUUsQ0FBQztRQUNyQixrQ0FBMEIsQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDO1FBQy9DLHVDQUErQixDQUFDLENBQUMsT0FBTyxnQkFBZ0IsQ0FBQztRQUN6RCx1Q0FBK0IsQ0FBQyxDQUFDLE9BQU8sZ0JBQWdCLENBQUM7SUFDMUQsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLENBQU4sSUFBa0IsY0E2QmpCO0FBN0JELFdBQWtCLGNBQWM7SUFFL0I7Ozs7O09BS0c7SUFDSCwyREFBWSxDQUFBO0lBRVo7Ozs7O09BS0c7SUFDSCxxREFBUyxDQUFBO0lBRVQ7OztPQUdHO0lBQ0gsMkRBQVksQ0FBQTtJQUVaOzs7T0FHRztJQUNILCtEQUFjLENBQUE7QUFDZixDQUFDLEVBN0JpQixjQUFjLEtBQWQsY0FBYyxRQTZCL0I7QUFFRCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsS0FBcUI7SUFDM0QsUUFBUSxLQUFLLEVBQUUsQ0FBQztRQUNmLG9DQUE0QixDQUFDLENBQUMsT0FBTyxVQUFVLENBQUM7UUFDaEQsaUNBQXlCLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUMxQyxvQ0FBNEIsQ0FBQyxDQUFDLE9BQU8sVUFBVSxDQUFDO1FBQ2hELHNDQUE4QixDQUFDLENBQUMsT0FBTyxZQUFZLENBQUM7SUFDckQsQ0FBQztBQUNGLENBQUMifQ==