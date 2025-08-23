// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { l10n } from 'vscode';
import { Commands } from '../constants';

/* eslint-disable @typescript-eslint/no-namespace, no-shadow */

// External callers of localize use these tables to retrieve localized values.
export namespace Diagnostics {
    export const lsNotSupported = l10n.t(
        'Your operating system does not meet the minimum requirements of the Python Language Server. Reverting to the alternative autocompletion provider, Jedi.',
    );
    export const invalidPythonPathInDebuggerSettings = l10n.t(
        'You need to select a Python interpreter before you start debugging.\n\nTip: click on "Select Interpreter" in the status bar.',
    );
    export const invalidPythonPathInDebuggerLaunch = l10n.t('The Python path in your debug configuration is invalid.');
    export const invalidDebuggerTypeDiagnostic = l10n.t(
        'Your launch.json file needs to be updated to change the "pythonExperimental" debug configurations to use the "python" debugger type, otherwise Python debugging may not work. Would you like to automatically update your launch.json file now?',
    );
    export const consoleTypeDiagnostic = l10n.t(
        'Your launch.json file needs to be updated to change the console type string from "none" to "internalConsole", otherwise Python debugging may not work. Would you like to automatically update your launch.json file now?',
    );
    export const justMyCodeDiagnostic = l10n.t(
        'Configuration "debugStdLib" in launch.json is no longer supported. It\'s recommended to replace it with "justMyCode", which is the exact opposite of using "debugStdLib". Would you like to automatically update your launch.json file to do that?',
    );
    export const yesUpdateLaunch = l10n.t('Yes, update launch.json');
    export const invalidTestSettings = l10n.t(
        'Your settings needs to be updated to change the setting "python.unitTest." to "python.testing.", otherwise testing Python code using the extension may not work. Would you like to automatically update your settings now?',
    );
    export const updateSettings = l10n.t('Yes, update settings');
    export const pylanceDefaultMessage = l10n.t(
        "The Python extension now includes Pylance to improve completions, code navigation, overall performance and much more! You can learn more about the update and learn how to change your language server [here](https://aka.ms/new-python-bundle).\n\nRead Pylance's license [here](https://marketplace.visualstudio.com/items/ms-python.vscode-pylance/license).",
    );
    export const invalidSmartSendMessage = l10n.t(
        `Python is unable to parse the code provided. Please
    turn off Smart Send if you wish to always run line by line or explicitly select code
    to force run. See [logs](command:{0}) for more details`,
        Commands.ViewOutput,
    );
}

export namespace Common {
    export const allow = l10n.t('Allow');
    export const seeInstructions = l10n.t('See Instructions');
    export const close = l10n.t('Close');
    export const bannerLabelYes = l10n.t('Yes');
    export const bannerLabelNo = l10n.t('No');
    export const canceled = l10n.t('Canceled');
    export const cancel = l10n.t('Cancel');
    export const ok = l10n.t('Ok');
    export const error = l10n.t('Error');
    export const gotIt = l10n.t('Got it!');
    export const install = l10n.t('Install');
    export const loadingExtension = l10n.t('Python extension loading...');
    export const openOutputPanel = l10n.t('Show output');
    export const noIWillDoItLater = l10n.t('No, I will do it later');
    export const notNow = l10n.t('Not now');
    export const doNotShowAgain = l10n.t("Don't show again");
    export const editSomething = l10n.t('Edit {0}');
    export const reload = l10n.t('Reload');
    export const moreInfo = l10n.t('More Info');
    export const learnMore = l10n.t('Learn more');
    export const and = l10n.t('and');
    export const reportThisIssue = l10n.t('Report this issue');
    export const recommended = l10n.t('Recommended');
    export const clearAll = l10n.t('Clear all');
    export const alwaysIgnore = l10n.t('Always Ignore');
    export const ignore = l10n.t('Ignore');
    export const selectPythonInterpreter = l10n.t('Select Python Interpreter');
    export const openLaunch = l10n.t('Open launch.json');
    export const useCommandPrompt = l10n.t('Use Command Prompt');
    export const download = l10n.t('Download');
    export const showLogs = l10n.t('Show logs');
    export const openFolder = l10n.t('Open Folder...');
}

export namespace CommonSurvey {
    export const remindMeLaterLabel = l10n.t('Remind me later');
    export const yesLabel = l10n.t('Yes, take survey now');
    export const noLabel = l10n.t('No, thanks');
}

export namespace AttachProcess {
    export const attachTitle = l10n.t('Attach to process');
    export const selectProcessPlaceholder = l10n.t('Select the process to attach to');
    export const noProcessSelected = l10n.t('No process selected');
    export const refreshList = l10n.t('Refresh process list');
}

export namespace Repl {
    export const disableSmartSend = l10n.t('Disable Smart Send');
    export const launchNativeRepl = l10n.t('Launch VS Code Native REPL');
}
export namespace Pylance {
    export const remindMeLater = l10n.t('Remind me later');

    export const pylanceNotInstalledMessage = l10n.t('Pylance extension is not installed.');
    export const pylanceInstalledReloadPromptMessage = l10n.t(
        'Pylance extension is now installed. Reload window to activate?',
    );

    export const pylanceRevertToJediPrompt = l10n.t(
        'The Pylance extension is not installed but the python.languageServer value is set to "Pylance". Would you like to install the Pylance extension to use Pylance, or revert back to Jedi?',
    );
    export const pylanceInstallPylance = l10n.t('Install Pylance');
    export const pylanceRevertToJedi = l10n.t('Revert to Jedi');
}

export namespace TensorBoard {
    export const enterRemoteUrl = l10n.t('Enter remote URL');
    export const enterRemoteUrlDetail = l10n.t(
        'Enter a URL pointing to a remote directory containing your TensorBoard log files',
    );
    export const useCurrentWorkingDirectoryDetail = l10n.t(
        'TensorBoard will search for tfevent files in all subdirectories of the current working directory',
    );
    export const useCurrentWorkingDirectory = l10n.t('Use current working directory');
    export const logDirectoryPrompt = l10n.t('Select a log directory to start TensorBoard with');
    export const progressMessage = l10n.t('Starting TensorBoard session...');
    export const nativeTensorBoardPrompt = l10n.t(
        'VS Code now has integrated TensorBoard support. Would you like to launch TensorBoard?  (Tip: Launch TensorBoard anytime by opening the command palette and searching for "Launch TensorBoard".)',
    );
    export const selectAFolder = l10n.t('Select a folder');
    export const selectAFolderDetail = l10n.t('Select a log directory containing tfevent files');
    export const selectAnotherFolder = l10n.t('Select another folder');
    export const selectAnotherFolderDetail = l10n.t('Use the file explorer to select another folder');
    export const installPrompt = l10n.t(
        'The package TensorBoard is required to launch a TensorBoard session. Would you like to install it?',
    );
    export const installTensorBoardAndProfilerPluginPrompt = l10n.t(
        'TensorBoard >= 2.4.1 and the PyTorch Profiler TensorBoard plugin >= 0.2.0 are required. Would you like to install these packages?',
    );
    export const installProfilerPluginPrompt = l10n.t(
        'We recommend installing version >= 0.2.0 of the PyTorch Profiler TensorBoard plugin. Would you like to install the package?',
    );
    export const upgradePrompt = l10n.t(
        'Integrated TensorBoard support is only available for TensorBoard >= 2.4.1. Would you like to upgrade your copy of TensorBoard?',
    );
    export const missingSourceFile = l10n.t(
        'The Python extension could not locate the requested source file on disk. Please manually specify the file.',
    );
    export const selectMissingSourceFile = l10n.t('Choose File');
    export const selectMissingSourceFileDescription = l10n.t(
        "The source file's contents may not match the original contents in the trace.",
    );
}

export namespace LanguageService {
    export const virtualWorkspaceStatusItem = {
        detail: l10n.t('Limited IntelliSense supported by Jedi and Pylance'),
    };
    export const statusItem = {
        name: l10n.t('Python IntelliSense Status'),
        text: l10n.t('Partial Mode'),
        detail: l10n.t('Limited IntelliSense provided by Pylance'),
    };
    export const startingPylance = l10n.t('Starting Pylance language server.');
    export const startingNone = l10n.t('Editor support is inactive since language server is set to None.');
    export const untrustedWorkspaceMessage = l10n.t(
        'Only Pylance is supported in untrusted workspaces, setting language server to None.',
    );

    export const reloadAfterLanguageServerChange = l10n.t(
        'Reload the window after switching between language servers.',
    );

    export const lsFailedToStart = l10n.t(
        'We encountered an issue starting the language server. Reverting to Jedi language engine. Check the Python output panel for details.',
    );
    export const lsFailedToDownload = l10n.t(
        'We encountered an issue downloading the language server. Reverting to Jedi language engine. Check the Python output panel for details.',
    );
    export const lsFailedToExtract = l10n.t(
        'We encountered an issue extracting the language server. Reverting to Jedi language engine. Check the Python output panel for details.',
    );
    export const downloadFailedOutputMessage = l10n.t('Language server download failed.');
    export const extractionFailedOutputMessage = l10n.t('Language server extraction failed.');
    export const extractionCompletedOutputMessage = l10n.t('Language server download complete.');
    export const extractionDoneOutputMessage = l10n.t('done.');
    export const reloadVSCodeIfSeachPathHasChanged = l10n.t(
        'Search paths have changed for this Python interpreter. Reload the extension to ensure that the IntelliSense works correctly.',
    );
}
export namespace Interpreters {
    export const requireJupyter = l10n.t(
        'Running in Interactive window requires Jupyter Extension. Would you like to install it? [Learn more](https://aka.ms/pythonJupyterSupport).',
    );
    export const installingPython = l10n.t('Installing Python into Environment...');
    export const discovering = l10n.t('Discovering Python Interpreters');
    export const refreshing = l10n.t('Refreshing Python Interpreters');
    export const condaInheritEnvMessage = l10n.t(
        'We noticed you\'re using a conda environment. If you are experiencing issues with this environment in the integrated terminal, we recommend that you let the Python extension change "terminal.integrated.inheritEnv" to false in your user settings. [Learn more](https://aka.ms/AA66i8f).',
    );
    export const activatingTerminals = l10n.t('Reactivating terminals...');
    export const activateTerminalDescription = l10n.t('Activated environment for');
    export const terminalEnvVarCollectionPrompt = l10n.t(
        '{0} environment was successfully activated, even though {1} indicator may not be present in the terminal prompt. [Learn more](https://aka.ms/vscodePythonTerminalActivation).',
    );
    export const terminalDeactivateProgress = l10n.t('Editing {0}...');
    export const restartingTerminal = l10n.t('Restarting terminal and deactivating...');
    export const terminalDeactivatePrompt = l10n.t(
        'Deactivating virtual environments may not work by default. To make it work, edit your "{0}" and then restart your shell. [Learn more](https://aka.ms/AAmx2ft).',
    );
    export const activatedCondaEnvLaunch = l10n.t(
        'We noticed VS Code was launched from an activated conda environment, would you like to select it?',
    );
    export const environmentPromptMessage = l10n.t(
        'We noticed a new environment has been created. Do you want to select it for the workspace folder?',
    );
    export const entireWorkspace = l10n.t('Select at workspace level');
    export const clearAtWorkspace = l10n.t('Clear at workspace level');
    export const selectInterpreterTip = l10n.t(
        'Tip: you can change the Python interpreter used by the Python extension by clicking on the Python version in the status bar',
    );
    export const installPythonTerminalMessageLinux = l10n.t(
        '💡 Try installing the Python package using your package manager. Alternatively you can also download it from https://www.python.org/downloads',
    );

    export const installPythonTerminalMacMessage = l10n.t(
        '💡 Brew does not seem to be available. You can download Python from https://www.python.org/downloads. Alternatively, you can install the Python package using some other available package manager.',
    );
    export const changePythonInterpreter = l10n.t('Change Python Interpreter');
    export const selectedPythonInterpreter = l10n.t('Selected Python Interpreter');
}

export namespace InterpreterQuickPickList {
    export const condaEnvWithoutPythonTooltip = l10n.t(
        'Python is not available in this environment, it will automatically be installed upon selecting it',
    );
    export const noPythonInstalled = l10n.t('Python is not installed');
    export const clickForInstructions = l10n.t('Click for instructions...');
    export const globalGroupName = l10n.t('Global');
    export const workspaceGroupName = l10n.t('Workspace');
    export const enterPath = {
        label: l10n.t('Enter interpreter path...'),
        placeholder: l10n.t('Enter path to a Python interpreter.'),
    };
    export const defaultInterpreterPath = {
        label: l10n.t('Use Python from `python.defaultInterpreterPath` setting'),
    };
    export const browsePath = {
        label: l10n.t('Find...'),
        detail: l10n.t('Browse your file system to find a Python interpreter.'),
        openButtonLabel: l10n.t('Select Interpreter'),
        title: l10n.t('Select Python interpreter'),
    };
    export const refreshInterpreterList = l10n.t('Refresh Interpreter list');
    export const refreshingInterpreterList = l10n.t('Refreshing Interpreter list...');
    export const create = {
        label: l10n.t('Create Virtual Environment...'),
    };
}

export namespace OutputChannelNames {
    export const languageServer = l10n.t('Python Language Server');
    export const python = l10n.t('Python');
}

export namespace Linters {
    export const selectLinter = l10n.t('Select Linter');
}

export namespace Installer {
    export const noCondaOrPipInstaller = l10n.t(
        'There is no Conda or Pip installer available in the selected environment.',
    );
    export const noPipInstaller = l10n.t('There is no Pip installer available in the selected environment.');
    export const searchForHelp = l10n.t('Search for help');
}

export namespace ExtensionSurveyBanner {
    export const bannerMessage = l10n.t(
        'Can you take 2 minutes to tell us how the Python extension is working for you?',
    );
    export const bannerLabelYes = l10n.t('Yes, take survey now');
    export const bannerLabelNo = l10n.t('No, thanks');
    export const maybeLater = l10n.t('Maybe later');
}
export namespace DebugConfigStrings {
    export const selectConfiguration = {
        title: l10n.t('Select a debug configuration'),
        placeholder: l10n.t('Debug Configuration'),
    };
    export const launchJsonCompletions = {
        label: l10n.t('Python'),
        description: l10n.t('Select a Python debug configuration'),
    };

    export namespace file {
        export const snippet = {
            name: l10n.t('Python: Current File'),
        };

        export const selectConfiguration = {
            label: l10n.t('Python File'),
            description: l10n.t('Debug the currently active Python file'),
        };
    }
    export namespace module {
        export const snippet = {
            name: l10n.t('Python: Module'),
            default: l10n.t('enter-your-module-name'),
        };

        export const selectConfiguration = {
            label: l10n.t('Module'),
            description: l10n.t("Debug a Python module by invoking it with '-m'"),
        };
        export const enterModule = {
            title: l10n.t('Debug Module'),
            prompt: l10n.t('Enter a Python module/package name'),
            default: l10n.t('enter-your-module-name'),
            invalid: l10n.t('Enter a valid module name'),
        };
    }
    export namespace attach {
        export const snippet = {
            name: l10n.t('Python: Remote Attach'),
        };

        export const selectConfiguration = {
            label: l10n.t('Remote Attach'),
            description: l10n.t('Attach to a remote debug server'),
        };
        export const enterRemoteHost = {
            title: l10n.t('Remote Debugging'),
            prompt: l10n.t('Enter a valid host name or IP address'),
            invalid: l10n.t('Enter a valid host name or IP address'),
        };
        export const enterRemotePort = {
            title: l10n.t('Remote Debugging'),
            prompt: l10n.t('Enter the port number that the debug server is listening on'),
            invalid: l10n.t('Enter a valid port number'),
        };
    }
    export namespace attachPid {
        export const snippet = {
            name: l10n.t('Python: Attach using Process Id'),
        };

        export const selectConfiguration = {
            label: l10n.t('Attach using Process ID'),
            description: l10n.t('Attach to a local process'),
        };
    }
    export namespace django {
        export const snippet = {
            name: l10n.t('Python: Django'),
        };

        export const selectConfiguration = {
            label: l10n.t('Django'),
            description: l10n.t('Launch and debug a Django web application'),
        };
        export const enterManagePyPath = {
            title: l10n.t('Debug Django'),
            prompt: l10n.t(
                "Enter the path to manage.py ('${workspaceFolder}' points to the root of the current workspace folder)",
            ),
            invalid: l10n.t('Enter a valid Python file path'),
        };
    }
    export namespace fastapi {
        export const snippet = {
            name: l10n.t('Python: FastAPI'),
        };

        export const selectConfiguration = {
            label: l10n.t('FastAPI'),
            description: l10n.t('Launch and debug a FastAPI web application'),
        };
        export const enterAppPathOrNamePath = {
            title: l10n.t('Debug FastAPI'),
            prompt: l10n.t("Enter the path to the application, e.g. 'main.py' or 'main'"),
            invalid: l10n.t('Enter a valid name'),
        };
    }
    export namespace flask {
        export const snippet = {
            name: l10n.t('Python: Flask'),
        };

        export const selectConfiguration = {
            label: l10n.t('Flask'),
            description: l10n.t('Launch and debug a Flask web application'),
        };
        export const enterAppPathOrNamePath = {
            title: l10n.t('Debug Flask'),
            prompt: l10n.t('Python: Flask'),
            invalid: l10n.t('Enter a valid name'),
        };
    }
    export namespace pyramid {
        export const snippet = {
            name: l10n.t('Python: Pyramid Application'),
        };

        export const selectConfiguration = {
            label: l10n.t('Pyramid'),
            description: l10n.t('Launch and debug a Pyramid web application'),
        };
        export const enterDevelopmentIniPath = {
            title: l10n.t('Debug Pyramid'),
            invalid: l10n.t('Enter a valid file path'),
        };
    }
}

export namespace Testing {
    export const configureTests = l10n.t('Configure Test Framework');
    export const cancelUnittestDiscovery = l10n.t('Canceled unittest test discovery');
    export const errorUnittestDiscovery = l10n.t('Unittest test discovery error');
    export const cancelPytestDiscovery = l10n.t('Canceled pytest test discovery');
    export const errorPytestDiscovery = l10n.t('pytest test discovery error');
    export const seePythonOutput = l10n.t('(see Output > Python)');
    export const cancelUnittestExecution = l10n.t('Canceled unittest test execution');
    export const errorUnittestExecution = l10n.t('Unittest test execution error');
    export const cancelPytestExecution = l10n.t('Canceled pytest test execution');
    export const errorPytestExecution = l10n.t('pytest test execution error');
    export const copilotSetupMessage = l10n.t('Confirm your Python testing framework to enable test discovery.');
}

export namespace OutdatedDebugger {
    export const outdatedDebuggerMessage = l10n.t(
        'We noticed you are attaching to ptvsd (Python debugger), which was deprecated on May 1st, 2020. Use [debugpy](https://aka.ms/migrateToDebugpy) instead.',
    );
}

export namespace Python27Support {
    export const jediMessage = l10n.t(
        'IntelliSense with Jedi for Python 2.7 is no longer supported. [Learn more](https://aka.ms/python-27-support).',
    );
}

export namespace SwitchToDefaultLS {
    export const bannerMessage = l10n.t(
        "The Microsoft Python Language Server has reached end of life. Your language server has been set to the default for Python in VS Code, Pylance.\n\nIf you'd like to change your language server, you can learn about how to do so [here](https://devblogs.microsoft.com/python/python-in-visual-studio-code-may-2021-release/#configuring-your-language-server).\n\nRead Pylance's license [here](https://marketplace.visualstudio.com/items/ms-python.vscode-pylance/license).",
    );
}

export namespace CreateEnv {
    export const informEnvCreation = l10n.t('The following environment is selected:');
    export const statusTitle = l10n.t('Creating environment');
    export const statusStarting = l10n.t('Starting...');

    export const hasVirtualEnv = l10n.t('Workspace folder contains a virtual environment');

    export const noWorkspace = l10n.t('A workspace is required when creating an environment using venv.');

    export const pickWorkspacePlaceholder = l10n.t('Select a workspace to create environment');

    export const providersQuickPickPlaceholder = l10n.t('Select an environment type');

    export namespace Venv {
        export const creating = l10n.t('Creating venv...');
        export const creatingMicrovenv = l10n.t('Creating microvenv...');
        export const created = l10n.t('Environment created...');
        export const existing = l10n.t('Using existing environment...');
        export const downloadingPip = l10n.t('Downloading pip...');
        export const installingPip = l10n.t('Installing pip...');
        export const upgradingPip = l10n.t('Upgrading pip...');
        export const installingPackages = l10n.t('Installing packages...');
        export const errorCreatingEnvironment = l10n.t('Error while creating virtual environment.');
        export const selectPythonPlaceHolder = l10n.t('Select a Python installation to create the virtual environment');
        export const providerDescription = l10n.t('Creates a `.venv` virtual environment in the current workspace');
        export const error = l10n.t('Creating virtual environment failed with error.');
        export const tomlExtrasQuickPickTitle = l10n.t('Select optional dependencies to install from pyproject.toml');
        export const requirementsQuickPickTitle = l10n.t('Select dependencies to install');
        export const recreate = l10n.t('Delete and Recreate');
        export const recreateDescription = l10n.t(
            'Delete existing ".venv" directory and create a new ".venv" environment',
        );
        export const useExisting = l10n.t('Use Existing');
        export const useExistingDescription = l10n.t('Use existing ".venv" environment with no changes to it');
        export const existingVenvQuickPickPlaceholder = l10n.t(
            'Choose an option to handle the existing ".venv" environment',
        );
        export const deletingEnvironmentProgress = l10n.t('Deleting existing ".venv" environment...');
        export const errorDeletingEnvironment = l10n.t('Error while deleting existing ".venv" environment.');
        export const openRequirementsFile = l10n.t('Open requirements file');
    }

    export namespace Conda {
        export const condaMissing = l10n.t('Install `conda` to create conda environments.');
        export const created = l10n.t('Environment created...');
        export const installingPackages = l10n.t('Installing packages...');
        export const errorCreatingEnvironment = l10n.t('Error while creating conda environment.');
        export const selectPythonQuickPickPlaceholder = l10n.t(
            'Select the version of Python to install in the environment',
        );
        export const creating = l10n.t('Creating conda environment...');
        export const providerDescription = l10n.t('Creates a `.conda` Conda environment in the current workspace');

        export const recreate = l10n.t('Delete and Recreate');
        export const recreateDescription = l10n.t('Delete existing ".conda" environment and create a new one');
        export const useExisting = l10n.t('Use Existing');
        export const useExistingDescription = l10n.t('Use existing ".conda" environment with no changes to it');
        export const existingCondaQuickPickPlaceholder = l10n.t(
            'Choose an option to handle the existing ".conda" environment',
        );
        export const deletingEnvironmentProgress = l10n.t('Deleting existing ".conda" environment...');
        export const errorDeletingEnvironment = l10n.t('Error while deleting existing ".conda" environment.');
    }

    export namespace Trigger {
        export const workspaceTriggerMessage = l10n.t(
            'A virtual environment is not currently selected for your Python interpreter. Would you like to create a virtual environment?',
        );
        export const createEnvironment = l10n.t('Create');

        export const globalPipInstallTriggerMessage = l10n.t(
            'You may have installed Python packages into your global environment, which can cause conflicts between package versions. Would you like to create a virtual environment with these packages to isolate your dependencies?',
        );
    }
}

export namespace Console {
    export const consoleExitGeneric = l10n.t('Console exited unexpectedly. View logs for more info.');
}
