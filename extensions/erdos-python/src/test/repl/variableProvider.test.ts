// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { assert } from 'chai';
import sinon from 'sinon';
import {
    NotebookDocument,
    CancellationTokenSource,
    VariablesResult,
    Variable,
    EventEmitter,
    ConfigurationScope,
    WorkspaceConfiguration,
} from 'vscode';
import * as TypeMoq from 'typemoq';
import { IVariableDescription } from '../../client/repl/variables/types';
import { VariablesProvider } from '../../client/repl/variables/variablesProvider';
import { VariableRequester } from '../../client/repl/variables/variableRequester';
import * as workspaceApis from '../../client/common/vscodeApis/workspaceApis';

suite('ReplVariablesProvider', () => {
    let provider: VariablesProvider;
    let varRequester: TypeMoq.IMock<VariableRequester>;
    let notebook: TypeMoq.IMock<NotebookDocument>;
    let getConfigurationStub: sinon.SinonStub;
    let configMock: TypeMoq.IMock<WorkspaceConfiguration>;
    let enabled: boolean;
    const executionEventEmitter = new EventEmitter<void>();
    const cancellationToken = new CancellationTokenSource().token;

    const objectVariable: IVariableDescription = {
        name: 'myObject',
        value: '...',
        root: 'myObject',
        hasNamedChildren: true,
        propertyChain: [],
    };

    const listVariable: IVariableDescription = {
        name: 'myList',
        value: '[...]',
        count: 3,
        root: 'myObject',
        propertyChain: ['myList'],
    };

    function createListItem(index: number): IVariableDescription {
        return {
            name: index.toString(),
            value: `value${index}`,
            count: index,
            root: 'myObject',
            propertyChain: ['myList', index],
        };
    }

    function setVariablesForParent(
        parent: IVariableDescription | undefined,
        result: IVariableDescription[],
        updated?: IVariableDescription[],
        startIndex?: number,
    ) {
        let returnedOnce = false;
        varRequester
            .setup((v) => v.getAllVariableDescriptions(parent, startIndex ?? TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => {
                if (updated && returnedOnce) {
                    return Promise.resolve(updated);
                }
                returnedOnce = true;
                return Promise.resolve(result);
            });
    }

    async function provideVariables(parent: Variable | undefined, kind = 1) {
        const results: VariablesResult[] = [];
        for await (const result of provider.provideVariables(notebook.object, parent, kind, 0, cancellationToken)) {
            results.push(result);
        }
        return results;
    }

    setup(() => {
        enabled = true;
        varRequester = TypeMoq.Mock.ofType<VariableRequester>();
        notebook = TypeMoq.Mock.ofType<NotebookDocument>();
        provider = new VariablesProvider(varRequester.object, () => notebook.object, executionEventEmitter.event);
        configMock = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
        configMock.setup((c) => c.get<boolean>('REPL.provideVariables')).returns(() => enabled);
        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
        getConfigurationStub.callsFake((section?: string, _scope?: ConfigurationScope | null) => {
            if (section === 'python') {
                return configMock.object;
            }
            return undefined;
        });
    });

    teardown(() => {
        sinon.restore();
    });

    test('provideVariables without parent should yield variables', async () => {
        setVariablesForParent(undefined, [objectVariable]);

        const results = await provideVariables(undefined);

        assert.isNotEmpty(results);
        assert.equal(results.length, 1);
        assert.equal(results[0].variable.name, 'myObject');
        assert.equal(results[0].variable.expression, 'myObject');
    });

    test('No variables are returned when variable provider is disabled', async () => {
        enabled = false;
        setVariablesForParent(undefined, [objectVariable]);

        const results = await provideVariables(undefined);

        assert.isEmpty(results);
    });

    test('No change event from provider when disabled', async () => {
        enabled = false;
        let eventFired = false;
        provider.onDidChangeVariables(() => {
            eventFired = true;
        });

        executionEventEmitter.fire();

        assert.isFalse(eventFired, 'event should not have fired');
    });

    test('Variables change event from provider should fire when execution happens', async () => {
        let eventFired = false;
        provider.onDidChangeVariables(() => {
            eventFired = true;
        });

        executionEventEmitter.fire();

        assert.isTrue(eventFired, 'event should have fired');
    });

    test('provideVariables with a parent should call get children correctly', async () => {
        const listVariableItems = [0, 1, 2].map(createListItem);
        setVariablesForParent(undefined, [objectVariable]);

        // pass each the result as the parent in the next call
        const rootVariable = (await provideVariables(undefined))[0];
        setVariablesForParent(rootVariable.variable as IVariableDescription, [listVariable]);
        const listResult = (await provideVariables(rootVariable!.variable))[0];
        setVariablesForParent(listResult.variable as IVariableDescription, listVariableItems);
        const listItems = await provideVariables(listResult!.variable, 2);

        assert.equal(listResult.variable.name, 'myList');
        assert.equal(listResult.variable.expression, 'myObject.myList');
        assert.isNotEmpty(listItems);
        assert.equal(listItems.length, 3);
        listItems.forEach((item, index) => {
            assert.equal(item.variable.name, index.toString());
            assert.equal(item.variable.value, `value${index}`);
            assert.equal(item.variable.expression, `myObject.myList[${index}]`);
        });
    });

    test('All indexed variables should be returned when requested', async () => {
        const listVariable: IVariableDescription = {
            name: 'myList',
            value: '[...]',
            count: 6,
            root: 'myList',
            propertyChain: [],
        };

        setVariablesForParent(undefined, [listVariable]);
        const rootVariable = (await provideVariables(undefined))[0];
        const firstPage = [0, 1, 2].map(createListItem);
        const secondPage = [3, 4, 5].map(createListItem);
        setVariablesForParent(rootVariable.variable as IVariableDescription, firstPage, undefined, 0);
        setVariablesForParent(rootVariable.variable as IVariableDescription, secondPage, undefined, firstPage.length);

        const listItemResult = await provideVariables(rootVariable!.variable, 2);

        assert.equal(listItemResult.length, 6, 'full list of items should be returned');
        listItemResult.forEach((item, index) => {
            assert.equal(item.variable.name, index.toString());
            assert.equal(item.variable.value, `value${index}`);
        });
    });

    test('Getting less indexed items than the specified count is handled', async () => {
        const listVariable: IVariableDescription = {
            name: 'myList',
            value: '[...]',
            count: 6,
            root: 'myList',
            propertyChain: [],
        };

        const firstPage = [0, 1, 2].map(createListItem);
        const secondPage = [3, 4].map(createListItem);
        setVariablesForParent(undefined, [listVariable]);
        const rootVariable = (await provideVariables(undefined))[0];
        setVariablesForParent(rootVariable.variable as IVariableDescription, firstPage, undefined, 0);
        setVariablesForParent(rootVariable.variable as IVariableDescription, secondPage, undefined, firstPage.length);
        setVariablesForParent(rootVariable.variable as IVariableDescription, [], undefined, 5);

        const listItemResult = await provideVariables(rootVariable!.variable, 2);

        assert.equal(listItemResult.length, 5);
        listItemResult.forEach((item, index) => {
            assert.equal(item.variable.name, index.toString());
            assert.equal(item.variable.value, `value${index}`);
        });
    });

    test('Getting variables again with new execution count should get updated variables', async () => {
        const intVariable: IVariableDescription = {
            name: 'myInt',
            value: '1',
            root: '',
            propertyChain: [],
        };
        setVariablesForParent(undefined, [intVariable], [{ ...intVariable, value: '2' }]);

        const first = await provideVariables(undefined);
        executionEventEmitter.fire();
        const second = await provideVariables(undefined);

        assert.equal(first.length, 1);
        assert.equal(second.length, 1);
        assert.equal(first[0].variable.value, '1');
        assert.equal(second[0].variable.value, '2');
    });

    test('Getting variables again with same execution count should not make another call', async () => {
        const intVariable: IVariableDescription = {
            name: 'myInt',
            value: '1',
            root: '',
            propertyChain: [],
        };

        setVariablesForParent(undefined, [intVariable]);

        const first = await provideVariables(undefined);
        const second = await provideVariables(undefined);

        assert.equal(first.length, 1);
        assert.equal(second.length, 1);
        assert.equal(first[0].variable.value, '1');

        varRequester.verify(
            (x) => x.getAllVariableDescriptions(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    test('Cache pages of indexed children correctly', async () => {
        const listVariable: IVariableDescription = {
            name: 'myList',
            value: '[...]',
            count: 6,
            root: 'myList',
            propertyChain: [],
        };

        const firstPage = [0, 1, 2].map(createListItem);
        const secondPage = [3, 4, 5].map(createListItem);
        setVariablesForParent(undefined, [listVariable]);
        const rootVariable = (await provideVariables(undefined))[0];
        setVariablesForParent(rootVariable.variable as IVariableDescription, firstPage, undefined, 0);
        setVariablesForParent(rootVariable.variable as IVariableDescription, secondPage, undefined, firstPage.length);

        await provideVariables(rootVariable!.variable, 2);

        // once for the parent and once for each of the two pages of list items
        varRequester.verify(
            (x) => x.getAllVariableDescriptions(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.exactly(3),
        );

        const listItemResult = await provideVariables(rootVariable!.variable, 2);

        assert.equal(listItemResult.length, 6, 'full list of items should be returned');
        listItemResult.forEach((item, index) => {
            assert.equal(item.variable.name, index.toString());
            assert.equal(item.variable.value, `value${index}`);
        });

        // no extra calls for getting the children again
        varRequester.verify(
            (x) => x.getAllVariableDescriptions(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.exactly(3),
        );
    });
});
