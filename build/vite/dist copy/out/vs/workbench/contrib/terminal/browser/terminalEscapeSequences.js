/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * The identifier for the first numeric parameter (`Ps`) for OSC commands used by shell integration.
 */
var ShellIntegrationOscPs;
(function (ShellIntegrationOscPs) {
    /**
     * Sequences pioneered by FinalTerm.
     */
    ShellIntegrationOscPs[ShellIntegrationOscPs["FinalTerm"] = 133] = "FinalTerm";
    /**
     * Sequences pioneered by VS Code. The number is derived from the least significant digit of
     * "VSC" when encoded in hex ("VSC" = 0x56, 0x53, 0x43).
     */
    ShellIntegrationOscPs[ShellIntegrationOscPs["VSCode"] = 633] = "VSCode";
    /**
     * Sequences pioneered by iTerm.
     */
    ShellIntegrationOscPs[ShellIntegrationOscPs["ITerm"] = 1337] = "ITerm";
})(ShellIntegrationOscPs || (ShellIntegrationOscPs = {}));
/**
 * VS Code-specific shell integration sequences. Some of these are based on common alternatives like
 * those pioneered in FinalTerm. The decision to move to entirely custom sequences was to try to
 * improve reliability and prevent the possibility of applications confusing the terminal.
 */
export var VSCodeOscPt;
(function (VSCodeOscPt) {
    /**
     * The start of the prompt, this is expected to always appear at the start of a line.
     * Based on FinalTerm's `OSC 133 ; A ST`.
     */
    VSCodeOscPt["PromptStart"] = "A";
    /**
     * The start of a command, ie. where the user inputs their command.
     * Based on FinalTerm's `OSC 133 ; B ST`.
     */
    VSCodeOscPt["CommandStart"] = "B";
    /**
     * Sent just before the command output begins.
     * Based on FinalTerm's `OSC 133 ; C ST`.
     */
    VSCodeOscPt["CommandExecuted"] = "C";
    /**
     * Sent just after a command has finished. The exit code is optional, when not specified it
     * means no command was run (ie. enter on empty prompt or ctrl+c).
     * Based on FinalTerm's `OSC 133 ; D [; <ExitCode>] ST`.
     */
    VSCodeOscPt["CommandFinished"] = "D";
    /**
     * Explicitly set the command line. This helps workaround problems with conpty not having a
     * passthrough mode by providing an option on Windows to send the command that was run. With
     * this sequence there's no need for the guessing based on the unreliable cursor positions that
     * would otherwise be required.
     */
    VSCodeOscPt["CommandLine"] = "E";
    /**
     * Similar to prompt start but for line continuations.
     */
    VSCodeOscPt["ContinuationStart"] = "F";
    /**
     * Similar to command start but for line continuations.
     */
    VSCodeOscPt["ContinuationEnd"] = "G";
    /**
     * The start of the right prompt.
     */
    VSCodeOscPt["RightPromptStart"] = "H";
    /**
     * The end of the right prompt.
     */
    VSCodeOscPt["RightPromptEnd"] = "I";
    /**
     * Set an arbitrary property: `OSC 633 ; P ; <Property>=<Value> ST`, only known properties will
     * be handled.
     */
    VSCodeOscPt["Property"] = "P";
})(VSCodeOscPt || (VSCodeOscPt = {}));
export var VSCodeOscProperty;
(function (VSCodeOscProperty) {
    VSCodeOscProperty["Task"] = "Task";
    VSCodeOscProperty["Cwd"] = "Cwd";
    VSCodeOscProperty["HasRichCommandDetection"] = "HasRichCommandDetection";
})(VSCodeOscProperty || (VSCodeOscProperty = {}));
/**
 * ITerm sequences
 */
export var ITermOscPt;
(function (ITermOscPt) {
    /**
     * Based on ITerm's `OSC 1337 ; SetMark` sets a mark on the scrollbar
     */
    ITermOscPt["SetMark"] = "SetMark";
})(ITermOscPt || (ITermOscPt = {}));
export function VSCodeSequence(osc, data) {
    return oscSequence(633 /* ShellIntegrationOscPs.VSCode */, osc, data);
}
export function ITermSequence(osc, data) {
    return oscSequence(1337 /* ShellIntegrationOscPs.ITerm */, osc, data);
}
function oscSequence(ps, pt, data) {
    let result = `\x1b]${ps};${pt}`;
    if (data) {
        result += `;${data}`;
    }
    result += `\x07`;
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFc2NhcGVTZXF1ZW5jZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRXNjYXBlU2VxdWVuY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHOztHQUVHO0FBQ0gsSUFBVyxxQkFjVjtBQWRELFdBQVcscUJBQXFCO0lBQy9COztPQUVHO0lBQ0gsNkVBQWUsQ0FBQTtJQUNmOzs7T0FHRztJQUNILHVFQUFZLENBQUE7SUFDWjs7T0FFRztJQUNILHNFQUFZLENBQUE7QUFDYixDQUFDLEVBZFUscUJBQXFCLEtBQXJCLHFCQUFxQixRQWMvQjtBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsV0EyRGpCO0FBM0RELFdBQWtCLFdBQVc7SUFDNUI7OztPQUdHO0lBQ0gsZ0NBQWlCLENBQUE7SUFFakI7OztPQUdHO0lBQ0gsaUNBQWtCLENBQUE7SUFFbEI7OztPQUdHO0lBQ0gsb0NBQXFCLENBQUE7SUFFckI7Ozs7T0FJRztJQUNILG9DQUFxQixDQUFBO0lBRXJCOzs7OztPQUtHO0lBQ0gsZ0NBQWlCLENBQUE7SUFFakI7O09BRUc7SUFDSCxzQ0FBdUIsQ0FBQTtJQUV2Qjs7T0FFRztJQUNILG9DQUFxQixDQUFBO0lBRXJCOztPQUVHO0lBQ0gscUNBQXNCLENBQUE7SUFFdEI7O09BRUc7SUFDSCxtQ0FBb0IsQ0FBQTtJQUVwQjs7O09BR0c7SUFDSCw2QkFBYyxDQUFBO0FBQ2YsQ0FBQyxFQTNEaUIsV0FBVyxLQUFYLFdBQVcsUUEyRDVCO0FBRUQsTUFBTSxDQUFOLElBQWtCLGlCQUlqQjtBQUpELFdBQWtCLGlCQUFpQjtJQUNsQyxrQ0FBYSxDQUFBO0lBQ2IsZ0NBQVcsQ0FBQTtJQUNYLHdFQUFtRCxDQUFBO0FBQ3BELENBQUMsRUFKaUIsaUJBQWlCLEtBQWpCLGlCQUFpQixRQUlsQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLFVBS2pCO0FBTEQsV0FBa0IsVUFBVTtJQUMzQjs7T0FFRztJQUNILGlDQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFMaUIsVUFBVSxLQUFWLFVBQVUsUUFLM0I7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLEdBQWdCLEVBQUUsSUFBaUM7SUFDakYsT0FBTyxXQUFXLHlDQUErQixHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDN0QsQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsR0FBZSxFQUFFLElBQWE7SUFDM0QsT0FBTyxXQUFXLHlDQUE4QixHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEVBQVUsRUFBRSxFQUFVLEVBQUUsSUFBYTtJQUN6RCxJQUFJLE1BQU0sR0FBRyxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztJQUNoQyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ1YsTUFBTSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUNELE1BQU0sSUFBSSxNQUFNLENBQUM7SUFDakIsT0FBTyxNQUFNLENBQUM7QUFFZixDQUFDIn0=