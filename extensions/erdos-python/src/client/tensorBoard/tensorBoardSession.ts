// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { CancellationTokenSource, Uri } from 'vscode';
import { IApplicationShell, ICommandManager } from '../common/application/types';
import { createPromiseFromCancellation } from '../common/cancellation';
import { IInstaller, InstallerResponse, ProductInstallStatus, Product } from '../common/types';
import { Common, TensorBoard } from '../common/utils/localize';
import { IInterpreterService } from '../interpreter/contracts';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';
import { ImportTracker } from '../telemetry/importTracker';
import { TensorBoardPromptSelection } from './constants';
import { ModuleInstallFlags } from '../common/installer/types';
import { traceError, traceVerbose } from '../logging';

const TensorBoardSemVerRequirement = '>= 2.4.1';
const TorchProfilerSemVerRequirement = '>= 0.2.0';

/**
 * Manages the lifecycle of a TensorBoard session.
 * Specifically, it:
 * - ensures the TensorBoard Python package is installed,
 * - asks the user for a log directory to start TensorBoard with
 * - spawns TensorBoard in a background process which must stay running
 *   to serve the TensorBoard website
 * - frames the TensorBoard website in a VSCode webview
 * - shuts down the TensorBoard process when the webview is closed
 */
export class TensorBoardSession {
    constructor(
        private readonly installer: IInstaller,
        private readonly interpreterService: IInterpreterService,
        private readonly commandManager: ICommandManager,
        private readonly applicationShell: IApplicationShell,
    ) {}

    private async promptToInstall(
        tensorBoardInstallStatus: ProductInstallStatus,
        profilerPluginInstallStatus: ProductInstallStatus,
    ) {
        sendTelemetryEvent(EventName.TENSORBOARD_INSTALL_PROMPT_SHOWN);
        const yes = Common.bannerLabelYes;
        const no = Common.bannerLabelNo;
        const isUpgrade = tensorBoardInstallStatus === ProductInstallStatus.NeedsUpgrade;
        let message;

        if (
            tensorBoardInstallStatus === ProductInstallStatus.Installed &&
            profilerPluginInstallStatus !== ProductInstallStatus.Installed
        ) {
            // PyTorch user already has TensorBoard, just ask if they want the profiler plugin
            message = TensorBoard.installProfilerPluginPrompt;
        } else if (profilerPluginInstallStatus !== ProductInstallStatus.Installed) {
            // PyTorch user doesn't have compatible TensorBoard or the profiler plugin
            message = TensorBoard.installTensorBoardAndProfilerPluginPrompt;
        } else if (isUpgrade) {
            // Not a PyTorch user and needs upgrade, don't need to mention profiler plugin
            message = TensorBoard.upgradePrompt;
        } else {
            // Not a PyTorch user and needs install, again don't need to mention profiler plugin
            message = TensorBoard.installPrompt;
        }
        const selection = await this.applicationShell.showErrorMessage(message, ...[yes, no]);
        let telemetrySelection = TensorBoardPromptSelection.None;
        if (selection === yes) {
            telemetrySelection = TensorBoardPromptSelection.Yes;
        } else if (selection === no) {
            telemetrySelection = TensorBoardPromptSelection.No;
        }
        sendTelemetryEvent(EventName.TENSORBOARD_INSTALL_PROMPT_SELECTION, undefined, {
            selection: telemetrySelection,
            operationType: isUpgrade ? 'upgrade' : 'install',
        });
        return selection;
    }

    // Ensure that the TensorBoard package is installed before we attempt
    // to start a TensorBoard session. If the user has a torch import in
    // any of their open documents, also try to install the torch-tb-plugin
    // package, but don't block if installing that fails.
    public async ensurePrerequisitesAreInstalled(resource?: Uri): Promise<boolean> {
        traceVerbose('Ensuring TensorBoard package is installed into active interpreter');
        const interpreter =
            (await this.interpreterService.getActiveInterpreter(resource)) ||
            (await this.commandManager.executeCommand('python.setInterpreter'));
        if (!interpreter) {
            return false;
        }

        // First see what dependencies we're missing
        let [tensorboardInstallStatus, profilerPluginInstallStatus] = await Promise.all([
            this.installer.isProductVersionCompatible(Product.tensorboard, TensorBoardSemVerRequirement, interpreter),
            this.installer.isProductVersionCompatible(
                Product.torchProfilerImportName,
                TorchProfilerSemVerRequirement,
                interpreter,
            ),
        ]);
        const isTorchUser = ImportTracker.hasModuleImport('torch');
        const needsTensorBoardInstall = tensorboardInstallStatus !== ProductInstallStatus.Installed;
        const needsProfilerPluginInstall = profilerPluginInstallStatus !== ProductInstallStatus.Installed;
        if (
            // PyTorch user, in profiler install experiment, TensorBoard and profiler plugin already installed
            (isTorchUser && !needsTensorBoardInstall && !needsProfilerPluginInstall) ||
            // Not PyTorch user or not in profiler install experiment, so no need for profiler plugin,
            // and TensorBoard is already installed
            (!isTorchUser && tensorboardInstallStatus === ProductInstallStatus.Installed)
        ) {
            return true;
        }

        // Ask the user if they want to install packages to start a TensorBoard session
        const selection = await this.promptToInstall(
            tensorboardInstallStatus,
            isTorchUser ? profilerPluginInstallStatus : ProductInstallStatus.Installed,
        );
        if (selection !== Common.bannerLabelYes && !needsTensorBoardInstall) {
            return true;
        }
        if (selection !== Common.bannerLabelYes) {
            return false;
        }

        // User opted to install packages. Figure out which ones we need and install them
        const tokenSource = new CancellationTokenSource();
        const installerToken = tokenSource.token;
        const cancellationPromise = createPromiseFromCancellation({
            cancelAction: 'resolve',
            defaultValue: InstallerResponse.Ignore,
            token: installerToken,
        });
        const installPromises = [];
        // If need to install torch.profiler and it's not already installed, add it to our list of promises
        if (needsTensorBoardInstall) {
            installPromises.push(
                this.installer.install(
                    Product.tensorboard,
                    interpreter,
                    installerToken,
                    tensorboardInstallStatus === ProductInstallStatus.NeedsUpgrade
                        ? ModuleInstallFlags.upgrade
                        : undefined,
                ),
            );
        }
        if (isTorchUser && needsProfilerPluginInstall) {
            installPromises.push(
                this.installer.install(
                    Product.torchProfilerInstallName,
                    interpreter,
                    installerToken,
                    profilerPluginInstallStatus === ProductInstallStatus.NeedsUpgrade
                        ? ModuleInstallFlags.upgrade
                        : undefined,
                ),
            );
        }
        await Promise.race([...installPromises, cancellationPromise]);

        // Check install status again after installing
        [tensorboardInstallStatus, profilerPluginInstallStatus] = await Promise.all([
            this.installer.isProductVersionCompatible(Product.tensorboard, TensorBoardSemVerRequirement, interpreter),
            this.installer.isProductVersionCompatible(
                Product.torchProfilerImportName,
                TorchProfilerSemVerRequirement,
                interpreter,
            ),
        ]);
        // Send telemetry regarding results of install
        sendTelemetryEvent(EventName.TENSORBOARD_PACKAGE_INSTALL_RESULT, undefined, {
            wasTensorBoardAttempted: needsTensorBoardInstall,
            wasProfilerPluginAttempted: needsProfilerPluginInstall,
            wasTensorBoardInstalled: tensorboardInstallStatus === ProductInstallStatus.Installed,
            wasProfilerPluginInstalled: profilerPluginInstallStatus === ProductInstallStatus.Installed,
        });
        // Profiler plugin is not required to start TensorBoard. If it failed, note that it failed
        // in the log, but report success only based on TensorBoard package install status.
        if (isTorchUser && profilerPluginInstallStatus !== ProductInstallStatus.Installed) {
            traceError(`Failed to install torch-tb-plugin. Profiler plugin will not appear in TensorBoard session.`);
        }
        return tensorboardInstallStatus === ProductInstallStatus.Installed;
    }
}
