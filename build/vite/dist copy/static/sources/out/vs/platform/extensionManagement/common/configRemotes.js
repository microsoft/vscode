/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
const SshProtocolMatcher = /^([^@:]+@)?([^:]+):/;
const SshUrlMatcher = /^([^@:]+@)?([^:]+):(.+)$/;
const AuthorityMatcher = /^([^@]+@)?([^:]+)(:\d+)?$/;
const SecondLevelDomainMatcher = /([^@:.]+\.[^@:.]+)(:\d+)?$/;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
const AnyButDot = /[^.]/g;
export const AllowedSecondLevelDomains = [
    'github.com',
    'bitbucket.org',
    'visualstudio.com',
    'gitlab.com',
    'heroku.com',
    'azurewebsites.net',
    'ibm.com',
    'amazon.com',
    'amazonaws.com',
    'cloudapp.net',
    'rhcloud.com',
    'google.com',
    'azure.com'
];
function stripLowLevelDomains(domain) {
    const match = domain.match(SecondLevelDomainMatcher);
    return match ? match[1] : null;
}
function extractDomain(url) {
    if (url.indexOf('://') === -1) {
        const match = url.match(SshProtocolMatcher);
        if (match) {
            return stripLowLevelDomains(match[2]);
        }
        else {
            return null;
        }
    }
    try {
        const uri = URI.parse(url);
        if (uri.authority) {
            return stripLowLevelDomains(uri.authority);
        }
    }
    catch (e) {
        // ignore invalid URIs
    }
    return null;
}
export function getDomainsOfRemotes(text, allowedDomains) {
    const domains = new Set();
    let match;
    while (match = RemoteMatcher.exec(text)) {
        const domain = extractDomain(match[1]);
        if (domain) {
            domains.add(domain);
        }
    }
    const allowedDomainsSet = new Set(allowedDomains);
    return Array.from(domains)
        .map(key => allowedDomainsSet.has(key) ? key : key.replace(AnyButDot, 'a'));
}
function stripPort(authority) {
    const match = authority.match(AuthorityMatcher);
    return match ? match[2] : null;
}
function normalizeRemote(host, path, stripEndingDotGit) {
    if (host && path) {
        if (stripEndingDotGit && path.endsWith('.git')) {
            path = path.substr(0, path.length - 4);
        }
        return (path.indexOf('/') === 0) ? `${host}${path}` : `${host}/${path}`;
    }
    return null;
}
function extractRemote(url, stripEndingDotGit) {
    if (url.indexOf('://') === -1) {
        const match = url.match(SshUrlMatcher);
        if (match) {
            return normalizeRemote(match[2], match[3], stripEndingDotGit);
        }
    }
    try {
        const uri = URI.parse(url);
        if (uri.authority) {
            return normalizeRemote(stripPort(uri.authority), uri.path, stripEndingDotGit);
        }
    }
    catch (e) {
        // ignore invalid URIs
    }
    return null;
}
export function getRemotes(text, stripEndingDotGit = false) {
    const remotes = [];
    let match;
    while (match = RemoteMatcher.exec(text)) {
        const remote = extractRemote(match[1], stripEndingDotGit);
        if (remote) {
            remotes.push(remote);
        }
    }
    return remotes;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnUmVtb3Rlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2NvbmZpZ1JlbW90ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRWxELE1BQU0sa0JBQWtCLEdBQUcscUJBQXFCLENBQUM7QUFDakQsTUFBTSxhQUFhLEdBQUcsMEJBQTBCLENBQUM7QUFDakQsTUFBTSxnQkFBZ0IsR0FBRywyQkFBMkIsQ0FBQztBQUNyRCxNQUFNLHdCQUF3QixHQUFHLDRCQUE0QixDQUFDO0FBQzlELE1BQU0sYUFBYSxHQUFHLDRCQUE0QixDQUFDO0FBQ25ELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQztBQUUxQixNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRztJQUN4QyxZQUFZO0lBQ1osZUFBZTtJQUNmLGtCQUFrQjtJQUNsQixZQUFZO0lBQ1osWUFBWTtJQUNaLG1CQUFtQjtJQUNuQixTQUFTO0lBQ1QsWUFBWTtJQUNaLGVBQWU7SUFDZixjQUFjO0lBQ2QsYUFBYTtJQUNiLFlBQVk7SUFDWixXQUFXO0NBQ1gsQ0FBQztBQUVGLFNBQVMsb0JBQW9CLENBQUMsTUFBYztJQUMzQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDckQsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ2hDLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxHQUFXO0lBQ2pDLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQy9CLE1BQU0s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