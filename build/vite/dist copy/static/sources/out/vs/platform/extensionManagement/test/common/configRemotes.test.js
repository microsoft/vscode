/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getDomainsOfRemotes, getRemotes } from '../../common/configRemotes.js';
suite('Config Remotes', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const allowedDomains = [
        'github.com',
        'github2.com',
        'github3.com',
        'example.com',
        'example2.com',
        'example3.com',
        'server.org',
        'server2.org',
    ];
    test('HTTPS remotes', function () {
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://github.com/microsoft/vscode.git'), allowedDomains), ['github.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://git.example.com/gitproject.git'), allowedDomains), ['example.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://username@github2.com/username/repository.git'), allowedDomains), ['github2.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://username:password@github3.com/username/repository.git'), allowedDomains), ['github3.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://username:password@example2.com:1234/username/repository.git'), allowedDomains), ['example2.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('https://example3.com:1234/username/repository.git'), allowedDomains), ['example3.com']);
    });
    test('SSH remotes', function () {
        assert.deepStrictEqual(getDomainsOfRemotes(remote('ssh://user@git.server.org/project.git'), allowedDomains), ['server.org']);
    });
    test('SCP-like remotes', function () {
        assert.deepStrictEqual(getDomainsOfRemotes(remote('git@github.com:microsoft/vscode.git'), allowedDomains), ['github.com']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('user@git.server.org:project.git'), allowedDomains), ['server.org']);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('git.server2.org:project.git'), allowedDomains), ['server2.org']);
    });
    test('Local remotes', function () {
        assert.deepStrictEqual(getDomainsOfRemotes(remote('/opt/git/project.git'), allowedDomains), []);
        assert.deepStrictEqual(getDomainsOfRemotes(remote('file:///opt/git/project.git'), allowedDomains), []);
    });
    test('Multiple remotes', function () {
        const config = ['https://github.com/microsoft/vscode.git', 'https://git.example.com/gitproject.git'].map(remote).join('');
        assert.deepStrictEqual(getDomainsOfRemotes(config, allowedDomains).sort(), ['example.com', 'github.com']);
    });
    test('Non allowed domains are anonymized', () => {
        const config = ['https://github.com/microsoft/vscode.git', 'https://git.foobar.com/gitproject.git'].map(remote).join('');
        assert.deepStrictEqual(getDomainsOfRemotes(config, allowedDomains).sort(), ['aaaaaa.aaa', 'github.com']);
    });
    test('HTTPS remotes to be hashed', function () {
        assert.deepStrictEqual(getRemotes(remote('https://github.com/microsoft/vscode.git')), ['github.com/microsoft/vscode.git']);
        assert.deepStrictEqual(getRemotes(remote('https://git.example.com/gitproject.git')), ['git.example.com/gitproject.git']);
        assert.deepStrictEqual(getRemotes(remote('https://username@github2.com/username/repository.git')), ['github2.com/username/repository.git']);
        assert.deepStrictEqual(getRemotes(remote('https://username:password@github3.com/username/repository.git')), ['github3.com/username/repository.git']);
        assert.deepStrictEqual(getRemotes(remote('https://username:password@example2.com:1234/username/repository.git')), ['example2.com/username/repository.git']);
        assert.deepStrictEqual(getRemotes(remote('https://example3.com:1234/username/repository.git')), ['example3.com/username/repository.git']);
        // Strip .git
        assert.deepStrictEqual(getRemotes(remote('https://github.com/microsoft/vscode.git'), true), ['github.com/microsoft/vscode']);
        assert.deepStrictEqual(getRemotes(remote('https://git.example.com/gitproject.git'), true), ['git.example.com/gitproject']);
        assert.deepStrictEqual(getRemotes(remote('https://username@github2.com/username/repository.git'), true), ['github2.com/username/repository']);
        assert.deepStrictEqual(getRemotes(remote('https://username:password@github3.com/username/repository.git'), true), ['github3.com/username/repository']);
        assert.deepStrictEqual(getRemotes(remote('https://username:password@example2.com:1234/username/repository.git'), true), ['example2.com/username/repository']);
        assert.deepStrictEqual(getRemotes(remote('https://example3.com:1234/username/repository.git'), true), ['example3.com/username/repository']);
        // Compare Striped .git with no .git
        assert.deepStrictEqual(getRemotes(remote('https://github.com/microsoft/vscode.git'), true), getRemotes(remote('https://github.com/microsoft/vscode')));
        assert.deepStrictEqual(getRemotes(remote('https://git.example.com/gitproject.git'), true), getRemotes(remote('https://git.example.com/gitproject')));
        assert.deepStrictEqual(getRemotes(remote('https://username@github2.com/username/repository.git'), true), getRemotes(remote('https://username@github2.com/username/repository')));
        assert.deepStrictEqual(getRemotes(remote('https://username:password@github3.com/username/repository.git'), true), getRemotes(remote('https://username:password@github3.com/username/repository')));
        assert.deepStrictEqual(getRemotes(remote('https://username:password@example2.com:1234/username/repository.git'), true), getRemotes(remote('https://username:password@example2.com:1234/username/repository')));
        assert.deepStrictEqual(getRemotes(remote('https://example3.com:1234/username/repository.git'), true), getRemotes(remote('https://example3.com:1234/username/repository')));
    });
    test('SSH remotes to be hashed', function () {
        assert.deepStrictEqual(getRemotes(remote('ssh://user@git.server.org/project.git')), ['git.server.org/project.git']);
        // Strip .git
        assert.deepStrictEqual(getRemotes(remote('ssh://user@git.server.org/project.git'), true), ['git.server.org/project']);
        // Compare Striped .git with no .git
        assert.deepStrictEqual(getRemotes(remote('ssh://user@git.server.org/project.git'), true), getRemotes(remote('ssh://user@git.server.org/project')));
    });
    test('SCP-like remotes to be hashed', function () {
        assert.deepStrictEqual(getRemotes(remote('git@github.com:microsoft/vscode.git')), ['github.com/microsoft/vscode.git']);
        assert.deepStrictEqual(getRemotes(remote('user@git.server.org:project.git')), ['git.server.org/project.git']);
        assert.deepStrictEqual(getRemotes(remote('git.server2.org:project.git')), ['git.server2.org/project.git']);
        // Strip .git
        assert.deepStrictEqual(getRemotes(remote('git@github.com:microsoft/vscode.git'), true), ['github.com/microsoft/vscode']);
        assert.deepStrictEqual(getRemotes(remote('user@git.server.org:project.git'), true), ['git.server.org/project']);
        assert.deepStrictEqual(getRemotes(remote('git.server2.org:project.git'), true), ['git.server2.org/project']);
        // Compare Striped .git with no .git
        assert.deepStrictEqual(getRemotes(remote('git@github.com:microsoft/vscode.git'), true), getRemotes(remote('git@github.com:microsoft/vscode')));
        assert.deepStrictEqual(getRemotes(remote('user@git.server.org:project.git'), true), getRemotes(remote('user@git.server.org:project')));
        assert.deepStrictEqual(getRemotes(remote('git.server2.org:project.git'), true), getRemotes(remote('git.server2.org:project')));
    });
    test('Local remotes to be hashed', function () {
        assert.deepStrictEqual(getRemotes(remote('/opt/git/project.git')), []);
        assert.deepStrictEqual(getRemotes(remote('file:///opt/git/project.git')), []);
    });
    test('Multiple remotes to be hashed', function () {
        const config = ['https://github.com/microsoft/vscode.git', 'https://git.example.com/gitproject.git'].map(remote).join(' ');
        assert.deepStrictEqual(getRemotes(config), ['github.com/microsoft/vscode.git', 'git.example.com/gitproject.git']);
        // Strip .git
        assert.deepStrictEqual(getRemotes(config, true), ['github.com/microsoft/vscode', 'git.example.com/gitproject']);
        // Compare Striped .git with no .git
        const noDotGitConfig = ['https://github.com/microsoft/vscode', 'https://git.example.com/gitproject'].map(remote).join(' ');
        assert.deepStrictEqual(getRemotes(config, true), getRemotes(noDotGitConfig));
    });
    function remote(url) {
        return `[remote "origin"]
	url = ${url}
	fetch = +refs/heads/*:refs/remotes/origin/*
`;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnUmVtb3Rlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC90ZXN0L2NvbW1vbi9jb25maWdSZW1vdGVzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxVQUFVLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVoRixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBRTVCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxjQUFjLEdBQUc7UUFDdEIsWUFBWTtRQUNaLGFBQWE7UUFDYixhQUFhO1FBQ2IsYUFBYTtRQUNiLGNBQWM7UUFDZCxjQUFjO1FBQ2QsWUFBWTtRQUNaLGFBQWE7S0FDYixDQUFDO0lBRUYsSUFBSSxDQUFDLGVBQWUsRUFBRTtRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyx5Q0FBeUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUMvSCxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyx3Q0FBd0MsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUMvSCxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxzREFBc0QsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM3SSxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLE1B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