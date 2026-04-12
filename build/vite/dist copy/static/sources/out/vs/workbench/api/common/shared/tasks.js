/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TaskEventKind;
(function (TaskEventKind) {
    /** Indicates that a task's properties or configuration have changed */
    TaskEventKind["Changed"] = "changed";
    /** Indicates that a task has begun executing */
    TaskEventKind["ProcessStarted"] = "processStarted";
    /** Indicates that a task process has completed */
    TaskEventKind["ProcessEnded"] = "processEnded";
    /** Indicates that a task was terminated, either by user action or by the system */
    TaskEventKind["Terminated"] = "terminated";
    /** Indicates that a task has started running */
    TaskEventKind["Start"] = "start";
    /** Indicates that a task has acquired all needed input/variables to execute */
    TaskEventKind["AcquiredInput"] = "acquiredInput";
    /** Indicates that a dependent task has started */
    TaskEventKind["DependsOnStarted"] = "dependsOnStarted";
    /** Indicates that a task is actively running/processing */
    TaskEventKind["Active"] = "active";
    /** Indicates that a task is paused/waiting but not complete */
    TaskEventKind["Inactive"] = "inactive";
    /** Indicates that a task has completed fully */
    TaskEventKind["End"] = "end";
    /** Indicates that a task's problem matcher has started */
    TaskEventKind["ProblemMatcherStarted"] = "problemMatcherStarted";
    /** Indicates that a task's problem matcher has ended */
    TaskEventKind["ProblemMatcherEnded"] = "problemMatcherEnded";
    /** Indicates that a task's problem matcher has found errors */
    TaskEventKind["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
})(TaskEventKind || (TaskEventKind = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9zaGFyZWQvdGFza3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFtRGhHLE1BQU0sQ0FBTixJQUFZLGFBdUNYO0FBdkNELFdBQVksYUFBYTtJQUN4Qix1RUFBdUU7SUFDdkUsb0NBQW1CLENBQUE7SUFFbkIsZ0RBQWdEO0lBQ2hELGtEQUFpQyxDQUFBO0lBRWpDLGtEQUFrRDtJQUNsRCw4Q0FBNkIsQ0FBQTtJQUU3QixtRkFBbUY7SUFDbkYsMENBQXlCLENBQUE7SUFFekIsZ0RBQWdEO0lBQ2hELGdDQUFlLENBQUE7SUFFZiwrRUFBK0U7SUFDL0UsZ0RBQStCLENBQUE7SUFFL0Isa0RBQWtEO0lBQ2xELHNEQUFxQyxDQUFBO0lBRXJDLDJEQUEyRDtJQUMzRCxrQ0FBaUIsQ0FBQTtJQUVqQiwrREFBK0Q7SUFDL0Qsc0NBQXFCLENBQUE7SUFFckIsZ0RBQWdEO0lBQ2hELDRCQUFXLENBQUE7SUFFWCwwREFBMEQ7SUFDMUQsZ0VBQStDLENBQUE7SUFFL0Msd0RBQXdEO0lBQ3hELDREQUEyQyxDQUFBO0lBRTNDLCtEQUErRDtJQUMvRCx3RUFBdUQsQ0FBQTtBQUN4RCxDQUFDLEVBdkNXLGFBQWEsS0FBYixhQUFhLFFBdUN4QiJ9