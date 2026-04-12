/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cookie from 'cookie';
import * as fs from 'fs';
import * as path from '../../base/common/path.js';
import { generateUuid } from '../../base/common/uuid.js';
import { connectionTokenCookieName, connectionTokenQueryName } from '../../base/common/network.js';
import { Promises } from '../../base/node/pfs.js';
const connectionTokenRegex = /^[0-9A-Za-z_-]+$/;
export var ServerConnectionTokenType;
(function (ServerConnectionTokenType) {
    ServerConnectionTokenType[ServerConnectionTokenType["None"] = 0] = "None";
    ServerConnectionTokenType[ServerConnectionTokenType["Optional"] = 1] = "Optional";
    ServerConnectionTokenType[ServerConnectionTokenType["Mandatory"] = 2] = "Mandatory";
})(ServerConnectionTokenType || (ServerConnectionTokenType = {}));
export class NoneServerConnectionToken {
    constructor() {
        this.type = 0 /* ServerConnectionTokenType.None */;
    }
    validate(connectionToken) {
        return true;
    }
}
export class MandatoryServerConnectionToken {
    constructor(value) {
        this.value = value;
        this.type = 2 /* ServerConnectionTokenType.Mandatory */;
    }
    validate(connectionToken) {
        return (connectionToken === this.value);
    }
}
export class ServerConnectionTokenParseError {
    constructor(message) {
        this.message = message;
    }
}
export async function parseServerConnectionToken(args, defaultValue) {
    const withoutConnectionToken = args['without-connection-token'];
    const connectionToken = args['connection-token'];
    const connectionTokenFile = args['connection-token-file'];
    if (withoutConnectionToken) {
        if (typeof connectionToken !== 'undefined' || typeof connectionTokenFile !== 'undefined') {
            return new ServerConnectionTokenParseError(`Please do not use the argument '--connection-token' or '--connection-token-file' at the same time as '--without-connection-token'.`);
        }
        return new NoneServerConnectionToken();
    }
    if (typeof connectionTokenFile !== 'undefined') {
        if (typeof connectionToken !== 'undefined') {
            return new ServerConnectionTokenParseError(`Please do not use the argument '--connection-token' at the same time as '--connection-token-file'.`);
        }
        let rawConnectionToken;
        try {
            rawConnectionToken = fs.readFileSync(connectionTokenFile).toString().replace(/\r?\n$/, '');
        }
        catch (e) {
            return new ServerConnectionTokenParseError(`Unable to read the connection token file at '${connectionTokenFile}'.`);
        }
        if (!connectionTokenRegex.test(rawConnectionToken)) {
            return new ServerConnectionTokenParseError(`The connection token defined in '${connectionTokenFile} does not adhere to the characters 0-9, a-z, A-Z, _, or -.`);
        }
        return new MandatoryServerConnectionToken(rawConnectionToken);
    }
    if (typeof connectionToken !== 'undefined') {
        if (!connectionTokenRegex.test(connectionToken)) {
            return new ServerConnectionTokenParseError(`The connection token '${connectionToken} does not adhere to the characters 0-9, a-z, A-Z or -.`);
        }
        return new MandatoryServerConnectionToken(connectionToken);
    }
    return new MandatoryServerConnectionToken(await defaultValue());
}
export async function determineServerConnectionToken(args) {
    const readOrGenerateConnectionToken = async () => {
        if (!args['user-data-dir']) {
            // No place to store it!
            return generateUuid();
        }
        const storageLocation = path.join(args['user-data-dir'], 'token');
        // First try to find a connection token
        try {
            const fileContents = await fs.promises.readFile(storageLocation);
            const connectionToken = fileContents.toString().replace(/\r?\n$/, '');
            if (connectionTokenRegex.test(connectionToken)) {
                return connectionToken;
            }
        }
        catch (err) { }
        // No connection token found, generate one
        const connectionToken = generateUuid();
        try {
            // Try to store it
            await Promises.writeFile(storageLocation, connectionToken, { mode: 0o600 });
        }
        catch (err) { }
        return connectionToken;
    };
    return parseServerConnectionToken(args, readOrGenerateConnectionToken);
}
export function requestHasValidConnectionToken(connectionToken, req, parsedUrl) {
    // First check if there is a valid query parameter
    if (connectionToken.validate(parsedUrl.query[connectionTokenQueryName])) {
        return true;
    }
    // Otherwise, check if there is a valid cookie
    const cookies = cookie.parse(req.headers.cookie || '');
    return connectionToken.validate(cookies[connectionTokenCookieName]);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyQ29ubmVjdGlvblRva2VuLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL25vZGUvc2VydmVyQ29ubmVjdGlvblRva2VuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBR3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sMkJBQTJCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVsRCxNQUFNLG9CQUFvQixHQUFHLGtCQUFrQixDQUFDO0FBRWhELE1BQU0sQ0FBTixJQUFrQix5QkFJakI7QUFKRCxXQUFrQix5QkFBeUI7SUFDMUMseUVBQUksQ0FBQTtJQUNKLGlGQUFRLENBQUE7SUFDUixtRkFBUyxDQUFBO0FBQ1YsQ0FBQyxFQUppQix5QkFBeUIsS0FBekIseUJBQXlCLFFBSTFDO0FBRUQsTUFBTSxPQUFPLHlCQUF5QjtJQUF0QztRQUNpQixTQUFJLDBDQUFrQztJQUt2RCxDQUFDO0lBSE8sUUFBUSxDQUFDLGVBQXdCO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDhCQUE4QjtJQUcxQyxZQUE0QixLQUFhO1FBQWIsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUZ6QixTQUFJLCtDQUF1QztJQUczRCxDQUFDO0lBRU0sUUFBUSxDQUFDLGVBQXdCO1FBQ3ZDLE9BQU8sQ0FBQyxlQUFlLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lB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