"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetFromGithub = void 0;
const node_fetch_1 = require("node-fetch");
const gulpRemoteSource_1 = require("./gulpRemoteSource");
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
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
function assetFromGithub(repo, version, assetFilter) {
    return (0, gulpRemoteSource_1.remote)(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${version}`, {
        base: 'https://api.github.com',
        fetchOptions: { headers: ghApiHeaders }
    }).pipe(through2.obj(async function (file, _enc, callback) {
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => assetFilter(a.name));
        if (!asset) {
            return callback(new Error(`Could not find asset in release of ${repo} @ ${version}`));
        }
        const response = await (0, node_fetch_1.default)(asset.url, { headers: ghDownloadHeaders });
        if (response.ok) {
            file.contents = response.body.pipe(through2());
            callback(null, file);
        }
        else {
            return callback(new Error(`Request ${response.url} failed with status code: ${response.status}`));
        }
    }));
}
exports.assetFromGithub = assetFromGithub;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2l0aHViLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBR2hHLDJDQUErQjtBQUMvQix5REFBNEM7QUFDNUMscUNBQXFDO0FBRXJDLE1BQU0sWUFBWSxHQUEyQjtJQUM1QyxNQUFNLEVBQUUsZ0NBQWdDO0lBQ3hDLFlBQVksRUFBRSxjQUFjO0NBQzVCLENBQUM7QUFDRixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFO0lBQzdCLFlBQVksQ0FBQyxhQUFhLEdBQUcsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7Q0FDakc7QUFDRCxNQUFNLGlCQUFpQixHQUFHO0lBQ3pCLEdBQUcsWUFBWTtJQUNmLE1BQU0sRUFBRSwwQkFBMEI7Q0FDbEMsQ0FBQztBQUVGOzs7OztHQUtHO0FBQ0gsU0FBZ0IsZUFBZSxDQUFDLElBQVksRUFBRSxPQUFlLEVBQUUsV0FBc0M7SUFDcEcsT0FBTyxJQUFBLHlCQUFNLEVBQUMsVUFBVSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsbUJBQW1CLE9BQU8sRUFBRSxFQUFFO1FBQ2pGLElBQUksRUFBRSx3QkFBd0I7UUFDOUIsWUFBWSxFQUFFLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRTtLQUN2QyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxXQUFXLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUTtRQUN4RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBbUIsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdHLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDWCxPQUFPLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsSUFBSSxNQUFNLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUN0RjtRQUNELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxvQkFBSyxFQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLElBQUksUUFBUSxDQUFDLEVBQUUsRUFBRTtZQUNoQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDL0MsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztTQUNyQjthQUFNO1lBQ04sT0FBTyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsV0FBVyxRQUFRLENBQUMsR0FBRyw2QkFBNkIsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNsRztJQUVGLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBbEJELDBDQWtCQyJ9