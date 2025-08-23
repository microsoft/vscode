// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

export enum DiagnosticCodes {
    InvalidEnvironmentPathVariableDiagnostic = 'InvalidEnvironmentPathVariableDiagnostic',
    InvalidDebuggerTypeDiagnostic = 'InvalidDebuggerTypeDiagnostic',
    NoPythonInterpretersDiagnostic = 'NoPythonInterpretersDiagnostic',
    MacInterpreterSelected = 'MacInterpreterSelected',
    InvalidPythonPathInDebuggerSettingsDiagnostic = 'InvalidPythonPathInDebuggerSettingsDiagnostic',
    InvalidPythonPathInDebuggerLaunchDiagnostic = 'InvalidPythonPathInDebuggerLaunchDiagnostic',
    EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic = 'EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic',
    InvalidPythonInterpreterDiagnostic = 'InvalidPythonInterpreterDiagnostic',
    InvalidComspecDiagnostic = 'InvalidComspecDiagnostic',
    IncompletePathVarDiagnostic = 'IncompletePathVarDiagnostic',
    DefaultShellErrorDiagnostic = 'DefaultShellErrorDiagnostic',
    LSNotSupportedDiagnostic = 'LSNotSupportedDiagnostic',
    PythonPathDeprecatedDiagnostic = 'PythonPathDeprecatedDiagnostic',
    JustMyCodeDiagnostic = 'JustMyCodeDiagnostic',
    ConsoleTypeDiagnostic = 'ConsoleTypeDiagnostic',
    ConfigPythonPathDiagnostic = 'ConfigPythonPathDiagnostic',
    PylanceDefaultDiagnostic = 'PylanceDefaultDiagnostic',
    JediPython27NotSupportedDiagnostic = 'JediPython27NotSupportedDiagnostic',
    SwitchToDefaultLanguageServerDiagnostic = 'SwitchToDefaultLanguageServerDiagnostic',
    SwitchToPreReleaseExtensionDiagnostic = 'SwitchToPreReleaseExtensionDiagnostic',
}
