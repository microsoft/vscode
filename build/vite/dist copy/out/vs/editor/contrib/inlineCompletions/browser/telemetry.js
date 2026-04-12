/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function sendInlineCompletionsEndOfLifeTelemetry(dataChannel, endOfLifeSummary) {
    dataChannel.publicLog2('inlineCompletion.endOfLife', endOfLifeSummary);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci90ZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsTUFBTSxVQUFVLHVDQUF1QyxDQUFDLFdBQWtELEVBQUUsZ0JBQWdEO0lBQzNKLFdBQVcsQ0FBQyxVQUFVLENBQTJFLDRCQUE0QixFQUFFLGdCQUFnQixDQUFDLENBQUM7QUFDbEosQ0FBQyJ9