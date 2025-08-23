// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { Event, EventEmitter, Uri } from 'vscode';
import { InterpreterAutoSelectionProxyService } from '../../../client/interpreter/autoSelection/proxy';
import { IInterpreterAutoSelectionProxyService } from '../../../client/interpreter/autoSelection/types';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';

suite('Interpreters - Auto Selection Proxy', () => {
    class InstanceClass implements IInterpreterAutoSelectionProxyService {
        public eventEmitter = new EventEmitter<void>();

        constructor(private readonly pythonPath: string = '') {}

        public get onDidChangeAutoSelectedInterpreter(): Event<void> {
            return this.eventEmitter.event;
        }

        public getAutoSelectedInterpreter(): PythonEnvironment {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return { path: this.pythonPath } as any;
        }

        // eslint-disable-next-line class-methods-use-this
        public async setWorkspaceInterpreter(): Promise<void> {
            return Promise.resolve();
        }
    }

    let proxy: InterpreterAutoSelectionProxyService;
    setup(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proxy = new InterpreterAutoSelectionProxyService([] as any);
    });

    test('Change event is fired', () => {
        const obj = new InstanceClass();
        proxy.registerInstance(obj);
        let eventRaised = false;

        proxy.onDidChangeAutoSelectedInterpreter(() => {
            eventRaised = true;
        });
        proxy.registerInstance(obj);

        obj.eventEmitter.fire();

        expect(eventRaised).to.be.equal(true, 'Change event not fired');
    });

    [undefined, Uri.parse('one')].forEach((resource) => {
        const suffix = resource ? '(with a resource)' : '(without a resource)';

        test(`getAutoSelectedInterpreter should return undefined when instance isn't registered ${suffix}`, () => {
            expect(proxy.getAutoSelectedInterpreter(resource)).to.be.equal(undefined, 'Should be undefined');
        });
        test(`getAutoSelectedInterpreter should invoke instance method when instance isn't registered ${suffix}`, () => {
            const pythonPath = 'some python path';
            proxy.registerInstance(new InstanceClass(pythonPath));

            const value = proxy.getAutoSelectedInterpreter(resource);

            expect(value).to.be.deep.equal({ path: pythonPath });
        });
    });
});
