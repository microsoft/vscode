/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService, NullLoggerService } from '../../../platform/log/common/log.js';
import { ServerAgentHostManager } from '../../node/serverAgentHostManager.js';
// ---- Mock helpers -----------------------------------------------------------
class MockChannel {
    constructor() {
        this._listeners = new Map();
        this._callResults = new Map();
    }
    getEmitter(event) {
        let emitter = this._listeners.get(event);
        if (!emitter) {
            emitter = new Emitter();
            this._listeners.set(event, emitter);
        }
        return emitter;
    }
    setCallResult(command, value) {
        this._callResults.set(command, value);
    }
    call(command, _arg) {
        return Promise.resolve((this._callResults.get(command) ?? undefined));
    }
    listen(event, _arg) {
        return this.getEmitter(event).event;
    }
    dispose() {
        for (const emitter of this._listeners.values()) {
            emitter.dispose();
        }
        this._listeners.clear();
    }
}
class MockAgentHostStarter {
    constructor() {
        this._onDidProcessExit = new Emitter();
        this.agentHostChannel = new MockChannel();
        this.connectionTrackerChannel = new MockChannel();
        this.loggerChannel = new MockChannel();
        this.loggerChannel.setCallResult('getRegisteredLoggers', []);
    }
    start() {
        const store = new DisposableStore();
        const client = {
            getChannel: (name) => {
                switch (name) {
                    case "agentHost" /* AgentHostIpcChannels.AgentHost */:
                        return this.agentHostChannel;
                    case "agentHostLogger" /* AgentHostIpcChannels.Logger */:
                        return this.loggerChannel;
                    case "agentHostConnectionTracker" /* AgentHostIpcChannels.ConnectionTracker */:
                        return this.connectionTrackerChannel;
                    default:
                        throw new Error(`Unknown channel: ${name}`);
                }
            },
        };
        return {
            client,
            store,
            onDidProcessExit: this._onDidProcessExit.event,
        };
    }
    fireProcessExit(code) {
        this._onDidProcessExit.fire({ code, signal: '' });
    }
    dispose() {
        this._onDidProcessExit.dispose();
        this.agentHostChannel.dispose();
        this.loggerChannel.dispose();
        this.connectionTrackerChannel.dispose();
    }
}
class MockServerLifetimeService {
    constructor() {
        this._activeCount = 0;
    }
    get hasActiveConsumers() {
        return this._activeCount > 0;
    }
    active(_consumer) {
        this._activeCount++;
        return toDisposable(() => { this._activeCount--; });
    }
    delay() { }
}
suite('ServerAgentHostManager', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let starter;
    let lifetimeService;
    setup(() => {
        starter = new MockAgentHostStarter();
        lifetimeService = new MockServerLifetimeService();
    });
    function createManager() {
        return ds.add(new ServerAgentHostManager(starter, new NullLogService(), ds.add(new NullLoggerService()), lifetimeService));
    }
    function fireActiveSessions(count) {
        starter.agentHostChannel.getEmitter('onDidAction').fire({
            action: { type: 'root/activeSessionsChanged', activeSessions: count },
            serverSeq: 1,
            origin: undefined,
        });
    }
    function fireConnectionCount(count) {
        starter.connectionTrackerChannel.getEmitter('onDidChangeConnectionCount').fire(count);
    }
    test('no lifetime token initially', () => {
        createManager();
        assert.strictEqual(lifetimeService.hasActiveConsumers, false);
    });
    test('acquires token when sessions become active', () => {
        createManager();
        fireActiveSessions(1);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    });
    test('acquires token when clients connect (no active sessions)', () => {
        createManager();
        fireConnectionCount(2);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    });
    test('releases token only when both sessions and connections are zero', () => {
        createManager();
        // Sessions active, no connections
        fireActiveSessions(1);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
        // Connections appear too
        fireConnectionCount(1);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
        // Sessions go idle, but connections remain
        fireActiveSessions(0);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
        // Connections drop to zero -- now both are idle
        fireConnectionCount(0);
        assert.strictEqual(lifetimeService.hasActiveConsumers, false);
    });
    test('releases token only when connections drop after sessions already idle', () => {
        createManager();
        fireConnectionCount(3);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
        fireConnectionCount(0);
        assert.strictEqual(lifetimeService.hasActiveConsumers, false);
    });
    test('process exit resets both signals and clears token', () => {
        createManager();
        fireActiveSessions(2);
        fireConnectionCount(1);
        assert.strictEqual(lifetimeService.hasActiveConsumers, true);
        starter.fireProcessExit(1);
        assert.strictEqual(lifetimeService.hasActiveConsumers, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyQWdlbnRIb3N0TWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL3Rlc3Qvbm9kZS9zZXJ2ZXJBZ2VudEhvc3RNYW5hZ2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSTdGLE9BQU8sRUFBRSxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUc5RSxnRkFBZ0Y7QUFFaEYsTUFBTSxXQUFXO0lBQWpCO1FBQ2tCLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQUNqRCxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO0lBNkI1RCxDQUFDO0lBM0JBLFVBQVUsQ0FBQyxLQUFhO1FBQ3ZCLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBVyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELGFBQWEsQ0FBQyxPQUFlLEVBQUUsS0FBYztRQUM1QyxJQUFJ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