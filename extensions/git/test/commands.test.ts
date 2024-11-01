import * as assert from 'assert';
import { window, workspace, Uri, commands } from 'vscode';
import { CommandCenter } from '../../src/commands';
import { Git } from '../../src/git';
import { Model } from '../../src/model';
import { OutputChannel } from 'vscode';
import { TelemetryReporter } from 'vscode-extension-telemetry';

suite('CommandCenter', () => {
    let commandCenter: CommandCenter;
    let git: Git;
    let model: Model;
    let outputChannel: OutputChannel;
    let telemetryReporter: TelemetryReporter;

    setup(() => {
        git = new Git({ gitPath: 'git', version: '2.0.0', env: {} });
        model = new Model(git, workspace.getConfiguration(), outputChannel);
        commandCenter = new CommandCenter(git, model, outputChannel, telemetryReporter);
    });

    test('clonePeers', async () => {
        const url = 'https://github.com/microsoft/vscode.git';
        const parentPath = workspace.rootPath || '';

        const showInputBoxStub = sinon.stub(window, 'showInputBox').resolves(url);
        const showOpenDialogStub = sinon.stub(window, 'showOpenDialog').resolves([Uri.file(parentPath)]);
        const withProgressStub = sinon.stub(window, 'withProgress').resolves(parentPath);
        const showInformationMessageStub = sinon.stub(window, 'showInformationMessage').resolves('Open Repository');

        await commandCenter.clonePeers();

        assert(showInputBoxStub.calledOnce);
        assert(showOpenDialogStub.calledOnce);
        assert(withProgressStub.calledOnce);
        assert(showInformationMessageStub.calledOnce);

        showInputBoxStub.restore();
        showOpenDialogStub.restore();
        withProgressStub.restore();
        showInformationMessageStub.restore();
    });
});
