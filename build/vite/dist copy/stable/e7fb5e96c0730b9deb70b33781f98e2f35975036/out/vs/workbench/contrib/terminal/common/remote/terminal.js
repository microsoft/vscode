/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const REMOTE_TERMINAL_CHANNEL_NAME = 'remoteterminal';
export var RemoteTerminalChannelEvent;
(function (RemoteTerminalChannelEvent) {
    RemoteTerminalChannelEvent["OnPtyHostExitEvent"] = "$onPtyHostExitEvent";
    RemoteTerminalChannelEvent["OnPtyHostStartEvent"] = "$onPtyHostStartEvent";
    RemoteTerminalChannelEvent["OnPtyHostUnresponsiveEvent"] = "$onPtyHostUnresponsiveEvent";
    RemoteTerminalChannelEvent["OnPtyHostResponsiveEvent"] = "$onPtyHostResponsiveEvent";
    RemoteTerminalChannelEvent["OnPtyHostRequestResolveVariablesEvent"] = "$onPtyHostRequestResolveVariablesEvent";
    RemoteTerminalChannelEvent["OnProcessDataEvent"] = "$onProcessDataEvent";
    RemoteTerminalChannelEvent["OnProcessReadyEvent"] = "$onProcessReadyEvent";
    RemoteTerminalChannelEvent["OnProcessExitEvent"] = "$onProcessExitEvent";
    RemoteTerminalChannelEvent["OnProcessReplayEvent"] = "$onProcessReplayEvent";
    RemoteTerminalChannelEvent["OnProcessOrphanQuestion"] = "$onProcessOrphanQuestion";
    RemoteTerminalChannelEvent["OnExecuteCommand"] = "$onExecuteCommand";
    RemoteTerminalChannelEvent["OnDidRequestDetach"] = "$onDidRequestDetach";
    RemoteTerminalChannelEvent["OnDidChangeProperty"] = "$onDidChangeProperty";
})(RemoteTerminalChannelEvent || (RemoteTerminalChannelEvent = {}));
export var RemoteTerminalChannelRequest;
(function (RemoteTerminalChannelRequest) {
    RemoteTerminalChannelRequest["RestartPtyHost"] = "$restartPtyHost";
    RemoteTerminalChannelRequest["CreateProcess"] = "$createProcess";
    RemoteTerminalChannelRequest["AttachToProcess"] = "$attachToProcess";
    RemoteTerminalChannelRequest["DetachFromProcess"] = "$detachFromProcess";
    RemoteTerminalChannelRequest["ListProcesses"] = "$listProcesses";
    RemoteTerminalChannelRequest["GetLatency"] = "$getLatency";
    RemoteTerminalChannelRequest["GetPerformanceMarks"] = "$getPerformanceMarks";
    RemoteTerminalChannelRequest["OrphanQuestionReply"] = "$orphanQuestionReply";
    RemoteTerminalChannelRequest["AcceptPtyHostResolvedVariables"] = "$acceptPtyHostResolvedVariables";
    RemoteTerminalChannelRequest["Start"] = "$start";
    RemoteTerminalChannelRequest["Input"] = "$input";
    RemoteTerminalChannelRequest["SendSignal"] = "$sendSignal";
    RemoteTerminalChannelRequest["AcknowledgeDataEvent"] = "$acknowledgeDataEvent";
    RemoteTerminalChannelRequest["Shutdown"] = "$shutdown";
    RemoteTerminalChannelRequest["Resize"] = "$resize";
    RemoteTerminalChannelRequest["ClearBuffer"] = "$clearBuffer";
    RemoteTerminalChannelRequest["GetInitialCwd"] = "$getInitialCwd";
    RemoteTerminalChannelRequest["GetCwd"] = "$getCwd";
    RemoteTerminalChannelRequest["ProcessBinary"] = "$processBinary";
    RemoteTerminalChannelRequest["SendCommandResult"] = "$sendCommandResult";
    RemoteTerminalChannelRequest["InstallAutoReply"] = "$installAutoReply";
    RemoteTerminalChannelRequest["UninstallAllAutoReplies"] = "$uninstallAllAutoReplies";
    RemoteTerminalChannelRequest["GetDefaultSystemShell"] = "$getDefaultSystemShell";
    RemoteTerminalChannelRequest["GetProfiles"] = "$getProfiles";
    RemoteTerminalChannelRequest["GetEnvironment"] = "$getEnvironment";
    RemoteTerminalChannelRequest["GetWslPath"] = "$getWslPath";
    RemoteTerminalChannelRequest["GetTerminalLayoutInfo"] = "$getTerminalLayoutInfo";
    RemoteTerminalChannelRequest["SetTerminalLayoutInfo"] = "$setTerminalLayoutInfo";
    RemoteTerminalChannelRequest["SerializeTerminalState"] = "$serializeTerminalState";
    RemoteTerminalChannelRequest["ReviveTerminalProcesses"] = "$reviveTerminalProcesses";
    RemoteTerminalChannelRequest["GetRevivedPtyNewId"] = "$getRevivedPtyNewId";
    RemoteTerminalChannelRequest["SetUnicodeVersion"] = "$setUnicodeVersion";
    RemoteTerminalChannelRequest["SetNextCommandId"] = "$setNextCommandId";
    RemoteTerminalChannelRequest["ReduceConnectionGraceTime"] = "$reduceConnectionGraceTime";
    RemoteTerminalChannelRequest["UpdateIcon"] = "$updateIcon";
    RemoteTerminalChannelRequest["UpdateTitle"] = "$updateTitle";
    RemoteTerminalChannelRequest["UpdateProperty"] = "$updateProperty";
    RemoteTerminalChannelRequest["RefreshProperty"] = "$refreshProperty";
    RemoteTerminalChannelRequest["RequestDetachInstance"] = "$requestDetachInstance";
    RemoteTerminalChannelRequest["AcceptDetachInstanceReply"] = "$acceptDetachInstanceReply";
    RemoteTerminalChannelRequest["AcceptDetachedInstance"] = "$acceptDetachedInstance";
    RemoteTerminalChannelRequest["FreePortKillProcess"] = "$freePortKillProcess";
})(RemoteTerminalChannelRequest || (RemoteTerminalChannelRequest = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vcmVtb3RlL3Rlcm1pbmFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBT2hHLE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLGdCQUFnQixDQUFDO0FBaUM3RCxNQUFNLENBQU4sSUFBa0IsMEJBY2pCO0FBZEQsV0FBa0IsMEJBQTBCO0lBQzNDLHdFQUEwQyxDQUFBO0lBQzFDLDBFQUE0QyxDQUFBO0lBQzVDLHdGQUEwRCxDQUFBO0lBQzFELG9GQUFzRCxDQUFBO0lBQ3RELDhHQUFnRixDQUFBO0lBQ2hGLHdFQUEwQyxDQUFBO0lBQzFDLDBFQUE0QyxDQUFBO0lBQzVDLHdFQUEwQyxDQUFBO0lBQzFDLDRFQUE4QyxDQUFBO0lBQzlDLGtGQUFvRCxDQUFBO0lBQ3BELG9FQUFzQyxDQUFBO0lBQ3RDLHdFQUEwQyxDQUFBO0lBQzFDLDBFQUE0QyxDQUFBO0FBQzdDLENBQUMsRUFkaUIsMEJBQTBCLEtBQTFCLDBCQUEwQixRQWMzQztBQUVELE1BQU0sQ0FBTixJQUFrQiw0QkEyQ2pCO0FBM0NELFdBQWtCLDRCQUE0QjtJQUM3QyxrRUFBa0MsQ0FBQTtJQUNsQyxnRUFBZ0MsQ0FBQTtJQUNoQyxvRUFBb0MsQ0FBQTtJQUNwQyx3RUFBd0MsQ0FBQTtJQUN4QyxnRUFBZ0MsQ0FBQTtJQUNoQywwREFBMEIsQ0FBQTtJQUMxQiw0RUFBNEMsQ0FBQTtJQUM1Qyw0RUFBNEMsQ0FBQTtJQUM1QyxrR0FBa0UsQ0FBQTtJQUNsRSxnREFBZ0IsQ0FBQTtJQUNoQixnREFBZ0IsQ0FBQTtJQUNoQiwwREFBMEIsQ0FBQTtJQUMxQiw4RUFBOEMsQ0FBQTtJQUM5QyxzREFBc0IsQ0FBQTtJQUN0QixrREFBa0IsQ0FBQTtJQUNsQiw0REFBNEIsQ0FBQTtJQUM1QixnRUFBZ0MsQ0FBQTtJQUNoQyxrREFBa0IsQ0FBQTtJQUNsQixnRUFBZ0MsQ0FBQTtJQUNoQyx3RUFBd0MsQ0FBQTtJQUN4QyxzRUFBc0MsQ0FBQTtJQUN0QyxvRkFBb0QsQ0FBQTtJQUNwRCxnRkFBZ0QsQ0FBQTtJQUNoRCw0REFBNEIsQ0FBQTtJQUM1QixrRUFBa0MsQ0FBQTtJQUNsQywwREFBMEIsQ0FBQTtJQUMxQixnRkFBZ0QsQ0FBQTtJQUNoRCxnRkFBZ0QsQ0FBQTtJQUNoRCxrRkFBa0QsQ0FBQTtJQUNsRCxvRkFBb0QsQ0FBQTtJQUNwRCwwRUFBMEMsQ0FBQTtJQUMxQyx3RUFBd0MsQ0FBQTtJQUN4QyxzRUFBc0MsQ0FBQTtJQUN0Qyx3RkFBd0QsQ0FBQTtJQUN4RCwwREFBMEIsQ0FBQTtJQUMxQiw0REFBNEIsQ0FBQTtJQUM1QixrRUFBa0MsQ0FBQTtJQUNsQyxvRUFBb0MsQ0FBQTtJQUNwQyxnRkFBZ0QsQ0FBQTtJQUNoRCx3RkFBd0QsQ0FBQTtJQUN4RCxrRkFBa0QsQ0FBQTtJQUNsRCw0RUFBNEMsQ0FBQTtBQUM3QyxDQUFDLEVBM0NpQiw0QkFBNEIsS0FBNUIsNEJBQTRCLFFBMkM3QyJ9