/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../base/common/uri.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MainThreadConfiguration } from '../../browser/mainThreadConfiguration.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { WorkspaceService } from '../../../services/configuration/browser/configurationService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('MainThreadConfiguration', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    const proxy = {
        $initializeConfiguration: () => { }
    };
    let instantiationService;
    let target;
    suiteSetup(() => {
        Registry.as(Extensions.Configuration).registerConfiguration({
            'id': 'extHostConfiguration',
            'title': 'a',
            'type': 'object',
            'properties': {
                'extHostConfiguration.resource': {
                    'description': 'extHostConfiguration.resource',
                    'type': 'boolean',
                    'default': true,
                    'scope': 5 /* ConfigurationScope.RESOURCE */
                },
                'extHostConfiguration.window': {
                    'description': 'extHostConfiguration.resource',
                    'type': 'boolean',
                    'default': true,
                    'scope': 4 /* ConfigurationScope.WINDOW */
                }
            }
        });
    });
    setup(() => {
        target = sinon.spy();
        instantiationService = new TestInstantiationService();
        instantiationService.stub(IConfigurationService, WorkspaceService);
        instantiationService.stub(IConfigurationService, 'onDidUpdateConfiguration', sinon.mock());
        instantiationService.stub(IConfigurationService, 'onDidChangeConfiguration', sinon.mock());
        instantiationService.stub(IConfigurationService, 'updateValue', target);
        instantiationService.stub(IEnvironmentService, {
            isBuilt: false
        });
    });
    teardown(() => {
        instantiationService.dispose();
    });
    test('update resource configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update resource configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update resource configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update window configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update window configuration without configuration target defaults to workspace in multi root workspace when resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update window configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update window configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update resource configuration without configuration target defaults to folder', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, target.args[0][3]);
    });
    test('update configuration with user configuration target', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(2 /* ConfigurationTarget.USER */, 'extHostConfiguration.window', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(2 /* ConfigurationTarget.USER */, target.args[0][3]);
    });
    test('update configuration with workspace configuration target', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(5 /* ConfigurationTarget.WORKSPACE */, 'extHostConfiguration.window', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('update configuration with folder configuration target', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$updateConfigurationOption(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, 'extHostConfiguration.window', 'value', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, target.args[0][3]);
    });
    test('remove resource configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove resource configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove resource configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove window configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove window configuration without configuration target defaults to workspace in multi root workspace when resource is provided', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove window configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove window configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', undefined, undefined);
        assert.strictEqual(5 /* ConfigurationTarget.WORKSPACE */, target.args[0][3]);
    });
    test('remove configuration without configuration target defaults to folder', function () {
        instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => 3 /* WorkbenchState.WORKSPACE */ });
        const testObject = instantiationService.createInstance(MainThreadConfiguration, SingleProxyRPCProtocol(proxy));
        testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', { resource: URI.file('abc') }, undefined);
        assert.strictEqual(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, target.args[0][3]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbmZpZ3VyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRDb25maWd1cmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBOEMsTUFBTSxvRUFBb0UsQ0FBQztBQUM1SSxPQUFPLEVBQUUsd0JBQXdCLEVBQWtCLE1BQU0sb0RBQW9ELENBQUM7QUFDOUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDdEgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdEUsT0FBTyxFQUFFLHFCQUFxQixFQUF1QixNQUFNLDREQUE0RCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLEtBQUssQ0FBQyx5QkFBeUIsRUFBRTtJQUVoQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sS0FBSyxHQUFHO1FBQ2Isd0JBQXdCLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztLQUNuQyxDQUFDO0lBQ0YsSUFBSSxvQkFBOEMsQ0FBQztJQUNuRCxJQUFJLE1BQXNCLENBQUM7SUFFM0IsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNmLFFBQVEsQ0FBQyxFQUFFLENBQXlCLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztZQUNuRixJQUFJLEVBQUUsc0JBQXNCO1lBQzVCLE9BQU8sRUFBRSxHQUFHO1lBQ1osTUFBTSxFQUFFLFFBQVE7WUFDaEIsWUFBWSxFQUFFO2dCQUNiLCtCQUErQixFQUFFO29CQUNoQyxhQUFhLEVBQUUsK0JBQStCO29CQUM5QyxNQUFNLEVBQUUsU0FBUztvQkFDakIsU0FBUyxFQUFFLElBQUk7b0JBQ2YsT0FBTyxxQ0FBNkI7aUJBQ3BDO2dCQUNELDZCQUE2QixFQUFFO29CQUM5QixhQUFhLEVBQUUsK0JBQStCO29CQUM5QyxNQUFNLEVBQUUsU0FBUztvQkFDakIsU0FBUyxFQUFFLElBQUk7b0JBQ2YsT0FBTyxtQ0FBMkI7aUJBQ2xDO2FBQ0Q7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRXJCLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUN0RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDM0Ysb0JBQW9CLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzNGLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFO1lBQzlDLE9BQU8sRUFBRSxLQUFLO1NBQ2QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2Isb0JBQW9CLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUlBQXVJLEVBQUU7UUFDN0ksb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUE0QixFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxpQ0FBeUIsRUFBRSxDQUFDLENBQUM7UUFDckksTUFBTSxVQUFVLEdBQTRCLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXhJLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsK0JBQStCLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU1RyxNQUFNLENBQUMsV0FBVyx3Q0FBZ0MsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdJQUFnSSxFQUFFO1FBQ3RJLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBNEIsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQ2xJLE1BQU0sVUFBVSxHQUE0QixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV4SSxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFaEksTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtSUFBbUksRUFBRTtRQUN6SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTVHLE1BQU0sQ0FBQyxXQUFXLHdDQUFnQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUlBQXFJLEVBQUU7UUFDM0ksb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUE0QixFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxpQ0FBeUIsRUFBRSxDQUFDLENBQUM7UUFDckksTUFBTSxVQUFVLEdBQTRCLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXhJLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUxRyxNQUFNLENBQUMsV0FBVyx3Q0FBZ0MsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtJQUFrSSxFQUFFO1FBQ3hJLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBNEIsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsaUNBQXlCLEVBQUUsQ0FBQyxDQUFDO1FBQ3JJLE1BQU0sVUFBVSxHQUE0QixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV4SSxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFOUgsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4SEFBOEgsRUFBRTtRQUNwSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTlILE1BQU0sQ0FBQyxXQUFXLHdDQUFnQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUlBQWlJLEVBQUU7UUFDdkksb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUE0QixFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDbEksTUFBTSxVQUFVLEdBQTRCLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXhJLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUxRyxNQUFNLENBQUMsV0FBVyx3Q0FBZ0MsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtFQUErRSxFQUFFO1FBQ3JGLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBNEIsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsaUNBQXlCLEVBQUUsQ0FBQyxDQUFDO1FBQ3JJLE1BQU0sVUFBVSxHQUE0QixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV4SSxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFaEksTUFBTSxDQUFDLFdBQVcsK0NBQXVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxREFBcUQsRUFBRTtRQUMzRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixtQ0FBMkIsNkJBQTZCLEVBQUUsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVsSixNQUFNLENBQUMsV0FBVyxtQ0FBMkIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBEQUEwRCxFQUFFO1FBQ2hFLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBNEIsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQ2xJLE1BQU0sVUFBVSxHQUE0QixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV4SSxVQUFVLENBQUMsMEJBQTBCLHdDQUFnQyw2QkFBNkIsRUFBRSxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXZKLE1BQU0sQ0FBQyxXQUFXLHdDQUFnQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdURBQXVELEVBQUU7UUFDN0Qsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUE0QixFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDbEksTUFBTSxVQUFVLEdBQTRCLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXhJLFVBQVUsQ0FBQywwQkFBMEIsK0NBQXVDLDZCQUE2QixFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFOUosTUFBTSxDQUFDLFdBQVcsK0NBQXVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1SUFBdUksRUFBRTtRQUM3SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGlDQUF5QixFQUFFLENBQUMsQ0FBQztRQUNySSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFbkcsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnSUFBZ0ksRUFBRTtRQUN0SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFdkgsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtSUFBbUksRUFBRTtRQUN6SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFbkcsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxSUFBcUksRUFBRTtRQUMzSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGlDQUF5QixFQUFFLENBQUMsQ0FBQztRQUNySSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFakcsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrSUFBa0ksRUFBRTtRQUN4SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGlDQUF5QixFQUFFLENBQUMsQ0FBQztRQUNySSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFckgsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4SEFBOEgsRUFBRTtRQUNwSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFckgsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpSUFBaUksRUFBRTtRQUN2SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNsSSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFakcsTUFBTSxDQUFDLFdBQVcsd0NBQWdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzRUFBc0UsRUFBRTtRQUM1RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGlDQUF5QixFQUFFLENBQUMsQ0FBQztRQUNySSxNQUFNLFVBQVUsR0FBNEIsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFeEksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFdkgsTUFBTSxDQUFDLFdBQVcsK0NBQXVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RSxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=