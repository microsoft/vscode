"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetFromGithub = void 0;
const got_1 = require("got");
const remote = require("gulp-remote-retry-src");
const through2 = require("through2");
const ghApiHeaders = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'VSCode Build',
};
if (process.env.GITHUB_TOKEN) {
    ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
    ...ghApiHeaders,
    Accept: 'application/octet-stream',
};
/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
function assetFromGithub(repo, version, assetName) {
    return remote(`/repos/${repo}/releases/tags/v${version}`, {
        base: 'https://api.github.com',
        requestOptions: { headers: ghApiHeaders }
    }).pipe(through2.obj(function (file, _enc, callback) {
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => a.name === assetName);
        if (!asset) {
            return callback(new Error(`Could not find asset ${assetName} in release of ${repo} @ ${version}`));
        }
        const res = got_1.default.stream(asset.url, { headers: ghDownloadHeaders, followRedirect: true });
        file.contents = res.pipe(through2());
        callback(null, file);
    }));
}
exports.assetFromGithub = assetFromGithub;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2l0aHViLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBR2hHLDZCQUFzQjtBQUN0QixnREFBZ0Q7QUFDaEQscUNBQXFDO0FBRXJDLE1BQU0sWUFBWSxHQUEyQjtJQUM1QyxNQUFNLEVBQUUsZ0NBQWdDO0lBQ3hDLFlBQVksRUFBRSxjQUFjO0NBQzVCLENBQUM7QUFDRixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFO0lBQzdCLFlBQVksQ0FBQyxhQUFhLEdBQUcsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7Q0FDakc7QUFDRCxNQUFNLGlCQUFpQixHQUFHO0lBQ3pCLEdBQUcsWUFBWTtJQUNmLE1BQU0sRUFBRSwwQkFBMEI7Q0FDbEMsQ0FBQztBQUVGOzs7OztHQUtHO0FBQ0gsU0FBZ0IsZUFBZSxDQUFDLElBQVksRUFBRSxPQUFlLEVBQUUsU0FBaUI7SUFDL0UsT0FBTyxNQUFNLENBQUMsVUFBVSxJQUFJLG1CQUFtQixPQUFPLEVBQUUsRUFBRTtRQUN6RCxJQUFJLEVBQUUsd0JBQXdCO1FBQzlCLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7S0FDekMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDO1FBQzlHLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDWCxPQUFPLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsU0FBUyxrQkFBa0IsSUFBSSxNQUFNLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNuRztRQUVELE1BQU0sR0FBRyxHQUFHLGFBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsUUFBUSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNyQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBZEQsMENBY0MifQ==