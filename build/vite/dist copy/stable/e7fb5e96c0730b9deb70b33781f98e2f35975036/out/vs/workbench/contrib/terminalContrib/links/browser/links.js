/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export const ITerminalLinkProviderService = createDecorator('terminalLinkProviderService');
export var TerminalBuiltinLinkType;
(function (TerminalBuiltinLinkType) {
    /**
     * The link is validated to be a file on the file system and will open an editor.
     */
    TerminalBuiltinLinkType["LocalFile"] = "LocalFile";
    /**
     * The link is validated to be a folder on the file system and is outside the workspace. It will
     * reveal the folder within the explorer.
     */
    TerminalBuiltinLinkType["LocalFolderOutsideWorkspace"] = "LocalFolderOutsideWorkspace";
    /**
     * The link is validated to be a folder on the file system and is within the workspace and will
     * reveal the folder within the explorer.
     */
    TerminalBuiltinLinkType["LocalFolderInWorkspace"] = "LocalFolderInWorkspace";
    /**
     * A low confidence link which will search for the file in the workspace. If there is a single
     * match, it will open the file; otherwise, it will present the matches in a quick pick.
     */
    TerminalBuiltinLinkType["Search"] = "Search";
    /**
     * A link whose text is a valid URI.
     */
    TerminalBuiltinLinkType["Url"] = "Url";
})(TerminalBuiltinLinkType || (TerminalBuiltinLinkType = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvbGlua3MvYnJvd3Nlci9saW5rcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFXaEcsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsZUFBZSxDQUErQiw2QkFBNkIsQ0FBQyxDQUFDO0FBc0d6SCxNQUFNLENBQU4sSUFBa0IsdUJBNEJqQjtBQTVCRCxXQUFrQix1QkFBdUI7SUFDeEM7O09BRUc7SUFDSCxrREFBdUIsQ0FBQTtJQUV2Qjs7O09BR0c7SUFDSCxzRkFBMkQsQ0FBQTtJQUUzRDs7O09BR0c7SUFDSCw0RUFBaUQsQ0FBQTtJQUVqRDs7O09BR0c7SUFDSCw0Q0FBaUIsQ0FBQTtJQUVqQjs7T0FFRztJQUNILHNDQUFXLENBQUE7QUFDWixDQUFDLEVBNUJpQix1QkFBdUIsS0FBdkIsdUJBQXVCLFFBNEJ4QyJ9