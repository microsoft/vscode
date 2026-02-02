"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require("path");
const fs = require("fs");
/**
 * Returns the sha1 commit version of a repository or undefined in case of failure.
 */
function getVersion(repo) {
    const git = path.join(repo, '.git');
    const headPath = path.join(git, 'HEAD');
    let head;
    try {
        head = fs.readFileSync(headPath, 'utf8').trim();
    }
    catch (e) {
        return undefined;
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
        return head;
    }
    const refMatch = /^ref: (.*)$/.exec(head);
    if (!refMatch) {
        return undefined;
    }
    const ref = refMatch[1];
    const refPath = path.join(git, ref);
    try {
        return fs.readFileSync(refPath, 'utf8').trim();
    }
    catch (e) {
        // noop
    }
    const packedRefsPath = path.join(git, 'packed-refs');
    let refsRaw;
    try {
        refsRaw = fs.readFileSync(packedRefsPath, 'utf8').trim();
    }
    catch (e) {
        return undefined;
    }
    const refsRegex = /^([0-9a-f]{40})\s+(.+)$/gm;
    let refsMatch;
    const refs = {};
    while (refsMatch = refsRegex.exec(refsRaw)) {
        refs[refsMatch[2]] = refsMatch[1];
    }
    return refs[ref];
}
exports.getVersion = getVersion;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFFekI7O0dBRUc7QUFDSCxTQUFnQixVQUFVLENBQUMsSUFBWTtJQUN0QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNwQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN4QyxJQUFJLElBQVksQ0FBQztJQUVqQixJQUFJLENBQUM7UUFDSixJQUFJLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDakQsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNsQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNmLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFcEMsSUFBSSxDQUFDO1FBQ0osT0FBTyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoRCxDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNaLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDckQsSUFBSSxPQUFlLENBQUM7SUFFcEIsSUFBSSxDQUFDO1FBQ0osT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzFELENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1osT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLDJCQUEyQixDQUFDO0lBQzlDLElBQUksU0FBaUMsQ0FBQztJQUN0QyxNQUFNLElBQUksR0FBOEIsRUFBRSxDQUFDO0lBRTNDLE9BQU8sU0FBUyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNsQixDQUFDO0FBaERELGdDQWdEQyJ9