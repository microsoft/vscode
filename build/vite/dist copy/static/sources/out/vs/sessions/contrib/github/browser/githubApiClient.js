/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
const LOG_PREFIX = '[GitHubApiClient]';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_ENDPOINT = `${GITHUB_API_BASE}/graphql`;
export class GitHubApiError extends Error {
    constructor(message, statusCode, rateLimitRemaining) {
        super(message);
        this.statusCode = statusCode;
        this.rateLimitRemaining = rateLimitRemaining;
        this.name = 'GitHubApiError';
    }
}
/**
 * Low-level GitHub REST API client. Handles authentication,
 * request construction, and error classification.
 *
 * This class is stateless with respect to domain data — it only
 * manages auth tokens and raw HTTP communication.
 */
let GitHubApiClient = class GitHubApiClient extends Disposable {
    constructor(_requestService, _authenticationService, _logService) {
        super();
        this._requestService = _requestService;
        this._authenticationService = _authenticationService;
        this._logService = _logService;
    }
    async request(method, path, callSite, body) {
        return this._request(method, `${GITHUB_API_BASE}${path}`, path, 'application/vnd.github.v3+json', callSite, body);
    }
    async graphql(query, callSite, variables) {
        const response = await this._request('POST', GITHUB_GRAPHQL_ENDPOINT, '/graphql', 'application/vnd.github+json', callSite, { query, variables });
        if (response.errors?.length) {
            throw new GitHubApiError(response.errors.map(error => error.message).join('; '), 200, undefined);
        }
        if (!response.data) {
            throw new GitHubApiError('GitHub GraphQL response did not include data', 200, undefined);
        }
        return response.data;
    }
    async _request(method, url, pathForLogging, accept, callSite, body) {
        const token = await this._getAuthToken();
        this._logService.trace(`${LOG_PREFIX} ${method} ${pathForLogging}`);
        const response = await this._requestService.request({
            type: method,
            url,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': accept,
                'User-Agent': 'VSCode-Sessions-GitHub',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            data: body !== undefined ? JSON.stringify(body) : undefined,
            callSite
        }, CancellationToken.None);
        const rateLimitRemaining = parseRateLimitHeader(response.res.headers?.['x-ratelimit-remaining']);
        if (rateLimitRemaining !== undefined && rateLimitRemaining < 100) {
            this._logService.warn(`${LOG_PREFIX} GitHub API rate limit low: ${rateLimitRemaining} remaining`);
        }
        const statusCode = response.res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
            const errorBody = await asJson(response).catch(() => undefined);
            throw new GitHubApiError(errorBody?.message ?? `GitHub API request failed: ${method} ${pathForLogging} (${statusCode})`, statusCode, rateLimitRemaining);
        }
        if (statusCode === 204) {
            return undefined;
        }
        const data = await asJson(response);
        if (!data) {
            throw new GitHubApiError(`Failed to parse response for ${method} ${pathForLogging}`, statusCode, rateLimitRemaining);
        }
        return data;
    }
    async _getAuthToken() {
        let sessions = await this._authenticationService.getSessions('github', [], { silent: true });
        if (!sessions || sessions.length === 0) {
            sessions = await this._authenticationService.getSessions('github', [], { createIfNone: true });
        }
        if (!sessions || sessions.length === 0) {
            throw new Error('No GitHub authentication sessions available');
        }
        return sessions[0].accessToken ?? '';
    }
};
GitHubApiClient = __decorate([
    __param(0, IRequestService),
    __param(1, IAuthenticationService),
    __param(2, ILogService)
], GitHubApiClient);
export { GitHubApiClient };
function parseRateLimitHeader(value) {
    if (value === undefined) {
        return undefined;
    }
    const str = Array.isArray(value) ? value[0] : value;
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? undefined : parsed;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViQXBpQ2xpZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9naXRodWIvYnJvd3Nlci9naXRodWJBcGlDbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRWhILE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDO0FBQ3ZDLE1BQU0sZUFBZSxHQUFHLHdCQUF3QixDQUFDO0FBQ2pELE1BQU0sdUJBQXVCLEdBQUcsR0FBRyxlQUFlLFVBQVUsQ0FBQztBQVc3RCxNQUFNLE9BQU8sY0FBZSxTQUFRLEtBQUs7SUFDeEMsWUFDQyxPQUFlLEVBQ04sVUFBa0IsRUFDbEIsa0JBQXNDO1FBRS9DLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUhOLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDbEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUcvQyxJQUFJLENBQUMsSUFBSSxHQUFHLGdCQUFnQixDQUFDO0lBQzlCLENBQUM7Q0FDRDtBQUVEOzs7Ozs7R0FNRztBQUNJLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEsVUFBVTtJQUU5QyxZQUNtQyxlQUFnQyxFQUN6QixzQkFBOEMsRUFDekQsV0FBd0I7UUFFdEQsS0FBSyxFQUFFLENBQUM7UUFKMEIsb0JBQWUsR0FBZixl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