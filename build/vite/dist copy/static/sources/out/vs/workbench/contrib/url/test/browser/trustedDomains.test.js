/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isURLDomainTrusted } from '../../../../../platform/url/common/trustedDomains.js';
function linkAllowedByRules(link, rules) {
    assert.ok(isURLDomainTrusted(URI.parse(link), rules), `Link\n${link}\n should be allowed by rules\n${JSON.stringify(rules)}`);
}
function linkNotAllowedByRules(link, rules) {
    assert.ok(!isURLDomainTrusted(URI.parse(link), rules), `Link\n${link}\n should NOT be allowed by rules\n${JSON.stringify(rules)}`);
}
suite('Link protection domain matching', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('simple', () => {
        linkNotAllowedByRules('https://x.org', []);
        linkAllowedByRules('https://x.org', ['https://x.org']);
        linkAllowedByRules('https://x.org/foo', ['https://x.org']);
        linkNotAllowedByRules('https://x.org', ['http://x.org']);
        linkNotAllowedByRules('http://x.org', ['https://x.org']);
        linkNotAllowedByRules('https://www.x.org', ['https://x.org']);
        linkAllowedByRules('https://www.x.org', ['https://www.x.org', 'https://y.org']);
    });
    test('localhost', () => {
        linkAllowedByRules('https://127.0.0.1', []);
        linkAllowedByRules('https://127.0.0.1:3000', []);
        linkAllowedByRules('https://localhost', []);
        linkAllowedByRules('https://localhost:3000', []);
        linkAllowedByRules('https://dev.localhost', []);
        linkAllowedByRules('https://dev.localhost:3000', []);
        linkAllowedByRules('https://app.localhost', []);
        linkAllowedByRules('https://api.localhost:8080', []);
        linkAllowedByRules('https://myapp.dev.localhost:8080', []);
    });
    test('* star', () => {
        linkAllowedByRules('https://a.x.org', ['https://*.x.org']);
        linkAllowedByRules('https://a.b.x.org', ['https://*.x.org']);
    });
    test('no scheme', () => {
        linkAllowedByRules('https://a.x.org', ['a.x.org']);
        linkAllowedByRules('https://a.x.org', ['*.x.org']);
        linkAllowedByRules('https://a.b.x.org', ['*.x.org']);
        linkAllowedByRules('https://x.org', ['*.x.org']);
        // https://github.com/microsoft/vscode/issues/249353
        linkAllowedByRules('https://x.org:3000', ['*.x.org:3000']);
    });
    test('sub paths', () => {
        linkAllowedByRules('https://x.org/foo', ['https://x.org/foo']);
        linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo']);
        linkAllowedByRules('https://x.org/foo', ['https://x.org/foo/']);
        linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo/']);
        linkAllowedByRules('https://x.org/foo', ['x.org/foo']);
        linkAllowedByRules('https://x.org/foo', ['*.org/foo']);
        linkNotAllowedByRules('https://x.org/bar', ['https://x.org/foo']);
        linkNotAllowedByRules('https://x.org/bar', ['x.org/foo']);
        linkNotAllowedByRules('https://x.org/bar', ['*.org/foo']);
        linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo']);
        linkNotAllowedByRules('https://x.org/foo2', ['https://x.org/foo']);
        linkNotAllowedByRules('https://www.x.org/foo', ['https://x.org/foo']);
        linkNotAllowedByRules('https://a.x.org/bar', ['https://*.x.org/foo']);
        linkNotAllowedByRules('https://a.b.x.org/bar', ['https://*.x.org/foo']);
        linkAllowedByRules('https://github.com', ['https://github.com/foo/bar', 'https://github.com']);
    });
    test('ports', () => {
        linkNotAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:8081/foo']);
        linkAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:*/foo']);
        linkAllowedByRules('https://x.org/foo/bar', ['https://x.org:*/foo']);
        linkAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:8080/foo']);
    });
    test('ip addresses', () => {
        linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.7/']);
        linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.7']);
        linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.*']);
        linkNotAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
        linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.7:3000/']);
        linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.7:*']);
        linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.*:*']);
        linkNotAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
    });
    test('scheme match', () => {
        linkAllowedByRules('http://192.168.1.7/', ['http://*']);
        linkAllowedByRules('http://twitter.com', ['http://*']);
        linkAllowedByRules('http://twitter.com/hello', ['http://*']);
        linkNotAllowedByRules('https://192.168.1.7/', ['http://*']);
        linkNotAllowedByRules('https://twitter.com/', ['http://*']);
    });
    test('case normalization', () => {
        // https://github.com/microsoft/vscode/issues/99294
        linkAllowedByRules('https://github.com/microsoft/vscode/issues/new', ['https://github.com/microsoft']);
        linkAllowedByRules('https://github.com/microsoft/vscode/issues/new', ['https://github.com/microsoft']);
    });
    test('ignore query & fragment - https://github.com/microsoft/vscode/issues/156839', () => {
        linkAllowedByRules('https://github.com/login/oauth/authorize?foo=4', ['https://github.com/login/oauth/authorize']);
        linkAllowedByRules('https://github.com/login/oauth/authorize#foo', ['https://github.com/login/oauth/authorize']);
    });
    test('ensure individual parts of url are compared and wildcard does not leak out', () => {
        linkNotAllowedByRules('https://x.org/github.com', ['https://*.github.com']);
        linkNotAllowedByRules('https://x.org/y.github.com', ['https://*.github.com']);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VybC90ZXN0L2Jyb3dzZXIvdHJ1c3RlZERvbWFpbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLFNBQVMsa0JBQWtCLENBQUMsSUFBWSxFQUFFLEtBQWU7SUFDeEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLFNBQVMsSUFBSSxrQ0FBa0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDL0gsQ0FBQztBQUNELFNBQVMscUJBQXFCLENBQUMsSUFBWSxFQUFFLEtBQWU7SUFDM0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsU0FBUyxJQUFJLHNDQUFzQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNwSSxDQUFDO0FBRUQsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtJQUM3Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBQzFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO1FBQ25CLHFCQUFxQixDQUFDLGVBQWUsRUFB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