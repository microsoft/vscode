/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var OutputMonitorState;
(function (OutputMonitorState) {
    OutputMonitorState["Initial"] = "Initial";
    OutputMonitorState["Idle"] = "Idle";
    OutputMonitorState["PollingForIdle"] = "PollingForIdle";
    OutputMonitorState["Prompting"] = "Prompting";
    OutputMonitorState["Timeout"] = "Timeout";
    OutputMonitorState["Active"] = "Active";
    OutputMonitorState["Cancelled"] = "Cancelled";
})(OutputMonitorState || (OutputMonitorState = {}));
export var PollingConsts;
(function (PollingConsts) {
    PollingConsts[PollingConsts["MinIdleEvents"] = 2] = "MinIdleEvents";
    PollingConsts[PollingConsts["MinPollingDuration"] = 500] = "MinPollingDuration";
    PollingConsts[PollingConsts["FirstPollingMaxDuration"] = 20000] = "FirstPollingMaxDuration";
    PollingConsts[PollingConsts["ExtendedPollingMaxDuration"] = 120000] = "ExtendedPollingMaxDuration";
    PollingConsts[PollingConsts["MaxPollingIntervalDuration"] = 10000] = "MaxPollingIntervalDuration";
    PollingConsts[PollingConsts["MaxRecursionCount"] = 5] = "MaxRecursionCount";
})(PollingConsts || (PollingConsts = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9tb25pdG9yaW5nL3R5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBK0JoRyxNQUFNLENBQU4sSUFBWSxrQkFRWDtBQVJELFdBQVksa0JBQWtCO0lBQzdCLHlDQUFtQixDQUFBO0lBQ25CLG1DQUFhLENBQUE7SUFDYix1REFBaUMsQ0FBQTtJQUNqQyw2Q0FBdUIsQ0FBQTtJQUN2Qix5Q0FBbUIsQ0FBQTtJQUNuQix1Q0FBaUIsQ0FBQTtJQUNqQiw2Q0FBdUIsQ0FBQTtBQUN4QixDQUFDLEVBUlcsa0JBQWtCLEtBQWxCLGtCQUFrQixRQVE3QjtBQUVELE1BQU0sQ0FBTixJQUFrQixhQU9qQjtBQVBELFdBQWtCLGFBQWE7SUFDOUIsbUVBQWlCLENBQUE7SUFDakIsK0VBQXdCLENBQUE7SUFDeEIsMkZBQStCLENBQUE7SUFDL0Isa0dBQW1DLENBQUE7SUFDbkMsaUdBQWtDLENBQUE7SUFDbEMsMkVBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQVBpQixhQUFhLEtBQWIsYUFBYSxRQU85QiJ9