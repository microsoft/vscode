/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullExtensionService } from '../../../extensions/common/extensions.js';
import { CommandService } from '../../common/commandService.js';
suite('CommandService', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        store.add(CommandsRegistry.registerCommand('foo', function () { }));
    });
    test('activateOnCommand', () => {
        let lastEvent;
        const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
            activateByEvent(activationEvent) {
                lastEvent = activationEvent;
                return super.activateByEvent(activationEvent);
            }
        }, new NullLogService()));
        return service.executeCommand('foo').then(() => {
            assert.ok(lastEvent, 'onCommand:foo');
            return service.executeCommand('unknownCommandId');
        }).then(() => {
            assert.ok(false);
        }, () => {
            assert.ok(lastEvent, 'onCommand:unknownCommandId');
        });
    });
    test('fwd activation error', async function () {
        const extensionService = new class extends NullExtensionService {
            activateByEvent(activationEvent) {
                return Promise.reject(new Error('bad_activate'));
            }
        };
        const service = store.add(new CommandService(new InstantiationService(), extensionService, new NullLogService()));
        await extensionService.whenInstalledExtensionsRegistered();
        return service.executeCommand('foo').then(() => assert.ok(false), err => {
            assert.strictEqual(err.message, 'bad_activate');
        });
    });
    test('!onReady, but executeCommand', function () {
        let callCounter = 0;
        const reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);
        const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
            whenInstalledExtensionsRegistered() {
                return new Promise(_resolve => { });
            }
        }, new NullLogService()));
        service.executeCommand('bar');
        assert.strictEqual(callCounter, 1);
        reg.dispose();
    });
    test('issue #34913: !onReady, unknown command', function () {
        let callCounter = 0;
        let resolveFunc;
        const whenInstalledExtensionsRegistered = new Promise(_resolve => { resolveFunc = _resolve; });
        const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
            whenInstalledExtensionsRegistered() {
                return whenInstalledExtensionsRegistered;
            }
        }, new NullLogService()));
        const r = service.executeCommand('bar');
        assert.strictEqual(callCounter, 0);
        const reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);
        resolveFunc(true);
        return r.then(() => {
            reg.dispose();
            assert.strictEqual(callCounter, 1);
        });
    });
    test('Stop waiting for * extensions to activate when trigger is satisfied #62457', function () {
        let callCounter = 0;
        const disposable = new DisposableStore();
        const events = [];
        const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
            activateByEvent(event) {
                events.push(event);
                if (event === '*') {
                    return new Promise(() => { }); //forever promise...
                }
                if (event.indexOf('onCommand:') === 0) {
                    return new Promise(resolve => {
                        setTimeout(() => {
                            const reg = CommandsRegistry.registerCommand(event.substr('onCommand:'.length), () => {
                                callCounter += 1;
                            });
                            disposable.add(reg);
                            resolve();
                        }, 0);
                    });
                }
                return Promise.resolve();
            }
        }, new NullLogService()));
        return service.executeCommand('farboo').then(() => {
            assert.strictEqual(callCounter, 1);
            assert.deepStrictEqual(events.sort(), ['*', 'onCommand:farboo'].sort());
        }).finally(() => {
            disposable.dispose();
        });
    });
    test('issue #71471: wait for onCommand activation even if a command is registered', () => {
        const expectedOrder = ['registering command', 'resolving activation event', 'executing command'];
        const actualOrder = [];
        const disposables = new DisposableStore();
        const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
            activateByEvent(event) {
                if (event === '*') {
                    return new Promise(() => { }); //forever promise...
                }
                if (event.indexOf('onCommand:') === 0) {
                    return new Promise(resolve => {
                        setTimeout(() => {
                            // Register the command after some time
                            actualOrder.push('registering command');
                            const reg = CommandsRegistry.registerCommand(event.substr('onCommand:'.length), () => {
                                actualOrder.push('executing command');
                            });
                            disposables.add(reg);
                            setTimeout(() => {
                                // Resolve the activation event after some more time
                                actualOrder.push('resolving activation event');
                                resolve();
                            }, 10);
                        }, 10);
                    });
                }
                return Promise.resolve();
            }
        }, new NullLogService()));
        return service.executeCommand('farboo2').then(() => {
            assert.deepStrictEqual(actualOrder, expectedOrder);
        }).finally(() => {
            disposables.dispose();
        });
    });
    test('issue #142155: execute commands synchronously if possible', async () => {
        const actualOrder = [];
        const disposables = new DisposableStore();
        disposables.add(CommandsRegistry.registerCommand(`bizBaz`, () => {
            actualOrder.push('executing command');
        }));
        const extensionService = new class extends NullExtensionService {
            activationEventIsDone(_activationEvent) {
                return true;
            }
        };
        const service = store.add(new CommandService(new InstantiationService(), extensionService, new NullLogService()));
        await extensionService.whenInstalledExtensionsRegistered();
        try {
            actualOrder.push(`before call`);
            const promise = service.executeCommand('bizBaz');
            actualOrder.push(`after call`);
            await promise;
            actualOrder.push(`resolved`);
            assert.deepStrictEqual(actualOrder, [
                'before call',
                'executing command',
                'after call',
                'resolved'
            ]);
        }
        finally {
            disposables.dispose();
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb21tYW5kcy90ZXN0L2NvbW1vbi9jb21tYW5kU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVoRSxLQUFLLENBQUMsZ0JBQWdCLEVBQUU7SUFFdkIsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxLQUFLLENBQUM7UUFDTCxLQUFLLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtRQUU5QixJQUFJLFNBQWlCLENBQUM7UUFFdEIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxJQUFJLG9CQUFvQixFQUFFLEVBQUUsSUFBSSxLQUFNLFNBQVEsb0JBQW9C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