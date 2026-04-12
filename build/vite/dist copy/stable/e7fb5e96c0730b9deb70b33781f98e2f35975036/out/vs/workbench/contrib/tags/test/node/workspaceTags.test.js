/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as crypto from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from '../../common/workspaceTags.js';
function hash(value) {
    return crypto.createHash('sha256').update(value.toString()).digest('hex');
}
async function asyncHash(value) {
    return hash(value);
}
export async function getHashedRemotesFromConfig(text, stripEndingDotGit = false) {
    return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, remote => asyncHash(remote));
}
suite('Telemetry - WorkspaceTags', () => {
    test('Single remote hashed', async function () {
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git')), [hash('github3.com/username/repository.git')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git')), [hash('git.server.org/project.git')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git')), [hash('git.server.org/project.git')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git')), []);
        // Strip .git
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git'), true), [hash('github3.com/username/repository')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git'), true), [hash('git.server.org/project')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git'), true), [hash('git.server.org/project')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git'), true), []);
        // Compare Striped .git with no .git
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git'), true), await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository')));
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git'), true), await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project')));
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git'), true), [hash('git.server.org/project')]);
        assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git'), true), await getHashedRemotesFromConfig(remote('/opt/git/project')));
    });
    test('Multiple remotes hashed', async function () {
        const config = ['https://github.com/microsoft/vscode.git', 'https://git.example.com/gitproject.git'].map(remote).join(' ');
        assert.deepStrictEqual(await getHashedRemotesFromConfig(config), [hash('github.com/microsoft/vscode.git'), hash('git.example.com/gitproject.git')]);
        // Strip .git
        assert.deepStrictEqual(await getHashedRemotesFromConfig(config, true), [hash('github.com/microsoft/vscode'), hash('git.example.com/gitproject')]);
        // Compare Striped .git with no .git
        const noDotGitConfig = ['https://github.com/microsoft/vscode', 'https://git.example.com/gitproject'].map(remote).join(' ');
        assert.deepStrictEqual(await getHashedRemotesFromConfig(config, true), await getHashedRemotesFromConfig(noDotGitConfig));
    });
    function remote(url) {
        return `[remote "origin"]
	url = ${url}
	fetch = +refs/heads/*:refs/remotes/origin/*
`;
    }
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVGFncy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGFncy90ZXN0L25vZGUvd29ya3NwYWNlVGFncy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsMEJBQTBCLElBQUksOEJBQThCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUU3RyxTQUFTLElBQUksQ0FBQyxLQUFhO0lBQzFCLE9BQU8sTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUFFRCxLQUFLLFVBQVUsU0FBUyxDQUFDLEtBQWE7SUFDckMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsMEJBQTBCLENBQUMsSUFBWSxFQUFFLG9CQUE2QixLQUFLO0lBQ2hHLE9BQU8sOEJBQThCLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDN0YsQ0FBQztBQUVELEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFFdkMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEtBQUs7UUFDakMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLDBCQUEwQixDQUFDLE1BQU0sQ0FBQywrREFBK0QsQ0FB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