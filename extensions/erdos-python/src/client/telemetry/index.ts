/* eslint-disable global-require */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import TelemetryReporter from '@vscode/extension-telemetry';
import type * as vscodeTypes from 'vscode';
import { DiagnosticCodes } from '../application/diagnostics/constants';
import { AppinsightsKey, isTestExecution, isUnitTestExecution, PVSC_EXTENSION_ID } from '../common/constants';
import type { TerminalShellType } from '../common/terminal/types';
import { isPromise } from '../common/utils/async';
import { StopWatch } from '../common/utils/stopWatch';
import { EnvironmentType, PythonEnvironment } from '../pythonEnvironments/info';
import { TensorBoardPromptSelection } from '../tensorBoard/constants';
import { EventName } from './constants';
import type { TestTool } from './types';

/**
 * Checks whether telemetry is supported.
 * Its possible this function gets called within Debug Adapter, vscode isn't available in there.
 * Within DA, there's a completely different way to send telemetry.
 */
function isTelemetrySupported(): boolean {
    try {
        const vsc = require('vscode');
        const reporter = require('@vscode/extension-telemetry');

        return vsc !== undefined && reporter !== undefined;
    } catch {
        return false;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let packageJSON: any;

/**
 * Checks if the telemetry is disabled
 */
export function isTelemetryDisabled(): boolean {
    if (!packageJSON) {
        const vscode = require('vscode') as typeof vscodeTypes;
        const pythonExtension = vscode.extensions.getExtension(PVSC_EXTENSION_ID)!;
        packageJSON = pythonExtension.packageJSON;
    }
    return !packageJSON.enableTelemetry;
}

const sharedProperties: Record<string, unknown> = {};
/**
 * Set shared properties for all telemetry events.
 */
export function setSharedProperty<P extends ISharedPropertyMapping, E extends keyof P>(name: E, value?: P[E]): void {
    const propertyName = name as string;
    // Ignore such shared telemetry during unit tests.
    if (isUnitTestExecution() && propertyName.startsWith('ds_')) {
        return;
    }
    if (value === undefined) {
        delete sharedProperties[propertyName];
    } else {
        sharedProperties[propertyName] = value;
    }
}

/**
 * Reset shared properties for testing purposes.
 */
export function _resetSharedProperties(): void {
    for (const key of Object.keys(sharedProperties)) {
        delete sharedProperties[key];
    }
}

let telemetryReporter: TelemetryReporter | undefined;
export function getTelemetryReporter(): TelemetryReporter {
    if (!isTestExecution() && telemetryReporter) {
        return telemetryReporter;
    }

    const Reporter = require('@vscode/extension-telemetry').default as typeof TelemetryReporter;
    telemetryReporter = new Reporter(AppinsightsKey, [
        {
            lookup: /(errorName|errorMessage|errorStack)/g,
        },
    ]);

    return telemetryReporter;
}

export function clearTelemetryReporter(): void {
    telemetryReporter = undefined;
}

export function sendTelemetryEvent<P extends IEventNamePropertyMapping, E extends keyof P>(
    eventName: E,
    measuresOrDurationMs?: Record<string, number> | number,
    properties?: P[E],
    ex?: Error,
): void {
    if (isTestExecution() || !isTelemetrySupported() || isTelemetryDisabled()) {
        return;
    }
    const reporter = getTelemetryReporter();
    const measures =
        typeof measuresOrDurationMs === 'number'
            ? { duration: measuresOrDurationMs }
            : measuresOrDurationMs || undefined;
    const customProperties: Record<string, string> = {};
    const eventNameSent = eventName as string;

    if (properties) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = properties as any;
        Object.getOwnPropertyNames(data).forEach((prop) => {
            if (data[prop] === undefined || data[prop] === null) {
                return;
            }
            try {
                // If there are any errors in serializing one property, ignore that and move on.
                // Else nothing will be sent.
                switch (typeof data[prop]) {
                    case 'string':
                        customProperties[prop] = data[prop];
                        break;
                    case 'object':
                        customProperties[prop] = 'object';
                        break;
                    default:
                        customProperties[prop] = data[prop].toString();
                        break;
                }
            } catch (exception) {
                console.error(`Failed to serialize ${prop} for ${String(eventName)}`, exception); // use console due to circular dependencies with trace calls
            }
        });
    }

    // Add shared properties to telemetry props (we may overwrite existing ones).
    Object.assign(customProperties, sharedProperties);

    if (ex) {
        const errorProps = {
            errorName: ex.name,
            errorStack: ex.stack ?? '',
        };
        Object.assign(customProperties, errorProps);
        reporter.sendTelemetryErrorEvent(eventNameSent, customProperties, measures);
    } else {
        reporter.sendTelemetryEvent(eventNameSent, customProperties, measures);
    }

    if (process.env && process.env.VSC_PYTHON_LOG_TELEMETRY) {
        console.info(
            `Telemetry Event : ${eventNameSent} Measures: ${JSON.stringify(measures)} Props: ${JSON.stringify(
                customProperties,
            )} `,
        ); // use console due to circular dependencies with trace calls
    }
}

// Type-parameterized form of MethodDecorator in lib.es5.d.ts.
type TypedMethodDescriptor<T> = (
    target: unknown,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
) => TypedPropertyDescriptor<T> | void;

// The following code uses "any" in many places, as TS does not have rich support
// for typing decorators. Specifically, while it is possible to write types which
// encode the signature of the wrapped function, TS fails to actually infer the
// type of "this" and the signature at call sites, instead choosing to infer
// based on other hints (like the closure parameters), which ends up making it
// no safer than "any" (and sometimes misleading enough to be more unsafe).

/**
 * Decorates a method, sending a telemetry event with the given properties.
 * @param eventName The event name to send.
 * @param properties Properties to send with the event; must be valid for the event.
 * @param captureDuration True if the method's execution duration should be captured.
 * @param failureEventName If the decorated method returns a Promise and fails, send this event instead of eventName.
 * @param lazyProperties A static function on the decorated class which returns extra properties to add to the event.
 * This can be used to provide properties which are only known at runtime (after the decorator has executed).
 * @param lazyMeasures A static function on the decorated class which returns extra measures to add to the event.
 * This can be used to provide measures which are only known at runtime (after the decorator has executed).
 */
export function captureTelemetry<This, P extends IEventNamePropertyMapping, E extends keyof P>(
    eventName: E,
    properties?: P[E],
    captureDuration = true,
    failureEventName?: E,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lazyProperties?: (obj: This, result?: any) => P[E],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lazyMeasures?: (obj: This, result?: any) => Record<string, number>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): TypedMethodDescriptor<(this: This, ...args: any[]) => any> {
    return function (
        _target: unknown,
        _propertyKey: string | symbol,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptor: TypedPropertyDescriptor<(this: This, ...args: any[]) => any>,
    ) {
        const originalMethod = descriptor.value!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptor.value = function (this: This, ...args: any[]) {
            // Legacy case; fast path that sends event before method executes.
            // Does not set "failed" if the result is a Promise and throws an exception.
            if (!captureDuration && !lazyProperties && !lazyMeasures) {
                sendTelemetryEvent(eventName, undefined, properties);

                return originalMethod.apply(this, args);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getProps = (result?: any) => {
                if (lazyProperties) {
                    return { ...properties, ...lazyProperties(this, result) };
                }
                return properties;
            };

            const stopWatch = captureDuration ? new StopWatch() : undefined;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getMeasures = (result?: any) => {
                const measures = stopWatch ? { duration: stopWatch.elapsedTime } : undefined;
                if (lazyMeasures) {
                    return { ...measures, ...lazyMeasures(this, result) };
                }
                return measures;
            };

            const result = originalMethod.apply(this, args);

            // If method being wrapped returns a promise then wait for it.
            if (result && isPromise(result)) {
                result
                    .then((data) => {
                        sendTelemetryEvent(eventName, getMeasures(data), getProps(data));
                        return data;
                    })
                    .catch((ex) => {
                        const failedProps: P[E] = { ...getProps(), failed: true } as P[E] & FailedEventType;
                        sendTelemetryEvent(failureEventName || eventName, getMeasures(), failedProps, ex);
                    });
            } else {
                sendTelemetryEvent(eventName, getMeasures(result), getProps(result));
            }

            return result;
        };

        return descriptor;
    };
}

// function sendTelemetryWhenDone<T extends IDSMappings, K extends keyof T>(eventName: K, properties?: T[K]);
export function sendTelemetryWhenDone<P extends IEventNamePropertyMapping, E extends keyof P>(
    eventName: E,
    promise: Promise<unknown> | Thenable<unknown>,
    stopWatch?: StopWatch,
    properties?: P[E],
): void {
    stopWatch = stopWatch || new StopWatch();
    if (typeof promise.then === 'function') {
        (promise as Promise<unknown>).then(
            (data) => {
                sendTelemetryEvent(eventName, stopWatch!.elapsedTime, properties);
                return data;
            },
            (ex) => {
                sendTelemetryEvent(eventName, stopWatch!.elapsedTime, properties, ex);
                return Promise.reject(ex);
            },
        );
    } else {
        throw new Error('Method is neither a Promise nor a Theneable');
    }
}

/**
 * Map all shared properties to their data types.
 */
export interface ISharedPropertyMapping {
    /**
     * For every DS telemetry we would like to know the type of Notebook Editor used when doing something.
     */
    ['ds_notebookeditor']: undefined | 'old' | 'custom' | 'native';

    /**
     * For every telemetry event from the extension we want to make sure we can associate it with install
     * source. We took this approach to work around very limiting query performance issues.
     */
    ['installSource']: undefined | 'marketPlace' | 'pythonCodingPack';
}

type FailedEventType = { failed: true };

// Map all events to their properties
export interface IEventNamePropertyMapping {
    [EventName.DIAGNOSTICS_ACTION]: {
        /**
         * Diagnostics command executed.
         * @type {string}
         */
        commandName?: string;
        /**
         * Diagnostisc code ignored (message will not be seen again).
         * @type {string}
         */
        ignoreCode?: string;
        /**
         * Url of web page launched in browser.
         * @type {string}
         */
        url?: string;
        /**
         * Custom actions performed.
         * @type {'switchToCommandPrompt'}
         */
        action?: 'switchToCommandPrompt';
    };
    /**
     * Telemetry event sent when we are checking if we can handle the diagnostic code
     */
    /* __GDPR__
       "diagnostics.message" : {
          "code" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.DIAGNOSTICS_MESSAGE]: {
        /**
         * Code of diagnostics message detected and displayed.
         * @type {string}
         */
        code: DiagnosticCodes;
    };
    /**
     * Telemetry event sent with details just after editor loads
     */
    /* __GDPR__
       "editor.load" : {
          "appName" : {"classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud"},
          "codeloadingtime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "condaversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "errorname" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "owner": "luabud" },
          "errorstack" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "owner": "luabud" },
          "pythonversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "installsource" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "interpretertype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "terminal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "luabud" },
          "workspacefoldercount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "haspythonthree" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "startactivatetime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "totalactivatetime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "totalnonblockingactivatetime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "usinguserdefinedinterpreter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "usingglobalinterpreter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "isfirstsession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" }
       }
     */
    [EventName.EDITOR_LOAD]: {
        /**
         * The name of the application where the Python extension is running
         */
        appName?: string | undefined;
        /**
         * The conda version if selected
         */
        condaVersion?: string | undefined;
        /**
         * The python interpreter version if selected
         */
        pythonVersion?: string | undefined;
        /**
         * The type of interpreter (conda, virtualenv, pipenv etc.)
         */
        interpreterType?: EnvironmentType | undefined;
        /**
         * The type of terminal shell created: powershell, cmd, zsh, bash etc.
         *
         * @type {TerminalShellType}
         */
        terminal: TerminalShellType;
        /**
         * Number of workspace folders opened
         */
        workspaceFolderCount: number;
        /**
         * If interpreters found for the main workspace contains a python3 interpreter
         */
        hasPythonThree?: boolean;
        /**
         * If user has defined an interpreter in settings.json
         */
        usingUserDefinedInterpreter?: boolean;
        /**
         * If global interpreter is being used
         */
        usingGlobalInterpreter?: boolean;
        /**
         * Carries `true` if it is the very first session of the user. We check whether persistent cache is empty
         * to approximately guess if it's the first session.
         */
        isFirstSession?: boolean;
    };
    /**
     * Telemetry event sent when substituting Environment variables to calculate value of variables
     */
    /* __GDPR__
       "envfile_variable_substitution" : { "owner": "karthiknadig" }
     */
    [EventName.ENVFILE_VARIABLE_SUBSTITUTION]: never | undefined;
    /**
     * Telemetry event sent when an environment file is detected in the workspace.
     */
    /* __GDPR__
       "envfile_workspace" : {
          "hascustomenvpath" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" }
       }
     */

    [EventName.ENVFILE_WORKSPACE]: {
        /**
         * If there's a custom path specified in the python.envFile workspace settings.
         */
        hasCustomEnvPath: boolean;
    };
    /**
     * Telemetry Event sent when user sends code to be executed in the terminal.
     *
     */
    /* __GDPR__
       "execution_code" : {
          "scope" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "trigger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.EXECUTION_CODE]: {
        /**
         * Whether the user executed a file in the terminal or just the selected text or line by shift+enter.
         *
         * @type {('file' | 'selection')}
         */
        scope: 'file' | 'selection' | 'line';
        /**
         * How was the code executed (through the command or by clicking the `Run File` icon).
         *
         * @type {('command' | 'icon')}
         */
        trigger?: 'command' | 'icon';
        /**
         * Whether user chose to execute this Python file in a separate terminal or not.
         *
         * @type {boolean}
         */
        newTerminalPerFile?: boolean;
    };
    /**
     * Telemetry Event sent when user executes code against Django Shell.
     * Values sent:
     * scope
     *
     */
    /* __GDPR__
       "execution_django" : {
          "scope" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.EXECUTION_DJANGO]: {
        /**
         * If `file`, then the file was executed in the django shell.
         * If `selection`, then the selected text was sent to the django shell.
         *
         * @type {('file' | 'selection')}
         */
        scope: 'file' | 'selection';
    };

    /**
     * Telemetry event sent with the value of setting 'Format on type'
     */
    /* __GDPR__
       "format.format_on_type" : {
          "enabled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.FORMAT_ON_TYPE]: {
        /**
         * Carries `true` if format on type is enabled, `false` otherwise
         *
         * @type {boolean}
         */
        enabled: boolean;
    };

    /**
     * Telemetry event sent with details when tracking imports
     */
    /* __GDPR__
       "hashed_package_name" : {
          "hashedname" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" }
       }
     */
    [EventName.HASHED_PACKAGE_NAME]: {
        /**
         * Hash of the package name
         *
         * @type {string}
         */
        hashedName: string;
    };

    /**
     * Telemetry event sent when installing modules
     */
    /* __GDPR__
       "python_install_package" : {
          "installer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "requiredinstaller" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "productname" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "isinstalled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "envtype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INSTALL_PACKAGE]: {
        /**
         * The name of the module. (pipenv, Conda etc.)
         * One of the possible values includes `unavailable`, meaning user doesn't have pip, conda, or other tools available that can be used to install a python package.
         */
        installer: string;
        /**
         * The name of the installer required (expected to be available) for installation of packages. (pipenv, Conda etc.)
         */
        requiredInstaller?: string;
        /**
         * Name of the corresponding product (package) to be installed.
         */
        productName?: string;
        /**
         * Whether the product (package) has been installed or not.
         */
        isInstalled?: boolean;
        /**
         * Type of the Python environment into which the Python package is being installed.
         */
        envType?: PythonEnvironment['envType'];
        /**
         * Version of the Python environment into which the Python package is being installed.
         */
        version?: string;
    };
    /**
     * Telemetry event sent when an environment without contain a python binary is selected.
     */
    /* __GDPR__
       "environment_without_python_selected" : {
           "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_WITHOUT_PYTHON_SELECTED]: never | undefined;
    /**
     * Telemetry event sent when 'Select Interpreter' command is invoked.
     */
    /* __GDPR__
       "select_interpreter" : {
           "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
       }
     */
    [EventName.SELECT_INTERPRETER]: never | undefined;
    /**
     * Telemetry event sent when 'Enter interpreter path' button is clicked.
     */
    /* __GDPR__
       "select_interpreter_enter_button" : { "owner": "karthiknadig" }
     */
    [EventName.SELECT_INTERPRETER_ENTER_BUTTON]: never | undefined;
    /**
     * Telemetry event sent with details about what choice user made to input the interpreter path.
     */
    /* __GDPR__
       "select_interpreter_enter_choice" : {
          "choice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
    */
    [EventName.SELECT_INTERPRETER_ENTER_CHOICE]: {
        /**
         * Carries 'enter' if user chose to enter the path to executable.
         * Carries 'browse' if user chose to browse for the path to the executable.
         */
        choice: 'enter' | 'browse';
    };
    /**
     * Telemetry event sent after an action has been taken while the interpreter quickpick was displayed,
     * and if the action was not 'Enter interpreter path'.
     */
    /* __GDPR__
       "select_interpreter_selected" : {
          "action" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.SELECT_INTERPRETER_SELECTED]: {
        /**
         * 'escape' if the quickpick was dismissed.
         * 'selected' if an interpreter was selected.
         */
        action: 'escape' | 'selected';
    };
    /**
     * Telemetry event sent when the user select to either enter or find the interpreter from the quickpick.
     */
    /* __GDPR__
       "select_interpreter_enter_or_find" : { "owner": "karthiknadig" }
     */

    [EventName.SELECT_INTERPRETER_ENTER_OR_FIND]: never | undefined;
    /**
     * Telemetry event sent after the user entered an interpreter path, or found it by browsing the filesystem.
     */
    /* __GDPR__
       "select_interpreter_entered_exists" : {
          "discovered" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.SELECT_INTERPRETER_ENTERED_EXISTS]: {
        /**
         * Carries `true` if the interpreter that was selected had already been discovered earlier (exists in the cache).
         */
        discovered: boolean;
    };

    /**
     * Telemetry event sent when another extension calls into python extension's environment API. Contains details
     * of the other extension.
     */
    /* __GDPR__
       "python_environments_api" : {
          "extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": false , "owner": "karthiknadig"},
          "apiName" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": false, "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_ENVIRONMENTS_API]: {
        /**
         * The ID of the extension calling the API.
         */
        extensionId: string;
        /**
         * The name of the API called.
         */
        apiName: string;
    };
    /**
     * Telemetry event sent with details after updating the python interpreter
     */
    /* __GDPR__
       "python_interpreter" : {
          "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "trigger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "pythonversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INTERPRETER]: {
        /**
         * Carries the source which triggered the update
         *
         * @type {('ui' | 'shebang' | 'load')}
         */
        trigger: 'ui' | 'shebang' | 'load';
        /**
         * Carries `true` if updating python interpreter failed
         *
         * @type {boolean}
         */
        failed: boolean;
        /**
         * The python version of the interpreter
         *
         * @type {string}
         */
        pythonVersion?: string;
    };
    /* __GDPR__
       "python_interpreter.activation_environment_variables" : {
          "hasenvvars" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INTERPRETER_ACTIVATION_ENVIRONMENT_VARIABLES]: {
        /**
         * Carries `true` if environment variables are present, `false` otherwise
         *
         * @type {boolean}
         */
        hasEnvVars?: boolean;
        /**
         * Carries `true` if fetching environment variables failed, `false` otherwise
         *
         * @type {boolean}
         */
        failed?: boolean;
    };
    /**
     * Telemetry event sent when getting activation commands for active interpreter
     */
    /* __GDPR__
       "python_interpreter_activation_for_running_code" : {
          "hascommands" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "terminal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "pythonversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "interpretertype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INTERPRETER_ACTIVATION_FOR_RUNNING_CODE]: {
        /**
         * Carries `true` if activation commands exists for interpreter, `false` otherwise
         *
         * @type {boolean}
         */
        hasCommands?: boolean;
        /**
         * Carries `true` if fetching activation commands for interpreter failed, `false` otherwise
         *
         * @type {boolean}
         */
        failed?: boolean;
        /**
         * The type of terminal shell to activate
         *
         * @type {TerminalShellType}
         */
        terminal: TerminalShellType;
        /**
         * The Python interpreter version of the active interpreter for the resource
         *
         * @type {string}
         */
        pythonVersion?: string;
        /**
         * The type of the interpreter used
         *
         * @type {EnvironmentType}
         */
        interpreterType: EnvironmentType;
    };
    /**
     * Telemetry event sent when getting activation commands for terminal when interpreter is not specified
     */
    /* __GDPR__
       "python_interpreter_activation_for_terminal" : {
          "hascommands" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "terminal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "pythonversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
          "interpretertype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INTERPRETER_ACTIVATION_FOR_TERMINAL]: {
        /**
         * Carries `true` if activation commands exists for terminal, `false` otherwise
         *
         * @type {boolean}
         */
        hasCommands?: boolean;
        /**
         * Carries `true` if fetching activation commands for terminal failed, `false` otherwise
         *
         * @type {boolean}
         */
        failed?: boolean;
        /**
         * The type of terminal shell to activate
         *
         * @type {TerminalShellType}
         */
        terminal: TerminalShellType;
        /**
         * The Python interpreter version of the interpreter for the resource
         *
         * @type {string}
         */
        pythonVersion?: string;
        /**
         * The type of the interpreter used
         *
         * @type {EnvironmentType}
         */
        interpreterType: EnvironmentType;
    };
    /**
     * Telemetry event sent when auto-selection is called.
     */
    /* __GDPR__
       "python_interpreter_auto_selection" : {
          "usecachedinterpreter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */

    [EventName.PYTHON_INTERPRETER_AUTO_SELECTION]: {
        /**
         * If auto-selection has been run earlier in this session, and this call returned a cached value.
         *
         * @type {boolean}
         */
        useCachedInterpreter?: boolean;
    };
    /**
     * Telemetry event sent when discovery of all python environments (virtualenv, conda, pipenv etc.) finishes.
     */
    /* __GDPR__
       "python_interpreter_discovery" : {
        "telVer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "workspaceFolderCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "condaInfoEnvsInvalid" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "condaInfoEnvsDuplicate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "condaInfoEnvsInvalidPrefix" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "interpreters" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "envsWithDuplicatePrefixes" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "envsNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaInfoEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaInfoEnvsDirs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "nativeCondaInfoEnvsDirs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaRcs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "nativeCondaRcs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaEnvsInEnvDir" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaEnvsInTxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "nativeCondaEnvsInEnvDir" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "invalidCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "prefixNotExistsCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "condaEnvsWithoutPrefix" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true , "owner": "donjayamanne"},
        "environmentsWithoutPython" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "usingNativeLocator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "canSpawnConda" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "nativeCanSpawnConda" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne"},
        "userProvidedEnvFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundInInfoNotInNative" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundAsAnotherKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundAsPrefixOfAnother" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundAsPrefixOfAnother" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundInTxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundInTxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundInInfoAfterFind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundInInfoAfterFindKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixFoundAsAnotherKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixInCondaExePath" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundInInfoNotInNative" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundInInfoAfterFind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixFoundInInfoAfterFindKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaDefaultPrefixInCondaExePath" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "userProvidedCondaExe" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaRootPrefixEnvsAfterFind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "condaDefaultPrefixEnvsAfterFind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "activeStateEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "condaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "customEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "hatchEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "microsoftStoreEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "otherGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "otherVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "pipEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "poetryEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "pyenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "systemEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "unknownEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "venvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "virtualEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "virtualEnvWrapperEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "global" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeEnvironmentsWithoutPython" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCustomEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeMicrosoftStoreEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeOtherGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeOtherVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativePipEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativePoetryEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativePyenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeSystemEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeUnknownEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeVenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeVirtualEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeVirtualEnvWrapperEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeGlobal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeCustomEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeMicrosoftStoreEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeOtherVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativePipEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativePoetryEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativePyenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeSystemEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeUnknownEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeVenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeVirtualEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeVirtualEnvWrapperEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingNativeOtherGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaRcsNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvDirsNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvDirsNotFoundHasEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvDirsNotFoundHasEnvsInTxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvTxtSame" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "nativeCondaEnvsFromTxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "nativeCondaEnvTxtExists" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" }
       }
     */
    [EventName.PYTHON_INTERPRETER_DISCOVERY]: {
        /**
         * Version of this telemetry.
         */
        telVer?: number;
        /**
         * Number of invalid envs returned by `conda info`
         */
        condaInfoEnvsInvalid?: number;
        /**
         * Number of conda envs found in the environments.txt file.
         */
        condaEnvsInTxt?: number;
        /**
         * Number of duplicate envs returned by `conda info`
         */
        condaInfoEnvsDuplicate?: number;
        /**
         * Number of envs with invalid prefix returned by `conda info`
         */
        condaInfoEnvsInvalidPrefix?: number;
        /**
         * Number of workspaces.
         */
        workspaceFolderCount?: number;
        /**
         * Time taken to discover using native locator.
         */
        nativeDuration?: number;
        /**
         * The number of the interpreters discovered
         */
        interpreters?: number;
        /**
         * The number of the interpreters with duplicate prefixes
         */
        envsWithDuplicatePrefixes?: number;
        /**
         * The number of the interpreters returned by `conda info`
         */
        condaInfoEnvs?: number;
        /**
         * The number of the envs_dirs returned by `conda info`
         */
        condaInfoEnvsDirs?: number;
        /**
         * The number of the envs_dirs returned by native locator.
         */
        nativeCondaInfoEnvsDirs?: number;
        /**
         * The number of the conda rc files found using conda info
         */
        condaRcs?: number;
        /**
         * The number of the conda rc files found using native locator.
         */
        nativeCondaRcs?: number;
        /**
         * The number of the conda rc files returned by `conda info` that weren't found by native locator.
         */
        nativeCondaRcsNotFound?: number;
        /**
         * The number of the conda env_dirs returned by `conda info` that weren't found by native locator.
         */
        nativeCondaEnvDirsNotFound?: number;
        /**
         * The number of envs in the env_dirs contained in the count for `nativeCondaEnvDirsNotFound`
         */
        nativeCondaEnvDirsNotFoundHasEnvs?: number;
        /**
         * The number of envs from environments.txt that are in the env_dirs contained in the count for `nativeCondaEnvDirsNotFound`
         */
        nativeCondaEnvDirsNotFoundHasEnvsInTxt?: number;
        /**
         * The number of conda interpreters that are in the one of the global conda env locations.
         * Global conda envs locations are returned by `conda info` in the `envs_dirs` setting.
         */
        condaEnvsInEnvDir?: number;
        /**
         * The number of native conda interpreters that are in the one of the global conda env locations.
         * Global conda envs locations are returned by `conda info` in the `envs_dirs` setting.
         */
        nativeCondaEnvsInEnvDir?: number;
        condaRootPrefixEnvsAfterFind?: number;
        condaDefaultPrefixEnvsAfterFind?: number;
        /**
         * A conda env found that matches the root_prefix returned by `conda info`
         * However a corresponding conda env not found by native locator.
         */
        condaDefaultPrefixFoundInInfoAfterFind?: boolean;
        condaRootPrefixFoundInTxt?: boolean;
        condaDefaultPrefixFoundInTxt?: boolean;
        condaDefaultPrefixFoundInInfoAfterFindKind?: string;
        condaRootPrefixFoundAsAnotherKind?: string;
        condaRootPrefixFoundAsPrefixOfAnother?: string;
        condaDefaultPrefixFoundAsAnotherKind?: string;
        condaDefaultPrefixFoundAsPrefixOfAnother?: string;
        /**
         * Whether we were able to identify the conda root prefix in the conda exe path as a conda env using `find` in native finder API.
         */
        condaRootPrefixFoundInInfoAfterFind?: boolean;
        /**
         * Type of python env detected for the conda root prefix.
         */
        condaRootPrefixFoundInInfoAfterFindKind?: string;
        /**
         * The conda root prefix is found in the conda exe path.
         */
        condaRootPrefixInCondaExePath?: boolean;
        /**
         * A conda env found that matches the root_prefix returned by `conda info`
         * However a corresponding conda env not found by native locator.
         */
        condaDefaultPrefixFoundInInfoNotInNative?: boolean;
        /**
         * The conda root prefix is found in the conda exe path.
         */
        condaDefaultPrefixInCondaExePath?: boolean;
        /**
         * User provided a path to the conda exe
         */
        userProvidedCondaExe?: boolean;
        /**
         * The number of conda interpreters without the `conda-meta` directory.
         */
        invalidCondaEnvs?: number;
        /**
         * The number of conda interpreters that have prefix that doesn't exist on disc.
         */
        prefixNotExistsCondaEnvs?: number;
        /**
         * The number of conda interpreters without the prefix.
         */
        condaEnvsWithoutPrefix?: number;
        /**
         * Conda exe can be spawned.
         */
        canSpawnConda?: boolean;
        /**
         * Conda exe can be spawned by native locator.
         */
        nativeCanSpawnConda?: boolean;
        /**
         * Conda env belonging to the conda exe provided by the user is found by native locator.
         * I.e. even if the user didn't provide the path to the conda exe, the conda env is found by native locator.
         */
        userProvidedEnvFound?: boolean;
        /**
         * The number of the interpreters not found in disc.
         */
        envsNotFount?: number;
        /**
         * Whether or not we're using the native locator.
         */
        usingNativeLocator?: boolean;
        /**
         * The number of environments discovered not containing an interpreter
         */
        environmentsWithoutPython?: number;
        /**
         * Number of environments of a specific type
         */
        activeStateEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        condaEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        customEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        hatchEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        microsoftStoreEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        otherGlobalEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        otherVirtualEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        pipEnvEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        poetryEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        pyenvEnvs?: number;
        uvEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        systemEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        unknownEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        venvEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        virtualEnvEnvs?: number;
        /**
         * Number of environments of a specific type
         */
        virtualEnvWrapperEnvs?: number;
        /**
         * Number of all known Globals (System, Custom, GlobalCustom, etc)
         */
        global?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeEnvironmentsWithoutPython?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeCondaEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeCustomEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeMicrosoftStoreEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeOtherGlobalEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeOtherVirtualEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativePipEnvEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativePoetryEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativePyenvEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeSystemEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeUnknownEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeVenvEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeVirtualEnvEnvs?: number;
        /**
         * Number of environments of a specific type found by native finder
         */
        nativeVirtualEnvWrapperEnvs?: number;
        /**
         * Number of all known Globals (System, Custom, GlobalCustom, etc)
         */
        nativeGlobal?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeCondaEnvs?: number;
        /**
         * Whether the env txt found by native locator is the same as that found by pythonn ext.
         */
        nativeCondaEnvTxtSame?: boolean;
        /**
         * Number of environments found from env txt by native locator.
         */
        nativeCondaEnvsFromTxt?: number;
        /**
         * Whether the env txt found by native locator exists.
         */
        nativeCondaEnvTxtExists?: boolean;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeCustomEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeMicrosoftStoreEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeGlobalEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeOtherVirtualEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativePipEnvEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativePoetryEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativePyenvEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeSystemEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeUnknownEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeVenvEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeVirtualEnvEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeVirtualEnvWrapperEnvs?: number;
        /**
         * Number of environments of a specific type missing in Native Locator (compared to the Stable Locator).
         */
        missingNativeOtherGlobalEnvs?: number;
    };
    /**
     * Telemetry event sent when Native finder fails to find some conda envs.
     */
    /* __GDPR__
       "native_finder_missing_conda_envs" : {
        "missing" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "envDirsNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "userProvidedCondaExe" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "rootPrefixNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaPrefixNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "condaManagerNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "missingEnvDirsFromSysRc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingEnvDirsFromUserRc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingEnvDirsFromOtherRc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingFromSysRcEnvDirs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingFromUserRcEnvDirs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingFromOtherRcEnvDirs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" }
       }
     */
    [EventName.NATIVE_FINDER_MISSING_CONDA_ENVS]: {
        /**
         * Number of missing conda environments.
         */
        missing: number;
        /**
         * Total number of env_dirs not found even after parsing the conda_rc files.
         * This will tell us that we are either unable to parse some of the conda_rc files or there are other
         * env_dirs that we are not able to find.
         */
        envDirsNotFound?: number;
        /**
         * Whether a conda exe was provided by the user.
         */
        userProvidedCondaExe?: boolean;
        /**
         * Whether the user provided a conda executable.
         */
        rootPrefixNotFound?: boolean;
        /**
         * Whether the conda prefix returned by conda was not found by us.
         */
        condaPrefixNotFound?: boolean;
        /**
         * Whether we found a conda manager or not.
         */
        condaManagerNotFound?: boolean;
        /**
         * Whether we failed to find the system rc path.
         */
        sysRcNotFound?: boolean;
        /**
         * Whether we failed to find the user rc path.
         */
        userRcNotFound?: boolean;
        /**
         * Number of config files (excluding sys and user rc) that were not found.
         */
        otherRcNotFound?: boolean;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the sys config rc.
         */
        missingEnvDirsFromSysRc?: number;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the user config rc.
         */
        missingEnvDirsFromUserRc?: number;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the other config rc.
         */
        missingEnvDirsFromOtherRc?: number;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the sys config rc.
         */
        missingFromSysRcEnvDirs?: number;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the user config rc.
         */
        missingFromUserRcEnvDirs?: number;
        /**
         * Number of conda envs that were not found by us, and the envs belong to env_dirs in the other config rc.
         */
        missingFromOtherRcEnvDirs?: number;
    };
    /**
     * Telemetry event sent when Native finder fails to find some conda envs.
     */
    /* __GDPR__
       "native_finder_missing_poetry_envs" : {
        "missing" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "missingInPath" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "userProvidedPoetryExe" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "poetryExeNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "globalConfigNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "cacheDirNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "cacheDirIsDifferent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "virtualenvsPathNotFound" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "virtualenvsPathIsDifferent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
        "inProjectIsDifferent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" }
       }
     */
    [EventName.NATIVE_FINDER_MISSING_POETRY_ENVS]: {
        /**
         * Number of missing poetry environments.
         */
        missing: number;
        /**
         * Total number of missing envs, where the envs are created in the virtualenvs_path directory.
         */
        missingInPath: number;
        /**
         * Whether a poetry exe was provided by the user.
         */
        userProvidedPoetryExe?: boolean;
        /**
         * Whether poetry exe was not found.
         */
        poetryExeNotFound?: boolean;
        /**
         * Whether poetry config was not found.
         */
        globalConfigNotFound?: boolean;
        /**
         * Whether cache_dir was not found.
         */
        cacheDirNotFound?: boolean;
        /**
         * Whether cache_dir found was different from that returned by poetry exe.
         */
        cacheDirIsDifferent?: boolean;
        /**
         * Whether virtualenvs.path was not found.
         */
        virtualenvsPathNotFound?: boolean;
        /**
         * Whether virtualenvs.path found was different from that returned by poetry exe.
         */
        virtualenvsPathIsDifferent?: boolean;
        /**
         * Whether virtualenvs.in-project found was different from that returned by poetry exe.
         */
        inProjectIsDifferent?: boolean;
    };
    /**
     * Telemetry containing performance metrics for Native Finder.
     */
    /* __GDPR__
       "native_finder_perf" : {
        "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "totalDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "breakdownLocators" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "breakdownPath" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "breakdownGlobalVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "breakdownWorkspaces" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorConda" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorHomebrew" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorLinuxGlobalPython" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorMacCmdLineTools" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorMacPythonOrg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorMacXCode" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorPipEnv" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorPoetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorPixi" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorPyEnv" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorVenv" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorVirtualEnv" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorVirtualEnvWrapper" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorWindowsRegistry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "locatorWindowsStore" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "timeToSpawn" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "timeToConfigure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
        "timeToRefresh" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" }
       }
     */
    [EventName.NATIVE_FINDER_PERF]: {
        /**
         * Total duration to find envs using native locator.
         * This is the time from the perspective of the Native Locator.
         * I.e. starting from the time the request to refresh was received until the end of the refresh.
         */
        totalDuration: number;
        /**
         * Time taken by all locators to find the environments.
         * I.e. time for Conda + Poetry + Pyenv, etc (note: all of them run in parallel).
         */
        breakdownLocators?: number;
        /**
         * Time taken to find Python environments in the paths found in the PATH env variable.
         */
        breakdownPath?: number;
        /**
         * Time taken to find Python environments in the global virtual env locations.
         */
        breakdownGlobalVirtualEnvs?: number;
        /**
         * Time taken to find Python environments in the workspaces.
         */
        breakdownWorkspaces?: number;
        /**
         * Time taken to find all global Conda environments.
         */
        locatorConda?: number;
        /**
         * Time taken to find all Homebrew environments.
         */
        locatorHomebrew?: number;
        /**
         * Time taken to find all global Python environments on Linux.
         */
        locatorLinuxGlobalPython?: number;
        /**
         * Time taken to find all Python environments belonging to Mac Command Line Tools .
         */
        locatorMacCmdLineTools?: number;
        /**
         * Time taken to find all Python environments belonging to Mac Python Org.
         */
        locatorMacPythonOrg?: number;
        /**
         * Time taken to find all Python environments belonging to Mac XCode.
         */
        locatorMacXCode?: number;
        /**
         * Time taken to find all Pipenv environments.
         */
        locatorPipEnv?: number;
        /**
         * Time taken to find all Pixi environments.
         */
        locatorPixi?: number;
        /**
         * Time taken to find all Poetry environments.
         */
        locatorPoetry?: number;
        /**
         * Time taken to find all Pyenv environments.
         */
        locatorPyEnv?: number;
        /**
         * Time taken to find all Venv environments.
         */
        locatorVenv?: number;
        /**
         * Time taken to find all VirtualEnv environments.
         */
        locatorVirtualEnv?: number;
        /**
         * Time taken to find all VirtualEnvWrapper environments.
         */
        locatorVirtualEnvWrapper?: number;
        /**
         * Time taken to find all Windows Registry environments.
         */
        locatorWindowsRegistry?: number;
        /**
         * Time taken to find all Windows Store environments.
         */
        locatorWindowsStore?: number;
        /**
         * Total time taken to spawn the Native Python finder process.
         */
        timeToSpawn?: number;
        /**
         * Total time taken to configure the Native Python finder process.
         */
        timeToConfigure?: number;
        /**
         * Total time taken to refresh the Environments (from perspective of Python extension).
         * Time = total time taken to process the `refresh` request.
         */
        timeToRefresh?: number;
    };
    /**
     * Telemetry event sent when discovery of all python environments using the native locator(virtualenv, conda, pipenv etc.) finishes.
     */
    /* __GDPR__
       "python_interpreter_discovery_invalid_native" : {
            "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsCustomEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsMicrosoftStoreEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsOtherVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsPipEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsPoetryEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsPyenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsSystemEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsUnknownEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsVenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsVirtualEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsVirtualEnvWrapperEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidVersionsOtherGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixCondaEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixCustomEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixMicrosoftStoreEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixOtherVirtualEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixPipEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixPoetryEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixPyenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixSystemEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixUnknownEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixVenvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixVirtualEnvEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixVirtualEnvWrapperEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
            "invalidSysPrefixOtherGlobalEnvs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" }
       }
     */
    [EventName.PYTHON_INTERPRETER_DISCOVERY_INVALID_NATIVE]: {
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsCondaEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsCustomEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsMicrosoftStoreEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsGlobalEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsOtherVirtualEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsPipEnvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsPoetryEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsPyenvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsSystemEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsUnknownEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsVenvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsVirtualEnvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsVirtualEnvWrapperEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid version from Native Locator.
         */
        invalidVersionsOtherGlobalEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixCondaEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixCustomEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixMicrosoftStoreEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixGlobalEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixOtherVirtualEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixPipEnvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixPoetryEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixPyenvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixSystemEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixUnknownEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixVenvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixVirtualEnvEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixVirtualEnvWrapperEnvs?: number;
        /**
         * Number of Python envs of a particular type that have invalid sys prefix from Native Locator.
         */
        invalidSysPrefixOtherGlobalEnvs?: number;
    };
    /**
     * Telemetry event sent with details when user clicks the prompt with the following message:
     *
     * 'We noticed you're using a conda environment. If you are experiencing issues with this environment in the integrated terminal, we suggest the "terminal.integrated.inheritEnv" setting to be changed to false. Would you like to update this setting?'
     */
    /* __GDPR__
       "conda_inherit_env_prompt" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.CONDA_INHERIT_ENV_PROMPT]: {
        /**
         * `Yes` When 'Allow' option is selected
         * `Close` When 'Close' option is selected
         */
        selection: 'Allow' | 'Close' | undefined;
    };

    /**
     * Telemetry event sent with details when user attempts to run in interactive window when Jupyter is not installed.
     */
    /* __GDPR__
       "require_jupyter_prompt" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.REQUIRE_JUPYTER_PROMPT]: {
        /**
         * `Yes` When 'Yes' option is selected
         * `No` When 'No' option is selected
         * `undefined` When 'x' is selected
         */
        selection: 'Yes' | 'No' | undefined;
    };
    /**
     * Telemetry event sent with details when user clicks the prompt with the following message:
     *
     * 'We noticed VS Code was launched from an activated conda environment, would you like to select it?'
     */
    /* __GDPR__
       "activated_conda_env_launch" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.ACTIVATED_CONDA_ENV_LAUNCH]: {
        /**
         * `Yes` When 'Yes' option is selected
         * `No` When 'No' option is selected
         */
        selection: 'Yes' | 'No' | undefined;
    };
    /**
     * Telemetry event sent with details when user clicks a button in the virtual environment prompt.
     * `Prompt message` :- 'We noticed a new virtual environment has been created. Do you want to select it for the workspace folder?'
     */
    /* __GDPR__
       "python_interpreter_activate_environment_prompt" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_INTERPRETER_ACTIVATE_ENVIRONMENT_PROMPT]: {
        /**
         * `Yes` When 'Yes' option is selected
         * `No` When 'No' option is selected
         * `Ignore` When "Don't show again" option is clicked
         *
         * @type {('Yes' | 'No' | 'Ignore' | undefined)}
         */
        selection: 'Yes' | 'No' | 'Ignore' | undefined;
    };
    /**
     * Telemetry event sent with details when the user clicks a button in the "Python is not installed" prompt.
     * * `Prompt message` :- 'Python is not installed. Please download and install Python before using the extension.'
     */
    /* __GDPR__
       "python_not_installed_prompt" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.PYTHON_NOT_INSTALLED_PROMPT]: {
        /**
         * `Download` When the 'Download' option is clicked
         * `Ignore` When the prompt is dismissed
         *
         * @type {('Download' | 'Ignore' | undefined)}
         */
        selection: 'Download' | 'Ignore' | undefined;
    };
    /**
     * Telemetry event sent when the experiments service is initialized for the first time.
     */
    /* __GDPR__
       "python_experiments_init_performance" : {
          "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" }
       }
     */
    [EventName.PYTHON_EXPERIMENTS_INIT_PERFORMANCE]: unknown;
    /**
     * Telemetry event sent when the user use the report issue command.
     */
    /* __GDPR__
      "use_report_issue_command" : { "owner": "paulacamargo25" }
     */
    [EventName.USE_REPORT_ISSUE_COMMAND]: unknown;
    /**
     * Telemetry event sent when the New Python File command is executed.
     */
    /* __GDPR__
      "create_new_file_command" : { "owner": "luabud" }
     */
    [EventName.CREATE_NEW_FILE_COMMAND]: unknown;
    /**
     * Telemetry event sent when the installed versions of Python, Jupyter, and Pylance are all capable
     * of supporting the LSP notebooks experiment. This does not indicate that the experiment is enabled.
     */

    /* __GDPR__
      "python_experiments_lsp_notebooks" : { "owner": "luabud" }
     */
    [EventName.PYTHON_EXPERIMENTS_LSP_NOTEBOOKS]: unknown;
    /**
     * Telemetry event sent once on session start with details on which experiments are opted into and opted out from.
     */
    /* __GDPR__
       "python_experiments_opt_in_opt_out_settings" : {
          "optedinto" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" },
          "optedoutfrom" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "luabud" }
       }
     */
    [EventName.PYTHON_EXPERIMENTS_OPT_IN_OPT_OUT_SETTINGS]: {
        /**
         * List of valid experiments in the python.experiments.optInto setting
         * @type {string}
         */
        optedInto: string;
        /**
         * List of valid experiments in the python.experiments.optOutFrom setting
         * @type {string}
         */
        optedOutFrom: string;
    };
    /**
     * Telemetry event sent when LS is started for workspace (workspace folder in case of multi-root)
     */
    /* __GDPR__
       "language_server_enabled" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_ENABLED]: {
        lsVersion?: string;
    };
    /**
     * Telemetry event sent when Node.js server is ready to start
     */
    /* __GDPR__
       "language_server_ready" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_READY]: {
        lsVersion?: string;
    };
    /**
     * Track how long it takes to trigger language server activation code, after Python extension starts activating.
     */
    /* __GDPR__
       "language_server_trigger_time" : {
          "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "karthiknadig" },
          "triggerTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_TRIGGER_TIME]: {
        /**
         * Time it took to trigger language server startup.
         */
        triggerTime: number;
    };
    /**
     * Telemetry event sent when starting Node.js server
     */
    /* __GDPR__
       "language_server_startup" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_STARTUP]: {
        lsVersion?: string;
    };
    /**
     * Telemetry sent from Node.js server (details of telemetry sent can be provided by LS team)
     */
    /* __GDPR__
       "language_server_telemetry" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_TELEMETRY]: unknown;
    /**
     * Telemetry sent when the client makes a request to the Node.js server
     *
     * This event also has a measure, "resultLength", which records the number of completions provided.
     */
    /* __GDPR__
       "language_server_request" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_REQUEST]: unknown;
    /**
     * Telemetry send when Language Server is restarted.
     */
    /* __GDPR__
       "language_server_restart" : {
          "reason" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.LANGUAGE_SERVER_RESTART]: {
        reason: 'command' | 'settings' | 'notebooksExperiment';
    };
    /**
     * Telemetry event sent when Jedi Language Server is started for workspace (workspace folder in case of multi-root)
     */
    /* __GDPR__
       "jedi_language_server.enabled" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.JEDI_LANGUAGE_SERVER_ENABLED]: {
        lsVersion?: string;
    };
    /**
     * Telemetry event sent when Jedi Language Server server is ready to receive messages
     */
    /* __GDPR__
       "jedi_language_server.ready" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.JEDI_LANGUAGE_SERVER_READY]: {
        lsVersion?: string;
    };
    /**
     * Telemetry event sent when starting Node.js server
     */
    /* __GDPR__
       "jedi_language_server.startup" : {
          "lsversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.JEDI_LANGUAGE_SERVER_STARTUP]: {
        lsVersion?: string;
    };
    /**
     * Telemetry sent when the client makes a request to the Node.js server
     *
     * This event also has a measure, "resultLength", which records the number of completions provided.
     */
    /* __GDPR__
       "jedi_language_server.request" : {
           "method": {"classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig"}
       }
     */
    [EventName.JEDI_LANGUAGE_SERVER_REQUEST]: unknown;
    /**
     * When user clicks a button in the python extension survey prompt, this telemetry event is sent with details
     */
    /* __GDPR__
       "extension_survey_prompt" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.EXTENSION_SURVEY_PROMPT]: {
        /**
         * Carries the selection of user when they are asked to take the extension survey
         */
        selection: 'Yes' | 'Maybe later' | "Don't show again" | undefined;
    };
    /**
     * Telemetry event sent when starting REPL
     */
    /* __GDPR__
       "repl" : {
           "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "anthonykim1" },
           "repltype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "anthonykim1" }
       }
     */
    [EventName.REPL]: {
        /**
         * Whether the user launched the Terminal REPL or Native REPL
         *
         * Terminal - Terminal REPL user ran `Python: Start Terminal REPL` command.
         * Native - Native REPL user ran `Python: Start Native Python REPL` command.
         * manualTerminal - User started REPL in terminal using `python`, `python3` or `py` etc without arguments in terminal.
         * runningScript - User ran a script in terminal like `python myscript.py`.
         */
        replType: 'Terminal' | 'Native' | 'manualTerminal' | `runningScript`;
    };
    /**
     * Telemetry event sent when invoking a Tool
     */
    /* __GDPR__
       "invokeTool" : {
           "duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "owner": "donjayamanne" },
           "toolName" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
            "failed": {"classification":"SystemMetaData","purpose":"FeatureInsight","comment":"Whether there was a failure. Common to most of the events.", "owner": "donjayamanne" },
            "failureCategory": {"classification":"SystemMetaData","purpose":"FeatureInsight","comment":"A reason that we generate (e.g. kerneldied, noipykernel, etc), more like a category of the error. Common to most of the events.", "owner": "donjayamanne" }
       }
     */
    [EventName.INVOKE_TOOL]: {
        /**
         * Tool name.
         */
        toolName: string;
        /**
         * Whether there was a failure.
         * Common to most of the events.
         */
        failed: boolean;
        /**
         * A reason the error was thrown.
         */
        failureCategory?: string;
    };
    /**
     * Telemetry event sent if and when user configure tests command. This command can be trigerred from multiple places in the extension. (Command palette, prompt etc.)
     */
    /* __GDPR__
       "unittest.configure" : { "owner": "eleanorjboyd" }
     */
    [EventName.UNITTEST_CONFIGURE]: never | undefined;
    /**
     * Telemetry event sent when user chooses a test framework in the Quickpick displayed for enabling and configuring test framework
     */
    /* __GDPR__
       "unittest.configuring" : {
          "tool" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" },
          "trigger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" },
          "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "eleanorjboyd" }
       }
     */
    [EventName.UNITTEST_CONFIGURING]: {
        /**
         * Name of the test framework to configure
         */
        tool?: TestTool;
        /**
         * Carries the source which triggered configuration of tests
         *
         * @type {('ui' | 'commandpalette')}
         */
        trigger: 'ui' | 'commandpalette';
        /**
         * Carries `true` if configuring test framework failed, `false` otherwise
         *
         * @type {boolean}
         */
        failed: boolean;
    };
    /**
     * Telemetry event sent when the extension is activated, if an active terminal is present and
     * the `python.terminal.activateEnvInCurrentTerminal` setting is set to `true`.
     */
    /* __GDPR__
       "activate_env_in_current_terminal" : {
          "isterminalvisible" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.ACTIVATE_ENV_IN_CURRENT_TERMINAL]: {
        /**
         * Carries boolean `true` if an active terminal is present (terminal is visible), `false` otherwise
         */
        isTerminalVisible?: boolean;
    };
    /**
     * Telemetry event sent with details when a terminal is created
     */
    /* __GDPR__
       "terminal.create" : {
         "terminal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "triggeredby" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "pythonversion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "interpretertype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
       }
     */
    [EventName.TERMINAL_CREATE]: {
        /**
         * The type of terminal shell created: powershell, cmd, zsh, bash etc.
         *
         * @type {TerminalShellType}
         */
        terminal?: TerminalShellType;
        /**
         * The source which triggered creation of terminal
         *
         * @type {'commandpalette'}
         */
        triggeredBy?: 'commandpalette';
        /**
         * The default Python interpreter version to be used in terminal, inferred from resource's 'settings.json'
         *
         * @type {string}
         */
        pythonVersion?: string;
        /**
         * The Python interpreter type: Conda, Virtualenv, Venv, Pipenv etc.
         *
         * @type {EnvironmentType}
         */
        interpreterType?: EnvironmentType;
    };
    /**
     * Telemetry event sent indicating the trigger source for discovery.
     */
    /* __GDPR__
       "unittest.discovery.trigger" : {
          "trigger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" }
       }
     */
    [EventName.UNITTEST_DISCOVERY_TRIGGER]: {
        /**
         * Carries the source which triggered discovering of tests
         *
         * @type {('auto' | 'ui' | 'commandpalette' | 'watching' | 'interpreter')}
         * auto           : Triggered by VS Code editor.
         * ui             : Triggered by clicking a button.
         * commandpalette : Triggered by running the command from the command palette.
         * watching       : Triggered by filesystem or content changes.
         * interpreter    : Triggered by interpreter change.
         */
        trigger: 'auto' | 'ui' | 'commandpalette' | 'watching' | 'interpreter';
    };
    /**
     * Telemetry event sent with details about discovering tests
     */
    /* __GDPR__
       "unittest.discovering" : {
          "tool" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" }
       }
     */
    [EventName.UNITTEST_DISCOVERING]: {
        /**
         * The test framework used to discover tests
         *
         * @type {TestTool}
         */
        tool: TestTool;
    };
    /**
     * Telemetry event sent with details about discovering tests
     */
    /* __GDPR__
       "unittest.discovery.done" : {
          "tool" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" },
          "failed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" }
       }
     */
    [EventName.UNITTEST_DISCOVERY_DONE]: {
        /**
         * The test framework used to discover tests
         *
         * @type {TestTool}
         */
        tool: TestTool;
        /**
         * Carries `true` if discovering tests failed, `false` otherwise
         *
         * @type {boolean}
         */
        failed: boolean;
    };
    /**
     * Telemetry event sent when cancelling discovering tests
     */
    /* __GDPR__
       "unittest.discovery.stop" : { "owner": "eleanorjboyd" }
     */
    [EventName.UNITTEST_DISCOVERING_STOP]: never | undefined;
    /**
     * Telemetry event sent with details about running the tests, what is being run, what framework is being used etc.
     */
    /* __GDPR__
       "unittest.run" : {
          "tool" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" },
          "debugging" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "eleanorjboyd" }
       }
     */
    [EventName.UNITTEST_RUN]: {
        /**
         * Framework being used to run tests
         */
        tool: TestTool;
        /**
         * Carries `true` if debugging, `false` otherwise
         */
        debugging: boolean;
    };
    /**
     * Telemetry event sent when cancelling running tests
     */
    /* __GDPR__
       "unittest.run.stop" : { "owner": "eleanorjboyd" }
     */
    [EventName.UNITTEST_RUN_STOP]: never | undefined;
    /**
     * Telemetry event sent when run all failed test command is triggered
     */
    /* __GDPR__
       "unittest.run.all_failed" : { "owner": "eleanorjboyd" }
     */
    [EventName.UNITTEST_RUN_ALL_FAILED]: never | undefined;
    /**
     * Telemetry event sent when testing is disabled for a workspace.
     */
    /* __GDPR__
       "unittest.disabled" : { "owner": "eleanorjboyd" }
     */
    [EventName.UNITTEST_DISABLED]: never | undefined;
    /*
    Telemetry event sent to provide information on whether we have successfully identify the type of shell used.
    This information is useful in determining how well we identify shells on users machines.
    This impacts executing code in terminals and activation of environments in terminal.
    So, the better this works, the better it is for the user.
    failed - If true, indicates we have failed to identify the shell. Note this impacts impacts ability to activate environments in the terminal & code.
    shellIdentificationSource - How was the shell identified. One of 'terminalName' | 'settings' | 'environment' | 'default'
                                If terminalName, then this means we identified the type of the shell based on the name of the terminal.
                                If settings, then this means we identified the type of the shell based on user settings in VS Code.
                                If environment, then this means we identified the type of the shell based on their environment (env variables, etc).
                                    I.e. their default OS Shell.
                                If default, then we reverted to OS defaults (cmd on windows, and bash on the rest).
                                    This is the worst case scenario.
                                    I.e. we could not identify the shell at all.
    terminalProvided - If true, we used the terminal provided to detec the shell. If not provided, we use the default shell on user machine.
    hasCustomShell - If undefined (not set), we didn't check.
                     If true, user has customzied their shell in VSC Settings.
    hasShellInEnv - If undefined (not set), we didn't check.
                    If true, user has a shell in their environment.
                    If false, user does not have a shell in their environment.
    */
    /* __GDPR__
      "terminal_shell_identification" : {
         "failed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
         "terminalprovided" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "shellidentificationsource" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "hascustomshell" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" },
         "hasshellinenv" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "karthiknadig" }
      }
    */
    [EventName.TERMINAL_SHELL_IDENTIFICATION]: {
        failed: boolean;
        terminalProvided: boolean;
        shellIdentificationSource: 'terminalName' | 'settings' | 'environment' | 'default' | 'vscode';
        hasCustomShell: undefined | boolean;
        hasShellInEnv: undefined | boolean;
    };
    /**
     * Telemetry event sent when getting environment variables for an activated environment has failed.
     *
     * @type {(undefined | never)}
     * @memberof IEventNamePropertyMapping
     */
    /* __GDPR__
       "activate_env_to_get_env_vars_failed" : {
          "ispossiblycondaenv" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "terminal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ACTIVATE_ENV_TO_GET_ENV_VARS_FAILED]: {
        /**
         * Whether the activation commands contain the name `conda`.
         *
         * @type {boolean}
         */
        isPossiblyCondaEnv: boolean;
        /**
         * The type of terminal shell created: powershell, cmd, zsh, bash etc.
         *
         * @type {TerminalShellType}
         */
        terminal: TerminalShellType;
    };

    // TensorBoard integration events
    /**
     * Telemetry event sent when the user is prompted to install Python packages that are
     * dependencies for launching an integrated TensorBoard session.
     */
    /* __GDPR__
       "tensorboard.session_duration" : { "owner": "donjayamanne" }
     */
    [EventName.TENSORBOARD_INSTALL_PROMPT_SHOWN]: never | undefined;
    /**
     * Telemetry event sent after the user has clicked on an option in the prompt we display
     * asking them if they want to install Python packages for launching an integrated TensorBoard session.
     * `selection` is one of 'yes' or 'no'.
     */
    /* __GDPR__
       "tensorboard.install_prompt_selection" : {
          "selection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" },
          "operationtype" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "owner": "donjayamanne" }
       }
     */
    [EventName.TENSORBOARD_INSTALL_PROMPT_SELECTION]: {
        selection: TensorBoardPromptSelection;
        operationType: 'install' | 'upgrade';
    };
    /**
     * Telemetry event sent when we find an active integrated terminal running tensorboard.
     */
    /* __GDPR__
       "tensorboard_detected_in_integrated_terminal" : { "owner": "donjayamanne" }
     */
    [EventName.TENSORBOARD_DETECTED_IN_INTEGRATED_TERMINAL]: never | undefined;
    /**
     * Telemetry event sent after attempting to install TensorBoard session dependencies.
     * Note, this is only sent if install was attempted. It is not sent if the user opted
     * not to install, or if all dependencies were already installed.
     */
    /* __GDPR__
       "tensorboard.package_install_result" : {
          "wasprofilerpluginattempted" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "donjayamanne" },
          "wastensorboardattempted" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "donjayamanne" },
          "wasprofilerplugininstalled" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "donjayamanne" },
          "wastensorboardinstalled" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "donjayamanne" }
       }
     */

    [EventName.TENSORBOARD_PACKAGE_INSTALL_RESULT]: {
        wasProfilerPluginAttempted: boolean;
        wasTensorBoardAttempted: boolean;
        wasProfilerPluginInstalled: boolean;
        wasTensorBoardInstalled: boolean;
    };
    /**
     * Telemetry event sent when the user's files contain a PyTorch profiler module
     * import. Files are checked for matching imports when they are opened or saved.
     * Matches cover import statements of the form `import torch.profiler` and
     * `from torch import profiler`.
     */
    /* __GDPR__
       "tensorboard.torch_profiler_import" : { "owner": "donjayamanne" }
     */
    [EventName.TENSORBOARD_TORCH_PROFILER_IMPORT]: never | undefined;
    [EventName.TENSORBOARD_DETECTED_IN_INTEGRATED_TERMINAL]: never | undefined;
    /**
     * Telemetry event sent before creating an environment.
     */
    /* __GDPR__
       "environment.creating" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "pythonVersion" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_CREATING]: {
        environmentType: 'venv' | 'conda' | 'microvenv' | undefined;
        pythonVersion: string | undefined;
    };
    /**
     * Telemetry event sent after creating an environment, but before attempting package installation.
     */
    /* __GDPR__
       "environment.created" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "reason" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
        }
     */
    [EventName.ENVIRONMENT_CREATED]: {
        environmentType: 'venv' | 'conda' | 'microvenv';
        reason: 'created' | 'existing';
    };
    /**
     * Telemetry event sent if creating an environment failed.
     */
    /* __GDPR__
       "environment.failed" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "reason" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_FAILED]: {
        environmentType: 'venv' | 'conda' | 'microvenv';
        reason: 'noVenv' | 'noPip' | 'noDistUtils' | 'other';
    };
    /**
     * Telemetry event sent before installing packages.
     */
    /* __GDPR__
       "environment.installing_packages" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "using" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_INSTALLING_PACKAGES]: {
        environmentType: 'venv' | 'conda' | 'microvenv';
        using: 'requirements.txt' | 'pyproject.toml' | 'environment.yml' | 'pipUpgrade' | 'pipInstall' | 'pipDownload';
    };
    /**
     * Telemetry event sent after installing packages.
     */
    /* __GDPR__
       "environment.installed_packages" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "using" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_INSTALLED_PACKAGES]: {
        environmentType: 'venv' | 'conda';
        using: 'requirements.txt' | 'pyproject.toml' | 'environment.yml' | 'pipUpgrade';
    };
    /**
     * Telemetry event sent if installing packages failed.
     */
    /* __GDPR__
       "environment.installing_packages_failed" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "using" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED]: {
        environmentType: 'venv' | 'conda' | 'microvenv';
        using: 'pipUpgrade' | 'requirements.txt' | 'pyproject.toml' | 'environment.yml' | 'pipDownload' | 'pipInstall';
    };
    /**
     * Telemetry event sent if create environment button was used to trigger the command.
     */
    /* __GDPR__
       "environment.button" : {"owner": "karthiknadig" }
     */
    [EventName.ENVIRONMENT_BUTTON]: never | undefined;
    /**
     * Telemetry event if user selected to delete the existing environment.
     */
    /* __GDPR__
       "environment.delete" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" },
          "status" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_DELETE]: {
        environmentType: 'venv' | 'conda';
        status: 'triggered' | 'deleted' | 'failed';
    };
    /**
     * Telemetry event if user selected to re-use the existing environment.
     */
    /* __GDPR__
       "environment.reuse" : {
          "environmentType" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_REUSE]: {
        environmentType: 'venv' | 'conda';
    };
    /**
     * Telemetry event sent when a check for environment creation conditions is triggered.
     */
    /* __GDPR__
       "environment.check.trigger" : {
          "trigger" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_CHECK_TRIGGER]: {
        trigger:
            | 'run-in-terminal'
            | 'debug-in-terminal'
            | 'run-selection'
            | 'on-workspace-load'
            | 'as-command'
            | 'debug';
    };
    /**
     * Telemetry event sent when a check for environment creation condition is computed.
     */
    /* __GDPR__
       "environment.check.result" : {
          "result" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "owner": "karthiknadig" }
       }
     */
    [EventName.ENVIRONMENT_CHECK_RESULT]: {
        result: 'criteria-met' | 'criteria-not-met' | 'already-ran' | 'turned-off' | 'no-uri';
    };
    /**
     * Telemetry event sent when `pip install` was called from a global env in a shell where shell inegration is supported.
     */
    /* __GDPR__
       "environment.terminal.global_pip" : { "owner": "karthiknadig" }
     */
    [EventName.ENVIRONMENT_TERMINAL_GLOBAL_PIP]: never | undefined;
    /* __GDPR__
            "query-expfeature" : {
                "owner": "luabud",
                "comment": "Logs queries to the experiment service by feature for metric calculations",
                "ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The experimental feature being queried" }
            }
    */
    /* __GDPR__
            "call-tas-error" : {
                "owner": "luabud",
                "comment": "Logs when calls to the experiment service fails",
                "errortype": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Type of error when calling TAS (ServerError, NoResponse, etc.)"}
            }
    */
}
