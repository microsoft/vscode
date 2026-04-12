/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var WorkingCopyCapabilities;
(function (WorkingCopyCapabilities) {
    /**
     * Signals no specific capability for the working copy.
     */
    WorkingCopyCapabilities[WorkingCopyCapabilities["None"] = 0] = "None";
    /**
     * Signals that the working copy requires
     * additional input when saving, e.g. an
     * associated path to save to.
     */
    WorkingCopyCapabilities[WorkingCopyCapabilities["Untitled"] = 2] = "Untitled";
    /**
     * The working copy will not indicate that
     * it is dirty and unsaved content will be
     * discarded without prompting if closed.
     */
    WorkingCopyCapabilities[WorkingCopyCapabilities["Scratchpad"] = 4] = "Scratchpad";
})(WorkingCopyCapabilities || (WorkingCopyCapabilities = {}));
/**
 * @deprecated it is important to provide a type identifier
 * for working copies to enable all capabilities.
 */
export const NO_TYPE_ID = '';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBUWhHLE1BQU0sQ0FBTixJQUFrQix1QkFvQmpCO0FBcEJELFdBQWtCLHVCQUF1QjtJQUV4Qzs7T0FFRztJQUNILHFFQUFRLENBQUE7SUFFUjs7OztPQUlHO0lBQ0gsNkVBQWlCLENBQUE7SUFFakI7Ozs7T0FJRztJQUNILGlGQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFwQmlCLHVCQUF1QixLQUF2Qix1QkFBdUIsUUFvQnhDO0FBMENEOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUMifQ==