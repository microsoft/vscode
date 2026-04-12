/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { WorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';
suite('WorkspacePluginSettingsService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const logService = new NullLogService();
    let fileService;
    let workspaceContextService;
    const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
    setup(() => {
        workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
        fileService = store.add(new FileService(logService));
        store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
    });
    function createService() {
        return store.add(new WorkspacePluginSettingsService(fileService, workspaceContextService, logService));
    }
    async function writeClaudeSettings(content) {
        const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.json' });
        await fileService.writeFile(uri, VSBuffer.fromString(content));
    }
    async function writeClaudeLocalSettings(content) {
        const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.local.json' });
        await fileService.writeFile(uri, VSBuffer.fromString(content));
    }
    async function writeCopilotSettings(content) {
        const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/copilot/settings.json' });
        await fileService.writeFile(uri, VSBuffer.fromString(content));
    }
    // --- enabledPlugins parsing ---
    test('parses enabledPlugins from Claude settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: {
                'my-plugin@my-marketplace': true,
                'disabled-plugin@my-marketplace': false,
            }
        }));
        const service = createService();
        await waitForState(service.enabledPlugins, v => v.size > 0);
        const enabled = service.enabledPlugins.get();
        assert.strictEqual(enabled.get('my-plugin@my-marketplace'), true);
        assert.strictEqual(enabled.get('disabled-plugin@my-marketplace'), false);
        assert.strictEqual(enabled.size, 2);
    }));
    test('settings.local.json overrides settings.json for enabledPlugins', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: {
                'my-plugin@mp': true,
                'other-plugin@mp': true,
            }
        }));
        await writeClaudeLocalSettings(JSON.stringify({
            enabledPlugins: {
                'my-plugin@mp': false,
            }
        }));
        const service = createService();
        await waitForState(service.enabledPlugins, v => v.size > 0);
        const enabled = service.enabledPlugins.get();
        assert.strictEqual(enabled.get('my-plugin@mp'), false, 'local should override shared');
        assert.strictEqual(enabled.get('other-plugin@mp'), true, 'non-overridden key preserved');
    }));
    test('merges enabledPlugins from Claude and Copilot settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: { 'from-claude@mp': true }
        }));
        await writeCopilotSettings(JSON.stringify({
            enabledPlugins: { 'from-copilot@mp': true }
        }));
        const service = createService();
        await waitForState(service.enabledPlugins, v => v.size >= 2);
        const enabled = service.enabledPlugins.get();
        assert.strictEqual(enabled.get('from-claude@mp'), true);
        assert.strictEqual(enabled.get('from-copilot@mp'), true);
    }));
    test('Claude enabledPlugins take precedence over Copilot for same key', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: { 'shared-plugin@mp': false }
        }));
        await writeCopilotSettings(JSON.stringify({
            enabledPlugins: { 'shared-plugin@mp': true }
        }));
        const service = createService();
        await waitForState(service.enabledPlugins, v => v.size > 0);
        const enabled = service.enabledPlugins.get();
        assert.strictEqual(enabled.get('shared-plugin@mp'), false, 'Claude should win');
    }));
    // --- extraKnownMarketplaces parsing ---
    test('parses GitHub shorthand from extraKnownMarketplaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            extraKnownMarketplaces: {
                'my-marketplace': {
                    source: 'github',
                    repo: 'owner/repo',
                }
            }
        }));
        const service = createService();
        await waitForState(service.extraMarketplaces, v => v.length > 0);
        const marketplaces = service.extraMarketplaces.get();
        assert.strictEqual(marketplaces.length, 1);
        assert.strictEqual(marketplaces[0].name, 'my-marketplace');
        assert.strictEqual(marketplaces[0].reference.displayLabel, 'my-marketplace');
        assert.strictEqual(marketplaces[0].reference.githubRepo, 'owner/repo');
    }));
    test('parses nested source object from extraKnownMarketplaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            extraKnownMarketplaces: {
                'nested-mp': {
                    source: {
                        source: 'github',
                        repo: 'nested-owner/nested-repo',
                    }
                }
            }
        }));
        const service = createService();
        await waitForState(service.extraMarketplaces, v => v.length > 0);
        const marketplaces = service.extraMarketplaces.get();
        assert.strictEqual(marketplaces.length, 1);
        assert.strictEqual(marketplaces[0].reference.githubRepo, 'nested-owner/nested-repo');
        assert.strictEqual(marketplaces[0].reference.displayLabel, 'nested-mp');
    }));
    test('deduplicates marketplaces across Claude and Copilot by canonical ID', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            extraKnownMarketplaces: {
                'claude-name': { source: 'github', repo: 'owner/repo' }
            }
        }));
        await writeCopilotSettings(JSON.stringify({
            extraKnownMarketplaces: {
                'copilot-name': { source: 'github', repo: 'owner/repo' }
            }
        }));
        const service = createService();
        await waitForState(service.extraMarketplaces, v => v.length > 0);
        const marketplaces = service.extraMarketplaces.get();
        assert.strictEqual(marketplaces.length, 1, 'should deduplicate by canonical ID');
        assert.strictEqual(marketplaces[0].name, 'claude-name', 'Claude entry should win');
    }));
    // --- Invalid input handling ---
    test('ignores invalid enabledPlugins shapes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: 'not-an-object'
        }));
        const service = createService();
        // Give the async read a chance to complete with faked timers.
        await new Promise(r => queueMicrotask(r));
        assert.strictEqual(service.enabledPlugins.get().size, 0);
    }));
    test('ignores non-boolean values in enabledPlugins', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            enabledPlugins: {
                'valid@mp': true,
                'number@mp': 42,
                'string@mp': 'yes',
            }
        }));
        const service = createService();
        await waitForState(service.enabledPlugins, v => v.size > 0);
        const enabled = service.enabledPlugins.get();
        assert.strictEqual(enabled.size, 1);
        assert.strictEqual(enabled.get('valid@mp'), true);
    }));
    test('ignores non-object marketplace entries', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await writeClaudeSettings(JSON.stringify({
            extraKnownMarketplaces: {
                'valid': { source: 'github', repo: 'owner/repo' },
                'invalid-string': 'not-valid',
                'invalid-number': 42,
            }
        }));
        const service = createService();
        await waitForState(service.extraMarketplaces, v => v.length > 0);
        const marketplaces = service.extraMarketplaces.get();
        assert.strictEqual(marketplaces.length, 1);
        assert.strictEqual(marketplaces[0].name, 'valid');
    }));
    test('returns empty observables when no settings files exist', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const service = createService();
        await new Promise(r => queueMicrotask(r));
        assert.strictEqual(service.enabledPlugins.get().size, 0);
        assert.strictEqual(service.extraMarketplaces.get().length, 0);
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3BsdWdpbnMvd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNsRyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUUzRyxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBQzVDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztJQUV4QyxJQUFJLFdBQXdCLENBQUM7SUFDN0IsSUFBSSx1QkFBMkMsQ0FBQztJQUNoRCxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7SUFFakYsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLHVCQUF1QixHQUFHLElBQUksa0JBQWtCLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDL0UsV0FBVyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNyRCxLQUFLLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hHLENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyxhQUFhO1FBQ3JCLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUNsRCxXQUFXLEVBQ1gsdUJBQXVCLEVBQ3ZCLFVBQVUsQ0FDVixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxVQUFVLG1CQUFtQixDQUFDLE9BQWU7UUFDakQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxrQ0FBa0MsRUFBRSxDQUFDLENBQUM7UUFDN0YsTUFBTSxXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELEtBQUssVUFBVSx3QkFBd0IsQ0FBQyxPQUFlO1FBQ3RELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsd0NBQXdDLEVBQUUsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxLQUFLLFVBQVUsb0JBQW9CLENBQUMsT0FBZTtRQUNsRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLDBDQUEwQyxFQUFFLENBQUMsQ0FBQztRQUNyRyxNQUFNLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsaUNBQWlDO0lBRWpDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRyxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsY0FBYyxFQUFFO2dCQUNmLDBCQUEwQixFQUFFLElBQUk7Z0JBQ2hDLGdDQUFnQyxFQUFFLEtBQUs7YUFDdkM7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sT0FBTyxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTVELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkksTUFBTSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3hDLGNBQWMsRUFBRTtnQkFDZixjQUFjLEVBQUUsSUFBSTtnQkFDcEIsaUJBQWlCLEVBQUUsSUFBSTthQUN2QjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBQ0osTUFBTSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQzdDLGNBQWMsRUFBRTtnQkFDZixjQUFjLEVBQUUsS0FBSzthQUNyQjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxPQUFPLEdBQUcsYUFBYSxFQUFFLENBQUM7UUFDaEMsTUFBTSxZQUFZLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFNUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixDQUFDLENBQUM7UUFDdkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixDQUFDLENBQUM7SUFDMUYsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyx3REFBd0QsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzSCxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsY0FBYyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFO1NBQzFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osTUFBTSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3pDLGNBQWMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRTtTQUMzQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sT0FBTyxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTdELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNwSSxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsY0FBYyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFO1NBQzdDLENBQUMsQ0FBQyxDQUFDO1FBQ0osTUFBTSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3pDLGNBQWMsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRTtTQUM1QyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sT0FBTyxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTVELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDakYsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLHlDQUF5QztJQUV6QyxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEgsTUFBTSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3hDLHNCQUFzQixFQUFFO2dCQUN2QixnQkFBZ0IsRUFBRTtvQkFDakIsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLElBQUksRUFBRSxZQUFZO2lCQUNsQjthQUNEO1NBQ0QsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLE9BQU8sR0FBRyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLFlBQVksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDeEUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyx5REFBeUQsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1SCxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsc0JBQXNCLEVBQUU7Z0JBQ3ZCLFdBQVcsRUFBRTtvQkFDWixNQUFNLEVBQUU7d0JBQ1AsTUFBTSxFQUFFLFFBQVE7d0JBQ2hCLElBQUksRUFBRSwwQkFBMEI7cUJBQ2hDO2lCQUNEO2FBQ0Q7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sT0FBTyxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFakUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDckYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN6RSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hJLE1BQU0sbUJBQW1CLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUN4QyxzQkFBc0IsRUFBRTtnQkFDdkIsYUFBYSxFQUFFLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFO2FBQ3ZEO1NBQ0QsQ0FBQyxDQUFDLENBQUM7UUFDSixNQUFNLG9CQUFvQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDekMsc0JBQXNCLEVBQUU7Z0JBQ3ZCLGNBQWMsRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRTthQUN4RDtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxPQUFPLEdBQUcsYUFBYSxFQUFFLENBQUM7UUFDaEMsTUFBTSxZQUFZLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVqRSxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUseUJBQXlCLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosaUNBQWlDO0lBRWpDLElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRyxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsY0FBYyxFQUFFLGVBQWU7U0FDL0IsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLE9BQU8sR0FBRyxhQUFhLEVBQUUsQ0FBQztRQUNoQyw4REFBOEQ7UUFDOUQsTUFBTSxJQUFJLE9BQU8sQ0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqSCxNQUFNLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDeEMsY0FBYyxFQUFFO2dCQUNmLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixXQUFXLEVBQUUsRUFBRTtnQkFDZixXQUFXLEVBQUUsS0FBSzthQUNsQjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxPQUFPLEdBQUcsYUFBYSxFQUFFLENBQUM7UUFDaEMsTUFBTSxZQUFZLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFNUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25ELENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixJQUFJLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0csTUFBTSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3hDLHNCQUFzQixFQUFFO2dCQUN2QixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUU7Z0JBQ2pELGdCQUFnQixFQUFFLFdBQVc7Z0JBQzdCLGdCQUFnQixFQUFFLEVBQUU7YUFDcEI7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sT0FBTyxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFakUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyx3REFBd0QsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzSCxNQUFNLE9BQU8sR0FBRyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIn0=