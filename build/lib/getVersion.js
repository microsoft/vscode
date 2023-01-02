"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = void 0;
const git = require("./git");
function getVersion(root) {
    let version = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
    if (!version || !/^[0-9a-f]{40}$/i.test(version.trim())) {
        version = git.getVersion(root);
    }
    return version;
}
exports.getVersion = getVersion;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0VmVyc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdldFZlcnNpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsNkJBQTZCO0FBRTdCLFNBQWdCLFVBQVUsQ0FBQyxJQUFZO0lBQ3RDLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFFeEYsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRTtRQUN4RCxPQUFPLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUMvQjtJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFSRCxnQ0FRQyJ9