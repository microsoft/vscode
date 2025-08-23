// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as triggerUtils from '../../../client/pythonEnvironments/creation/common/createEnvTriggerUtils';
import * as commonUtils from '../../../client/pythonEnvironments/creation/common/commonUtils';
import * as windowApis from '../../../client/common/vscodeApis/windowApis';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../constants';
import {
    CreateEnvironmentCheckKind,
    triggerCreateEnvironmentCheck,
} from '../../../client/pythonEnvironments/creation/createEnvironmentTrigger';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import * as commandApis from '../../../client/common/vscodeApis/commandApis';
import { Commands } from '../../../client/common/constants';
import { Common, CreateEnv } from '../../../client/common/utils/localize';

suite('Create Environment Trigger', () => {
    let shouldPromptToCreateEnvStub: sinon.SinonStub;
    let hasVenvStub: sinon.SinonStub;
    let hasPrefixCondaEnvStub: sinon.SinonStub;
    let hasRequirementFilesStub: sinon.SinonStub;
    let hasKnownFilesStub: sinon.SinonStub;
    let isGlobalPythonSelectedStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let isCreateEnvWorkspaceCheckNotRunStub: sinon.SinonStub;
    let getWorkspaceFolderStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let disableCreateEnvironmentTriggerStub: sinon.SinonStub;

    const workspace1 = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        shouldPromptToCreateEnvStub = sinon.stub(triggerUtils, 'shouldPromptToCreateEnv');
        hasVenvStub = sinon.stub(commonUtils, 'hasVenv');
        hasPrefixCondaEnvStub = sinon.stub(commonUtils, 'hasPrefixCondaEnv');
        hasRequirementFilesStub = sinon.stub(triggerUtils, 'hasRequirementFiles');
        hasKnownFilesStub = sinon.stub(triggerUtils, 'hasKnownFiles');
        isGlobalPythonSelectedStub = sinon.stub(triggerUtils, 'isGlobalPythonSelected');
        showInformationMessageStub = sinon.stub(windowApis, 'showInformationMessage');

        isCreateEnvWorkspaceCheckNotRunStub = sinon.stub(triggerUtils, 'isCreateEnvWorkspaceCheckNotRun');
        isCreateEnvWorkspaceCheckNotRunStub.returns(true);

        getWorkspaceFolderStub = sinon.stub(workspaceApis, 'getWorkspaceFolder');
        getWorkspaceFolderStub.returns(workspace1);

        executeCommandStub = sinon.stub(commandApis, 'executeCommand');
        disableCreateEnvironmentTriggerStub = sinon.stub(triggerUtils, 'disableCreateEnvironmentTrigger');
    });

    teardown(() => {
        sinon.restore();
    });

    test('No Uri', async () => {
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, undefined);
        sinon.assert.notCalled(shouldPromptToCreateEnvStub);
    });

    test('Should not perform checks if user set trigger to "off"', async () => {
        shouldPromptToCreateEnvStub.returns(false);

        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.notCalled(hasVenvStub);
        sinon.assert.notCalled(hasPrefixCondaEnvStub);
        sinon.assert.notCalled(hasRequirementFilesStub);
        sinon.assert.notCalled(hasKnownFilesStub);
        sinon.assert.notCalled(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not perform checks even if force is true, if user set trigger to "off"', async () => {
        shouldPromptToCreateEnvStub.returns(false);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri, {
            force: true,
        });

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.notCalled(hasVenvStub);
        sinon.assert.notCalled(hasPrefixCondaEnvStub);
        sinon.assert.notCalled(hasRequirementFilesStub);
        sinon.assert.notCalled(hasKnownFilesStub);
        sinon.assert.notCalled(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not show prompt if there is a ".venv"', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(true);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not show prompt if there is a ".conda"', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(true);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not show prompt if there are no requirements', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(false);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not show prompt if there are known files', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(false);
        hasKnownFilesStub.resolves(true);
        isGlobalPythonSelectedStub.resolves(true);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should not show prompt if selected python is not global', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(false);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showInformationMessageStub);
    });

    test('Should show prompt if all conditions met: User closes prompt', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);
        showInformationMessageStub.resolves(undefined);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.calledOnce(showInformationMessageStub);

        sinon.assert.notCalled(executeCommandStub);
        sinon.assert.notCalled(disableCreateEnvironmentTriggerStub);
    });

    test('Should show prompt if all conditions met: User clicks create', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);

        showInformationMessageStub.resolves(CreateEnv.Trigger.createEnvironment);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.calledOnce(showInformationMessageStub);

        sinon.assert.calledOnceWithExactly(executeCommandStub, Commands.Create_Environment);
        sinon.assert.notCalled(disableCreateEnvironmentTriggerStub);
    });

    test("Should show prompt if all conditions met: User clicks don't show again", async () => {
        shouldPromptToCreateEnvStub.returns(true);
        hasVenvStub.resolves(false);
        hasPrefixCondaEnvStub.resolves(false);
        hasRequirementFilesStub.resolves(true);
        hasKnownFilesStub.resolves(false);
        isGlobalPythonSelectedStub.resolves(true);

        showInformationMessageStub.resolves(Common.doNotShowAgain);
        await triggerCreateEnvironmentCheck(CreateEnvironmentCheckKind.Workspace, workspace1.uri);

        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(hasVenvStub);
        sinon.assert.calledOnce(hasPrefixCondaEnvStub);
        sinon.assert.calledOnce(hasRequirementFilesStub);
        sinon.assert.calledOnce(hasKnownFilesStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.calledOnce(showInformationMessageStub);

        sinon.assert.notCalled(executeCommandStub);
        sinon.assert.calledOnce(disableCreateEnvironmentTriggerStub);
    });
});
