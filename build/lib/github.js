"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetFromGithub = void 0;
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
function assetFromGithub(repo, options) {
    return (0, gulpRemoteSource_1.remote)(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${options.version}`, {
        base: 'https://api.github.com',
        verbose: true,
        fetchOptions: { headers: ghApiHeaders }
    }).pipe(through2.obj(async function (file, _enc, callback) {
        const assetFilter = typeof options.name === 'string' ? (name) => name === options.name : options.name;
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => assetFilter(a.name));
        if (!asset) {
            return callback(new Error(`Could not find asset in release of ${repo} @ ${options.version}`));
        }
        try {
            callback(null, await (0, gulpRemoteSource_1.remoteFile)(asset.url, {
                fetchOptions: { headers: ghDownloadHeaders },
                verbose: true,
                checksumSha256: options.checksumSha256
            }));
        }
        catch (error) {
            callback(error);
        }
    }));
}
exports.assetFromGithub = assetFromGithub;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2l0aHViLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBR2hHLHlEQUF3RDtBQUN4RCxxQ0FBcUM7QUFFckMsTUFBTSxZQUFZLEdBQTJCO0lBQzVDLE1BQU0sRUFBRSxnQ0FBZ0M7SUFDeEMsWUFBWSxFQUFFLGNBQWM7Q0FDNUIsQ0FBQztBQUNGLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUU7SUFDN0IsWUFBWSxDQUFDLGFBQWEsR0FBRyxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztDQUNqRztBQUNELE1BQU0saUJBQWlCLEdBQUc7SUFDekIsR0FBRyxZQUFZO0lBQ2YsTUFBTSxFQUFFLDBCQUEwQjtDQUNsQyxDQUFDO0FBUUY7Ozs7O0dBS0c7QUFDSCxTQUFnQixlQUFlLENBQUMsSUFBWSxFQUFFLE9BQTRCO0lBQ3pFLE9BQU8sSUFBQSx5QkFBTSxFQUFDLFVBQVUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLG1CQUFtQixPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDekYsSUFBSSxFQUFFLHdCQUF3QjtRQUM5QixPQUFPLEVBQUUsSUFBSTtRQUNiLFlBQVksRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7S0FDdkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssV0FBVyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVE7UUFDeEQsTUFBTSxXQUFXLEdBQUcsT0FBTyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQzlHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFtQixFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0csSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNYLE9BQU8sUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDLHNDQUFzQyxJQUFJLE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUM5RjtRQUNELElBQUk7WUFDSCxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sSUFBQSw2QkFBVSxFQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQzFDLFlBQVksRUFBRSxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRTtnQkFDNUMsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsY0FBYyxFQUFFLE9BQU8sQ0FBQyxjQUFjO2FBQ3RDLENBQUMsQ0FBQyxDQUFDO1NBQ0o7UUFBQyxPQUFPLEtBQUssRUFBRTtZQUNmLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNoQjtJQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBckJELDBDQXFCQyJ9