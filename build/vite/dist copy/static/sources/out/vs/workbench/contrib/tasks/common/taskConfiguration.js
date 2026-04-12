/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import * as Types from '../../../../base/common/types.js';
import * as UUID from '../../../../base/common/uuid.js';
import { ProblemMatcherParser, isNamedProblemMatcher, ProblemMatcherRegistry } from './problemMatcher.js';
import * as Tasks from './tasks.js';
import { TaskDefinitionRegistry } from './taskDefinitionRegistry.js';
import { ShellExecutionSupportedContext, ProcessExecutionSupportedContext } from './taskService.js';
export var ShellQuoting;
(function (ShellQuoting) {
    /**
     * Default is character escaping.
     */
    ShellQuoting[ShellQuoting["escape"] = 1] = "escape";
    /**
     * Default is strong quoting
     */
    ShellQuoting[ShellQuoting["strong"] = 2] = "strong";
    /**
     * Default is weak quoting.
     */
    ShellQuoting[ShellQuoting["weak"] = 3] = "weak";
})(ShellQuoting || (ShellQuoting = {}));
export var ITaskIdentifier;
(function (ITaskIdentifier) {
    function is(value) {
        const candidate = value;
        return candidate !== undefined && Types.isString(value.type);
    }
    ITaskIdentifier.is = is;
})(ITaskIdentifier || (ITaskIdentifier = {}));
export var CommandString;
(function (CommandString) {
    function value(value) {
        if (Types.isString(value)) {
            return value;
        }
        else if (Types.isStringArray(value)) {
            return value.join(' ');
        }
        else {
            if (Types.isString(value.value)) {
                return value.value;
            }
            else {
                return value.value.join(' ');
            }
        }
    }
    CommandString.value = value;
})(CommandString || (CommandString = {}));
var ProblemMatcherKind;
(function (ProblemMatcherKind) {
    ProblemMatcherKind[ProblemMatcherKind["Unknown"] = 0] = "Unknown";
    ProblemMatcherKind[ProblemMatcherKind["String"] = 1] = "String";
    ProblemMatcherKind[ProblemMatcherKind["ProblemMatcher"] = 2] = "ProblemMatcher";
    ProblemMatcherKind[ProblemMatcherKind["Array"] = 3] = "Array";
})(ProblemMatcherKind || (ProblemMatcherKind = {}));
const EMPTY_ARRAY = [];
Object.freeze(EMPTY_ARRAY);
function assignProperty(target, source, key) {
    const sourceAtKey = source[key];
    if (sourceAtKey !== undefined) {
        target[key] = sourceAtKey;
    }
}
function fillProperty(target, source, key) {
    const sourceAtKey = source[key];
    if (target[key] === undefined && sourceAtKey !== undefined) {
        target[key] = sourceAtKey;
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
function _isEmpty(value, properties, allowEmptyArray = false) {
    if (value === undefined || value === null || properties === undefined) {
        return true;
    }
    for (const meta of properties) {
        const property = value[meta.property];
        if (property !== undefined && property !== null) {
            if (meta.type !== undefined && !meta.type.isEmpty(property)) {
                return false;
            }
            else if (!Array.isArray(property) || (property.length > 0) || allowEmptyArray) {
                return false;
            }
        }
    }
    return true;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
function _assignProperties(target, source, properties) {
    if (!source || _isEmpty(source, properties)) {
        return target;
    }
    if (!target || _isEmpty(target, properties)) {
        return source;
    }
    for (const meta of properties) {
        const property = meta.property;
        let value;
        if (meta.type !== undefined) {
            value = meta.type.assignProperties(target[property], source[property]);
        }
        else {
            value = source[property];
        }
        if (value !== undefined && value !== null) {
            target[property] = value;
        }
    }
    return target;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
function _fillProperties(target, source, properties, allowEmptyArray = false) {
    if (!source || _isEmpty(source, properties)) {
        return target;
    }
    if (!target || _isEmpty(target, properties, allowEmptyArray)) {
        return source;
    }
    for (const meta of properties) {
        const property = meta.property;
        let value;
        if (meta.type) {
            value = meta.type.fillProperties(target[property], source[property]);
        }
        else if (target[property] === undefined) {
            value = source[property];
        }
        if (value !== undefined && value !== null) {
            target[property] = value;
        }
    }
    return target;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
function _fillDefaults(target, defaults, properties, context) {
    if (target && Object.isFrozen(target)) {
        return target;
    }
    if (target === undefined || target === null || defaults === undefined || defaults === null) {
        if (defaults !== undefined && defaults !== null) {
            return Objects.deepClone(defaults);
        }
        else {
            return undefined;
        }
    }
    for (const meta of properties) {
        const property = meta.property;
        if (target[property] !== undefined) {
            continue;
        }
        let value;
        if (meta.type) {
            value = meta.type.fillDefaults(target[property], context);
        }
        else {
            value = defaults[property];
        }
        if (value !== undefined && value !== null) {
            target[property] = value;
        }
    }
    return target;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
function _freeze(target, properties) {
    if (target === undefined || target === null) {
        return undefined;
    }
    if (Object.isFrozen(target)) {
        return target;
    }
    for (const meta of properties) {
        if (meta.type) {
            const value = target[meta.property];
            if (value) {
                meta.type.freeze(value);
            }
        }
    }
    Object.freeze(target);
    return target;
}
export var RunOnOptions;
(function (RunOnOptions) {
    function fromString(value) {
        if (!value) {
            return Tasks.RunOnOptions.default;
        }
        switch (value.toLowerCase()) {
            case 'folderopen':
                return Tasks.RunOnOptions.folderOpen;
            case 'worktreecreated':
                return Tasks.RunOnOptions.worktreeCreated;
            case 'default':
            default:
                return Tasks.RunOnOptions.default;
        }
    }
    RunOnOptions.fromString = fromString;
})(RunOnOptions || (RunOnOptions = {}));
export var RunOptions;
(function (RunOptions) {
    const properties = [{ property: 'reevaluateOnRerun' }, { property: 'runOn' }, { property: 'instanceLimit' }, { property: 'instancePolicy' }];
    function fromConfiguration(value) {
        return {
            reevaluateOnRerun: value ? value.reevaluateOnRerun : true,
            runOn: value ? RunOnOptions.fromString(value.runOn) : Tasks.RunOnOptions.default,
            instanceLimit: value?.instanceLimit ? Math.max(value.instanceLimit, 1) : 1,
            instancePolicy: value ? InstancePolicy.fromString(value.instancePolicy) : "prompt" /* Tasks.InstancePolicy.prompt */
        };
    }
    RunOptions.fromConfiguration = fromConfiguration;
    function assignProperties(target, source) {
        return _assignProperties(target, source, properties);
    }
    RunOptions.assignProperties = assignProperties;
    function fillProperties(target, source) {
        return _fillProperties(target, source, properties);
    }
    RunOptions.fillProperties = fillProperties;
})(RunOptions || (RunOptions = {}));
export var InstancePolicy;
(function (InstancePolicy) {
    function fromString(value) {
        if (!value) {
            return "prompt" /* Tasks.InstancePolicy.prompt */;
        }
        switch (value.toLowerCase()) {
            case 'terminatenewest':
                return "terminateNewest" /* Tasks.InstancePolicy.terminateNewest */;
            case 'terminateoldest':
                return "terminateOldest" /* Tasks.InstancePolicy.terminateOldest */;
            case 'warn':
                return "warn" /* Tasks.InstancePolicy.warn */;
            case 'silent':
                return "silent" /* Tasks.InstancePolicy.silent */;
            case 'prompt':
            default:
                return "prompt" /* Tasks.InstancePolicy.prompt */;
        }
    }
    InstancePolicy.fromString = fromString;
})(InstancePolicy || (InstancePolicy = {}));
var ShellConfiguration;
(function (ShellConfiguration) {
    const properties = [{ property: 'executable' }, { property: 'args' }, { property: 'quoting' }];
    function is(value) {
        const candidate = value;
        return candidate && (Types.isString(candidate.executable) || Types.isStringArray(candidate.args));
    }
    ShellConfiguration.is = is;
    function from(config, context) {
        if (!is(config)) {
            return undefined;
        }
        const result = {};
        if (config.executable !== undefined) {
            result.executable = config.executable;
        }
        if (config.args !== undefined) {
            result.args = config.args.slice();
        }
        if (config.quoting !== undefined) {
            result.quoting = Objects.deepClone(config.quoting);
        }
        return result;
    }
    ShellConfiguration.from = from;
    function isEmpty(value) {
        return _isEmpty(value, properties, true);
    }
    ShellConfiguration.isEmpty = isEmpty;
    function assignProperties(target, source) {
        return _assignProperties(target, source, properties);
    }
    ShellConfiguration.assignProperties = assignProperties;
    function fillProperties(target, source) {
        return _fillProperties(target, source, properties, true);
    }
    ShellConfiguration.fillProperties = fillProperties;
    function fillDefaults(value, context) {
        return value;
    }
    ShellConfiguration.fillDefaults = fillDefaults;
    function freeze(value) {
        if (!value) {
            return undefined;
        }
        return Object.freeze(value);
    }
    ShellConfiguration.freeze = freeze;
})(ShellConfiguration || (ShellConfiguration = {}));
var CommandOptions;
(function (CommandOptions) {
    const properties = [{ property: 'cwd' }, { property: 'env' }, { property: 'shell', type: ShellConfiguration }];
    const defaults = { cwd: '${workspaceFolder}' };
    function from(options, context) {
        const result = {};
        if (options.cwd !== undefined) {
            if (Types.isString(options.cwd)) {
                result.cwd = options.cwd;
            }
            else {
                context.taskLoadIssues.push(nls.localize('ConfigurationParser.invalidCWD', 'Warning: options.cwd must be of type string. Ignoring value {0}\n', options.cwd));
            }
        }
        if (options.env !== undefined) {
            result.env = Objects.deepClone(options.env);
        }
        result.shell = ShellConfiguration.from(options.shell, context);
        return isEmpty(result) ? undefined : result;
    }
    CommandOptions.from = from;
    function isEmpty(value) {
        return _isEmpty(value, properties);
    }
    CommandOptions.isEmpty = isEmpty;
    function assignProperties(target, source) {
        if ((source === undefined) || isEmpty(source)) {
            return target;
        }
        if ((target === undefined) || isEmpty(target)) {
            return source;
        }
        assignProperty(target, source, 'cwd');
        if (target.env === undefined) {
            target.env = source.env;
        }
        else if (source.env !== undefined) {
            const env = Object.create(null);
            if (target.env !== undefined) {
                Object.keys(target.env).forEach(key => env[key] = target.env[key]);
            }
            if (source.env !== undefined) {
                Object.keys(source.env).forEach(key => env[key] = source.env[key]);
            }
            target.env = env;
        }
        target.shell = ShellConfiguration.assignProperties(target.shell, source.shell);
        return target;
    }
    CommandOptions.assignProperties = assignProperties;
    function fillProperties(target, source) {
        return _fillProperties(target, source, properties);
    }
    CommandOptions.fillProperties = fillProperties;
    function fillDefaults(value, context) {
        return _fillDefaults(value, defaults, properties, context);
    }
    CommandOptions.fillDefaults = fillDefaults;
    function freeze(value) {
        return _freeze(value, properties);
    }
    CommandOptions.freeze = freeze;
})(CommandOptions || (CommandOptions = {}));
var CommandConfiguration;
(function (CommandConfiguration) {
    let PresentationOptions;
    (function (PresentationOptions) {
        const properties = [{ property: 'echo' }, { property: 'reveal' }, { property: 'revealProblems' }, { property: 'focus' }, { property: 'panel' }, { property: 'showReuseMessage' }, { property: 'clear' }, { property: 'group' }, { property: 'close' }, { property: 'preserveTerminalName' }];
        function from(config, context) {
            let echo;
            let reveal;
            let revealProblems;
            let focus;
            let panel;
            let showReuseMessage;
            let clear;
            let group;
            let close;
            let preserveTerminalName;
            let hasProps = false;
            if (Types.isBoolean(config.echoCommand)) {
                echo = config.echoCommand;
                hasProps = true;
            }
            if (Types.isString(config.showOutput)) {
                reveal = Tasks.RevealKind.fromString(config.showOutput);
                hasProps = true;
            }
            const presentation = config.presentation || config.terminal;
            if (presentation) {
                if (Types.isBoolean(presentation.echo)) {
                    echo = presentation.echo;
                }
                if (Types.isString(presentation.reveal)) {
                    reveal = Tasks.RevealKind.fromString(presentation.reveal);
                }
                if (Types.isString(presentation.revealProblems)) {
                    revealProblems = Tasks.RevealProblemKind.fromString(presentation.revealProblems);
                }
                if (Types.isBoolean(presentation.focus)) {
                    focus = presentation.focus;
                }
                if (Types.isString(presentation.panel)) {
                    panel = Tasks.PanelKind.fromString(presentation.panel);
                }
                if (Types.isBoolean(presentation.showReuseMessage)) {
                    showReuseMessage = presentation.showReuseMessage;
                }
                if (Types.isBoolean(presentation.clear)) {
                    clear = presentation.clear;
                }
                if (Types.isString(presentation.group)) {
                    group = presentation.group;
                }
                if (Types.isBoolean(presentation.close)) {
                    close = presentation.close;
                }
                if (Types.isBoolean(presentation.preserveTerminalName)) {
                    preserveTerminalName = presentation.preserveTerminalName;
                }
                hasProps = true;
            }
            if (!hasProps) {
                return undefined;
            }
            return { echo: echo, reveal: reveal, revealProblems: revealProblems, focus: focus, panel: panel, showReuseMessage: showReuseMessage, clear: clear, group, close: close, preserveTerminalName };
        }
        PresentationOptions.from = from;
        function assignProperties(target, source) {
            return _assignProperties(target, source, properties);
        }
        PresentationOptions.assignProperties = assignProperties;
        function fillProperties(target, source) {
            return _fillProperties(target, source, properties);
        }
        PresentationOptions.fillProperties = fillProperties;
        function fillDefaults(value, context) {
            const defaultEcho = context.engine === Tasks.ExecutionEngine.Terminal ? true : false;
            return _fillDefaults(value, { echo: defaultEcho, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, preserveTerminalName: false }, properties, context);
        }
        PresentationOptions.fillDefaults = fillDefaults;
        function freeze(value) {
            return _freeze(value, properties);
        }
        PresentationOptions.freeze = freeze;
        function isEmpty(value) {
            return _isEmpty(value, properties);
        }
        PresentationOptions.isEmpty = isEmpty;
    })(PresentationOptions = CommandConfiguration.PresentationOptions || (CommandConfiguration.PresentationOptions = {}));
    let ShellString;
    (function (ShellString) {
        function from(value) {
            if (value === undefined || value === null) {
                return undefined;
            }
            if (Types.isString(value)) {
                return value;
            }
            else if (Types.isStringArray(value)) {
                return value.join(' ');
            }
            else {
                const quoting = Tasks.ShellQuoting.from(value.quoting);
                const result = Types.isString(value.value) ? value.value : Types.isStringArray(value.value) ? value.value.join(' ') : undefined;
                if (result) {
                    return {
                        value: result,
                        quoting: quoting
                    };
                }
                else {
                    return undefined;
                }
            }
        }
        ShellString.from = from;
    })(ShellString || (ShellString = {}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
    const properties = [
        { property: 'runtime' }, { property: 'name' }, { property: 'options', type: CommandOptions },
        { property: 'args' }, { property: 'taskSelector' }, { property: 'suppressTaskName' },
        { property: 'presentation', type: PresentationOptions }
    ];
    function from(config, context) {
        let result = fromBase(config, context);
        let osConfig = undefined;
        if (config.windows && context.platform === 3 /* Platform.Windows */) {
            osConfig = fromBase(config.windows, context);
        }
        else if (config.osx && context.platform === 1 /* Platform.Mac */) {
            osConfig = fromBase(config.osx, context);
        }
        else if (config.linux && context.platform === 2 /* Platform.Linux */) {
            osConfig = fromBase(config.linux, context);
        }
        if (osConfig) {
            result = assignProperties(result, osConfig, context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */);
        }
        return isEmpty(result) ? undefined : result;
    }
    CommandConfiguration.from = from;
    function fromBase(config, context) {
        const name = ShellString.from(config.command);
        let runtime;
        if (Types.isString(config.type)) {
            if (config.type === 'shell' || config.type === 'process') {
                runtime = Tasks.RuntimeType.fromString(config.type);
            }
        }
        if (Types.isBoolean(config.isShellCommand) || ShellConfiguration.is(config.isShellCommand)) {
            runtime = Tasks.RuntimeType.Shell;
        }
        else if (config.isShellCommand !== undefined) {
            runtime = !!config.isShellCommand ? Tasks.RuntimeType.Shell : Tasks.RuntimeType.Process;
        }
        const result = {
            name: name,
            runtime: runtime,
            presentation: PresentationOptions.from(config, context)
        };
        if (config.args !== undefined) {
            result.args = [];
            for (const arg of config.args) {
                const converted = ShellString.from(arg);
                if (converted !== undefined) {
                    result.args.push(converted);
                }
                else {
                    context.taskLoadIssues.push(nls.localize('ConfigurationParser.inValidArg', 'Error: command argument must either be a string or a quoted string. Provided value is:\n{0}', arg ? JSON.stringify(arg, undefined, 4) : 'undefined'));
                }
            }
        }
        if (config.options !== undefined) {
            result.options = CommandOptions.from(config.options, context);
            if (result.options && result.options.shell === undefined && ShellConfiguration.is(config.isShellCommand)) {
                result.options.shell = ShellConfiguration.from(config.isShellCommand, context);
                if (context.engine !== Tasks.ExecutionEngine.Terminal) {
                    context.taskLoadIssues.push(nls.localize('ConfigurationParser.noShell', 'Warning: shell configuration is only supported when executing tasks in the terminal.'));
                }
            }
        }
        if (Types.isString(config.taskSelector)) {
            result.taskSelector = config.taskSelector;
        }
        if (Types.isBoolean(config.suppressTaskName)) {
            result.suppressTaskName = config.suppressTaskName;
        }
        return isEmpty(result) ? undefined : result;
    }
    function hasCommand(value) {
        return value && !!value.name;
    }
    CommandConfiguration.hasCommand = hasCommand;
    function isEmpty(value) {
        return _isEmpty(value, properties);
    }
    CommandConfiguration.isEmpty = isEmpty;
    function assignProperties(target, source, overwriteArgs) {
        if (isEmpty(source)) {
            return target;
        }
        if (isEmpty(target)) {
            return source;
        }
        assignProperty(target, source, 'name');
        assignProperty(target, source, 'runtime');
        assignProperty(target, source, 'taskSelector');
        assignProperty(target, source, 'suppressTaskName');
        if (source.args !== undefined) {
            if (target.args === undefined || overwriteArgs) {
                target.args = source.args;
            }
            else {
                target.args = target.args.concat(source.args);
            }
        }
        target.presentation = PresentationOptions.assignProperties(target.presentation, source.presentation);
        target.options = CommandOptions.assignProperties(target.options, source.options);
        return target;
    }
    CommandConfiguration.assignProperties = assignProperties;
    function fillProperties(target, source) {
        return _fillProperties(target, source, properties);
    }
    CommandConfiguration.fillProperties = fillProperties;
    function fillGlobals(target, source, taskName) {
        if ((source === undefined) || isEmpty(source)) {
            return target;
        }
        target = target || {
            name: undefined,
            runtime: undefined,
            presentation: undefined
        };
        if (target.name === undefined) {
            fillProperty(target, source, 'name');
            fillProperty(target, source, 'taskSelector');
            fillProperty(target, source, 'suppressTaskName');
            let args = source.args ? source.args.slice() : [];
            if (!target.suppressTaskName && taskName) {
                if (target.taskSelector !== undefined) {
                    args.push(target.taskSelector + taskName);
                }
                else {
                    args.push(taskName);
                }
            }
            if (target.args) {
                args = args.concat(target.args);
            }
            target.args = args;
        }
        fillProperty(target, source, 'runtime');
        target.presentation = PresentationOptions.fillProperties(target.presentation, source.presentation);
        target.options = CommandOptions.fillProperties(target.options, source.options);
        return target;
    }
    CommandConfiguration.fillGlobals = fillGlobals;
    function fillDefaults(value, context) {
        if (!value || Object.isFrozen(value)) {
            return;
        }
        if (value.name !== undefined && value.runtime === undefined) {
            value.runtime = Tasks.RuntimeType.Process;
        }
        value.presentation = PresentationOptions.fillDefaults(value.presentation, context);
        if (!isEmpty(value)) {
            value.options = CommandOptions.fillDefaults(value.options, context);
        }
        if (value.args === undefined) {
            value.args = EMPTY_ARRAY;
        }
        if (value.suppressTaskName === undefined) {
            value.suppressTaskName = (context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */);
        }
    }
    CommandConfiguration.fillDefaults = fillDefaults;
    function freeze(value) {
        return _freeze(value, properties);
    }
    CommandConfiguration.freeze = freeze;
})(CommandConfiguration || (CommandConfiguration = {}));
export var ProblemMatcherConverter;
(function (ProblemMatcherConverter) {
    function namedFrom(declares, context) {
        const result = Object.create(null);
        if (!Array.isArray(declares)) {
            return result;
        }
        declares.forEach((value) => {
            const namedProblemMatcher = (new ProblemMatcherParser(context.problemReporter)).parse(value);
            if (isNamedProblemMatcher(namedProblemMatcher)) {
                result[namedProblemMatcher.name] = namedProblemMatcher;
            }
            else {
                context.problemReporter.error(nls.localize('ConfigurationParser.noName', 'Error: Problem Matcher in declare scope must have a name:\n{0}\n', JSON.stringify(value, undefined, 4)));
            }
        });
        return result;
    }
    ProblemMatcherConverter.namedFrom = namedFrom;
    function fromWithOsConfig(external, context) {
        let result = {};
        const osExternal = external;
        if (osExternal.windows?.problemMatcher && context.platform === 3 /* Platform.Windows */) {
            result = from(osExternal.windows.problemMatcher, context);
        }
        else if (osExternal.osx?.problemMatcher && context.platform === 1 /* Platform.Mac */) {
            result = from(osExternal.osx.problemMatcher, context);
        }
        else if (osExternal.linux?.problemMatcher && context.platform === 2 /* Platform.Linux */) {
            result = from(osExternal.linux.problemMatcher, context);
        }
        else if (external.problemMatcher) {
            result = from(external.problemMatcher, context);
        }
        return result;
    }
    ProblemMatcherConverter.fromWithOsConfig = fromWithOsConfig;
    function from(config, context) {
        const result = [];
        if (config === undefined) {
            return { value: result };
        }
        const errors = [];
        function addResult(matcher) {
            if (matcher.value) {
                result.push(matcher.value);
            }
            if (matcher.errors) {
                errors.push(...matcher.errors);
            }
        }
        const kind = getProblemMatcherKind(config);
        if (kind === ProblemMatcherKind.Unknown) {
            const error = nls.localize('ConfigurationParser.unknownMatcherKind', 'Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | Array<string | ProblemMatcher>.\n{0}\n', JSON.stringify(config, null, 4));
            context.problemReporter.warn(error);
        }
        else if (kind === ProblemMatcherKind.String || kind === ProblemMatcherKind.ProblemMatcher) {
            addResult(resolveProblemMatcher(config, context));
        }
        else if (kind === ProblemMatcherKind.Array) {
            const problemMatchers = config;
            problemMatchers.forEach(problemMatcher => {
                addResult(resolveProblemMatcher(problemMatcher, context));
            });
        }
        return { value: result, errors };
    }
    ProblemMatcherConverter.from = from;
    function getProblemMatcherKind(value) {
        if (Types.isString(value)) {
            return ProblemMatcherKind.String;
        }
        else if (Array.isArray(value)) {
            return ProblemMatcherKind.Array;
        }
        else if (!Types.isUndefined(value)) {
            return ProblemMatcherKind.ProblemMatcher;
        }
        else {
            return ProblemMatcherKind.Unknown;
        }
    }
    function resolveProblemMatcher(value, context) {
        if (Types.isString(value)) {
            let variableName = value;
            if (variableName.length > 1 && variableName[0] === '$') {
                variableName = variableName.substring(1);
                const global = ProblemMatcherRegistry.get(variableName);
                if (global) {
                    return { value: Objects.deepClone(global) };
                }
                let localProblemMatcher = context.namedProblemMatchers[variableName];
                if (localProblemMatcher) {
                    localProblemMatcher = Objects.deepClone(localProblemMatcher);
                    // remove the name
                    delete localProblemMatcher.name;
                    return { value: localProblemMatcher };
                }
            }
            return { errors: [nls.localize('ConfigurationParser.invalidVariableReference', 'Error: Invalid problemMatcher reference: {0}\n', value)] };
        }
        else {
            const json = value;
            return { value: new ProblemMatcherParser(context.problemReporter).parse(json) };
        }
    }
})(ProblemMatcherConverter || (ProblemMatcherConverter = {}));
export var GroupKind;
(function (GroupKind) {
    function from(external) {
        if (external === undefined) {
            return undefined;
        }
        else if (Types.isString(external) && Tasks.TaskGroup.is(external)) {
            return { _id: external, isDefault: false };
        }
        else if (Types.isString(external.kind) && Tasks.TaskGroup.is(external.kind)) {
            const group = external.kind;
            const isDefault = Types.isUndefined(external.isDefault) ? false : external.isDefault;
            return { _id: group, isDefault };
        }
        return undefined;
    }
    GroupKind.from = from;
    function to(group) {
        if (Types.isString(group)) {
            return group;
        }
        else if (!group.isDefault) {
            return group._id;
        }
        return {
            kind: group._id,
            isDefault: group.isDefault,
        };
    }
    GroupKind.to = to;
})(GroupKind || (GroupKind = {}));
var TaskDependency;
(function (TaskDependency) {
    function uriFromSource(context, source) {
        switch (source) {
            case TaskConfigSource.User: return Tasks.USER_TASKS_GROUP_KEY;
            case TaskConfigSource.TasksJson: return context.workspaceFolder.uri;
            default: return context.workspace && context.workspace.configuration ? context.workspace.configuration : context.workspaceFolder.uri;
        }
    }
    function from(external, context, source) {
        if (Types.isString(external)) {
            return { uri: uriFromSource(context, source), task: external };
        }
        else if (ITaskIdentifier.is(external)) {
            return {
                uri: uriFromSource(context, source),
                task: Tasks.TaskDefinition.createTaskIdentifier(external, context.problemReporter)
            };
        }
        else {
            return undefined;
        }
    }
    TaskDependency.from = from;
})(TaskDependency || (TaskDependency = {}));
var DependsOrder;
(function (DependsOrder) {
    function from(order) {
        switch (order) {
            case "sequence" /* Tasks.DependsOrder.sequence */:
                return "sequence" /* Tasks.DependsOrder.sequence */;
            case "parallel" /* Tasks.DependsOrder.parallel */:
            default:
                return "parallel" /* Tasks.DependsOrder.parallel */;
        }
    }
    DependsOrder.from = from;
})(DependsOrder || (DependsOrder = {}));
var ConfigurationProperties;
(function (ConfigurationProperties) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IMetaData array holds heterogeneous parser types
    const properties = [
        { property: 'name' },
        { property: 'identifier' },
        { property: 'group' },
        { property: 'isBackground' },
        { property: 'promptOnClose' },
        { property: 'dependsOn' },
        { property: 'presentation', type: CommandConfiguration.PresentationOptions },
        { property: 'problemMatchers' },
        { property: 'options' },
        { property: 'icon' },
        { property: 'hide' },
        { property: 'inSessions' }
    ];
    function from(external, context, includeCommandOptions, source, properties) {
        if (!external) {
            return {};
        }
        const result = {};
        if (properties) {
            for (const propertyName of Object.keys(properties)) {
                if (external[propertyName] !== undefined) {
                    result[propertyName] = Objects.deepClone(external[propertyName]);
                }
            }
        }
        if (Types.isString(external.taskName)) {
            result.name = external.taskName;
        }
        if (Types.isString(external.label) && context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */) {
            result.name = external.label;
        }
        if (Types.isString(external.identifier)) {
            result.identifier = external.identifier;
        }
        result.icon = external.icon;
        result.hide = external.hide;
        result.inSessions = external.inSessions;
        if (external.isBackground !== undefined) {
            result.isBackground = !!external.isBackground;
        }
        if (external.promptOnClose !== undefined) {
            result.promptOnClose = !!external.promptOnClose;
        }
        result.group = GroupKind.from(external.group);
        if (external.dependsOn !== undefined) {
            if (Array.isArray(external.dependsOn)) {
                result.dependsOn = external.dependsOn.reduce((dependencies, item) => {
                    const dependency = TaskDependency.from(item, context, source);
                    if (dependency) {
                        dependencies.push(dependency);
                    }
                    return dependencies;
                }, []);
            }
            else {
                const dependsOnValue = TaskDependency.from(external.dependsOn, context, source);
                result.dependsOn = dependsOnValue ? [dependsOnValue] : undefined;
            }
        }
        result.dependsOrder = DependsOrder.from(external.dependsOrder);
        if (includeCommandOptions && (external.presentation !== undefined || external.terminal !== undefined)) {
            result.presentation = CommandConfiguration.PresentationOptions.from(external, context);
        }
        if (includeCommandOptions && (external.options !== undefined)) {
            result.options = CommandOptions.from(external.options, context);
        }
        const configProblemMatcher = ProblemMatcherConverter.fromWithOsConfig(external, context);
        if (configProblemMatcher.value !== undefined) {
            result.problemMatchers = configProblemMatcher.value;
        }
        if (external.detail) {
            result.detail = external.detail;
        }
        return isEmpty(result) ? {} : { value: result, errors: configProblemMatcher.errors };
    }
    ConfigurationProperties.from = from;
    function isEmpty(value) {
        return _isEmpty(value, properties);
    }
    ConfigurationProperties.isEmpty = isEmpty;
})(ConfigurationProperties || (ConfigurationProperties = {}));
const label = 'Workspace';
var ConfiguringTask;
(function (ConfiguringTask) {
    const grunt = 'grunt.';
    const jake = 'jake.';
    const gulp = 'gulp.';
    const npm = 'vscode.npm.';
    const typescript = 'vscode.typescript.';
    function from(external, context, index, source, registry) {
        if (!external) {
            return undefined;
        }
        const type = external.type;
        const customize = external.customize;
        if (!type && !customize) {
            context.problemReporter.error(nls.localize('ConfigurationParser.noTaskType', 'Error: tasks configuration must have a type property. The configuration will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
            return undefined;
        }
        const typeDeclaration = type ? registry?.get?.(type) || TaskDefinitionRegistry.get(type) : undefined;
        if (!typeDeclaration) {
            const message = nls.localize('ConfigurationParser.noTypeDefinition', 'Error: there is no registered task type \'{0}\'. Did you miss installing an extension that provides a corresponding task provider?', type);
            context.problemReporter.error(message);
            return undefined;
        }
        let identifier;
        if (Types.isString(customize)) {
            if (customize.indexOf(grunt) === 0) {
                identifier = { type: 'grunt', task: customize.substring(grunt.length) };
            }
            else if (customize.indexOf(jake) === 0) {
                identifier = { type: 'jake', task: customize.substring(jake.length) };
            }
            else if (customize.indexOf(gulp) === 0) {
                identifier = { type: 'gulp', task: customize.substring(gulp.length) };
            }
            else if (customize.indexOf(npm) === 0) {
                identifier = { type: 'npm', script: customize.substring(npm.length + 4) };
            }
            else if (customize.indexOf(typescript) === 0) {
                identifier = { type: 'typescript', tsconfig: customize.substring(typescript.length + 6) };
            }
        }
        else {
            if (Types.isString(external.type)) {
                identifier = external;
            }
        }
        if (identifier === undefined) {
            context.problemReporter.error(nls.localize('ConfigurationParser.missingType', 'Error: the task configuration \'{0}\' is missing the required property \'type\'. The task configuration will be ignored.', JSON.stringify(external, undefined, 0)));
            return undefined;
        }
        const taskIdentifier = Tasks.TaskDefinition.createTaskIdentifier(identifier, context.problemReporter);
        if (taskIdentifier === undefined) {
            context.problemReporter.error(nls.localize('ConfigurationParser.incorrectType', 'Error: the task configuration \'{0}\' is using an unknown type. The task configuration will be ignored.', JSON.stringify(external, undefined, 0)));
            return undefined;
        }
        const configElement = {
            workspaceFolder: context.workspaceFolder,
            file: '.vscode/tasks.json',
            index,
            element: external
        };
        let taskSource;
        switch (source) {
            case TaskConfigSource.User: {
                taskSource = { kind: Tasks.TaskSourceKind.User, config: configElement, label };
                break;
            }
            case TaskConfigSource.WorkspaceFile: {
                taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: configElement, label };
                break;
            }
            default: {
                taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: configElement, label };
                break;
            }
        }
        const result = new Tasks.ConfiguringTask(`${typeDeclaration.extensionId}.${taskIdentifier._key}`, taskSource, undefined, type, taskIdentifier, RunOptions.fromConfiguration(external.runOptions), { hide: external.hide, inSessions: external.inSessions });
        const configuration = ConfigurationProperties.from(external, context, true, source, typeDeclaration.properties);
        result.addTaskLoadMessages(configuration.errors);
        if (configuration.value) {
            result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
            if (result.configurationProperties.name) {
                result._label = result.configurationProperties.name;
            }
            else {
                let label = result.configures.type;
                if (typeDeclaration.required && typeDeclaration.required.length > 0) {
                    for (const required of typeDeclaration.required) {
                        const value = result.configures[required];
                        if (value) {
                            label = label + ': ' + value;
                            break;
                        }
                    }
                }
                result._label = label;
            }
            if (!result.configurationProperties.identifier) {
                result.configurationProperties.identifier = taskIdentifier._key;
            }
        }
        return result;
    }
    ConfiguringTask.from = from;
})(ConfiguringTask || (ConfiguringTask = {}));
var CustomTask;
(function (CustomTask) {
    function from(external, context, index, source) {
        if (!external) {
            return undefined;
        }
        let type = external.type;
        if (type === undefined || type === null) {
            type = Tasks.CUSTOMIZED_TASK_TYPE;
        }
        if (type !== Tasks.CUSTOMIZED_TASK_TYPE && type !== 'shell' && type !== 'process') {
            context.problemReporter.error(nls.localize('ConfigurationParser.notCustom', 'Error: tasks is not declared as a custom task. The configuration will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
            return undefined;
        }
        let taskName = external.taskName;
        if (Types.isString(external.label) && context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */) {
            taskName = external.label;
        }
        if (!taskName) {
            context.problemReporter.error(nls.localize('ConfigurationParser.noTaskName', 'Error: a task must provide a label property. The task will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
            return undefined;
        }
        let taskSource;
        switch (source) {
            case TaskConfigSource.User: {
                taskSource = { kind: Tasks.TaskSourceKind.User, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder }, label };
                break;
            }
            case TaskConfigSource.WorkspaceFile: {
                taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder, workspace: context.workspace }, label };
                break;
            }
            default: {
                taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder }, label };
                break;
            }
        }
        const result = new Tasks.CustomTask(context.uuidMap.getUUID(taskName), taskSource, taskName, Tasks.CUSTOMIZED_TASK_TYPE, undefined, false, RunOptions.fromConfiguration(external.runOptions), {
            name: taskName,
            identifier: taskName,
        });
        const configuration = ConfigurationProperties.from(external, context, false, source);
        result.addTaskLoadMessages(configuration.errors);
        if (configuration.value) {
            result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
        }
        const supportLegacy = true; //context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
        if (supportLegacy) {
            const legacy = external;
            if (result.configurationProperties.isBackground === undefined && legacy.isWatching !== undefined) {
                result.configurationProperties.isBackground = !!legacy.isWatching;
            }
            if (result.configurationProperties.group === undefined) {
                if (legacy.isBuildCommand === true) {
                    result.configurationProperties.group = Tasks.TaskGroup.Build;
                }
                else if (legacy.isTestCommand === true) {
                    result.configurationProperties.group = Tasks.TaskGroup.Test;
                }
            }
        }
        const command = CommandConfiguration.from(external, context);
        if (command) {
            result.command = command;
        }
        if (external.command !== undefined) {
            // if the task has its own command then we suppress the
            // task name by default.
            command.suppressTaskName = true;
        }
        return result;
    }
    CustomTask.from = from;
    function fillGlobals(task, globals) {
        // We only merge a command from a global definition if there is no dependsOn
        // or there is a dependsOn and a defined command.
        if (CommandConfiguration.hasCommand(task.command) || task.configurationProperties.dependsOn === undefined) {
            task.command = CommandConfiguration.fillGlobals(task.command, globals.command, task.configurationProperties.name);
        }
        if (task.configurationProperties.problemMatchers === undefined && globals.problemMatcher !== undefined) {
            task.configurationProperties.problemMatchers = Objects.deepClone(globals.problemMatcher);
            task.hasDefinedMatchers = true;
        }
        // promptOnClose is inferred from isBackground if available
        if (task.configurationProperties.promptOnClose === undefined && task.configurationProperties.isBackground === undefined && globals.promptOnClose !== undefined) {
            task.configurationProperties.promptOnClose = globals.promptOnClose;
        }
    }
    CustomTask.fillGlobals = fillGlobals;
    function fillDefaults(task, context) {
        CommandConfiguration.fillDefaults(task.command, context);
        if (task.configurationProperties.promptOnClose === undefined) {
            task.configurationProperties.promptOnClose = task.configurationProperties.isBackground !== undefined ? !task.configurationProperties.isBackground : true;
        }
        if (task.configurationProperties.isBackground === undefined) {
            task.configurationProperties.isBackground = false;
        }
        if (task.configurationProperties.problemMatchers === undefined) {
            task.configurationProperties.problemMatchers = EMPTY_ARRAY;
        }
    }
    CustomTask.fillDefaults = fillDefaults;
    function createCustomTask(contributedTask, configuredProps) {
        const result = new Tasks.CustomTask(configuredProps._id, Object.assign({}, configuredProps._source, { customizes: contributedTask.defines }), configuredProps.configurationProperties.name || contributedTask._label, Tasks.CUSTOMIZED_TASK_TYPE, contributedTask.command, false, contributedTask.runOptions, {
            name: configuredProps.configurationProperties.name || contributedTask.configurationProperties.name,
            identifier: configuredProps.configurationProperties.identifier || contributedTask.configurationProperties.identifier,
            icon: configuredProps.configurationProperties.icon,
            hide: configuredProps.configurationProperties.hide,
            inSessions: configuredProps.configurationProperties.inSessions
        });
        result.addTaskLoadMessages(configuredProps.taskLoadMessages);
        const resultConfigProps = result.configurationProperties;
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'group');
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'isBackground');
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'dependsOn');
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'problemMatchers');
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'promptOnClose');
        assignProperty(resultConfigProps, configuredProps.configurationProperties, 'detail');
        result.command.presentation = CommandConfiguration.PresentationOptions.assignProperties(result.command.presentation, configuredProps.configurationProperties.presentation);
        result.command.options = CommandOptions.assignProperties(result.command.options, configuredProps.configurationProperties.options);
        result.runOptions = RunOptions.assignProperties(result.runOptions, configuredProps.runOptions);
        const contributedConfigProps = contributedTask.configurationProperties;
        fillProperty(resultConfigProps, contributedConfigProps, 'group');
        fillProperty(resultConfigProps, contributedConfigProps, 'isBackground');
        fillProperty(resultConfigProps, contributedConfigProps, 'dependsOn');
        fillProperty(resultConfigProps, contributedConfigProps, 'problemMatchers');
        fillProperty(resultConfigProps, contributedConfigProps, 'promptOnClose');
        fillProperty(resultConfigProps, contributedConfigProps, 'detail');
        result.command.presentation = CommandConfiguration.PresentationOptions.fillProperties(result.command.presentation, contributedConfigProps.presentation);
        result.command.options = CommandOptions.fillProperties(result.command.options, contributedConfigProps.options);
        result.runOptions = RunOptions.fillProperties(result.runOptions, contributedTask.runOptions);
        if (contributedTask.hasDefinedMatchers === true) {
            result.hasDefinedMatchers = true;
        }
        return result;
    }
    CustomTask.createCustomTask = createCustomTask;
})(CustomTask || (CustomTask = {}));
export var TaskParser;
(function (TaskParser) {
    function isCustomTask(value) {
        const type = value.type;
        const customize = value.customize;
        return customize === undefined && (type === undefined || type === null || type === Tasks.CUSTOMIZED_TASK_TYPE || type === 'shell' || type === 'process');
    }
    const builtinTypeContextMap = {
        shell: ShellExecutionSupportedContext,
        process: ProcessExecutionSupportedContext
    };
    function from(externals, globals, context, source, registry) {
        const result = { custom: [], configured: [] };
        if (!externals) {
            return result;
        }
        const defaultBuildTask = { task: undefined, rank: -1 };
        const defaultTestTask = { task: undefined, rank: -1 };
        const schema2_0_0 = context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */;
        const baseLoadIssues = Objects.deepClone(context.taskLoadIssues);
        for (let index = 0; index < externals.length; index++) {
            const external = externals[index];
            const definition = external.type ? registry?.get?.(external.type) || TaskDefinitionRegistry.get(external.type) : undefined;
            let typeNotSupported = false;
            if (definition && definition.when && !context.contextKeyService.contextMatchesRules(definition.when)) {
                typeNotSupported = true;
            }
            else if (!definition && external.type) {
                for (const key of Object.keys(builtinTypeContextMap)) {
                    if (external.type === key) {
                        typeNotSupported = !ShellExecutionSupportedContext.evaluate(context.contextKeyService.getContext(null));
                        break;
                    }
                }
            }
            if (typeNotSupported) {
                context.problemReporter.info(nls.localize('taskConfiguration.providerUnavailable', 'Warning: {0} tasks are unavailable in the current environment.\n', external.type));
                continue;
            }
            if (isCustomTask(external)) {
                const customTask = CustomTask.from(external, context, index, source);
                if (customTask) {
                    CustomTask.fillGlobals(customTask, globals);
                    CustomTask.fillDefaults(customTask, context);
                    if (schema2_0_0) {
                        if ((customTask.command === undefined || customTask.command.name === undefined) && (customTask.configurationProperties.dependsOn === undefined || customTask.configurationProperties.dependsOn.length === 0)) {
                            context.problemReporter.error(nls.localize('taskConfiguration.noCommandOrDependsOn', 'Error: the task \'{0}\' neither specifies a command nor a dependsOn property. The task will be ignored. Its definition is:\n{1}', customTask.configurationProperties.name, JSON.stringify(external, undefined, 4)));
                            continue;
                        }
                    }
                    else {
                        if (customTask.command === undefined || customTask.command.name === undefined) {
                            context.problemReporter.warn(nls.localize('taskConfiguration.noCommand', 'Error: the task \'{0}\' doesn\'t define a command. The task will be ignored. Its definition is:\n{1}', customTask.configurationProperties.name, JSON.stringify(external, undefined, 4)));
                            continue;
                        }
                    }
                    if (customTask.configurationProperties.group === Tasks.TaskGroup.Build && defaultBuildTask.rank < 2) {
                        defaultBuildTask.task = customTask;
                        defaultBuildTask.rank = 2;
                    }
                    else if (customTask.configurationProperties.group === Tasks.TaskGroup.Test && defaultTestTask.rank < 2) {
                        defaultTestTask.task = customTask;
                        defaultTestTask.rank = 2;
                    }
                    else if (customTask.configurationProperties.name === 'build' && defaultBuildTask.rank < 1) {
                        defaultBuildTask.task = customTask;
                        defaultBuildTask.rank = 1;
                    }
                    else if (customTask.configurationProperties.name === 'test' && defaultTestTask.rank < 1) {
                        defaultTestTask.task = customTask;
                        defaultTestTask.rank = 1;
                    }
                    customTask.addTaskLoadMessages(context.taskLoadIssues);
                    result.custom.push(customTask);
                }
            }
            else {
                const configuredTask = ConfiguringTask.from(external, context, index, source, registry);
                if (configuredTask) {
                    configuredTask.addTaskLoadMessages(context.taskLoadIssues);
                    result.configured.push(configuredTask);
                }
            }
            context.taskLoadIssues = Objects.deepClone(baseLoadIssues);
        }
        // There is some special logic for tasks with the labels "build" and "test".
        // Even if they are not marked as a task group Build or Test, we automagically group them as such.
        // However, if they are already grouped as Build or Test, we don't need to add this grouping.
        const defaultBuildGroupName = Types.isString(defaultBuildTask.task?.configurationProperties.group) ? defaultBuildTask.task?.configurationProperties.group : defaultBuildTask.task?.configurationProperties.group?._id;
        const defaultTestTaskGroupName = Types.isString(defaultTestTask.task?.configurationProperties.group) ? defaultTestTask.task?.configurationProperties.group : defaultTestTask.task?.configurationProperties.group?._id;
        if ((defaultBuildGroupName !== Tasks.TaskGroup.Build._id) && (defaultBuildTask.rank > -1) && (defaultBuildTask.rank < 2) && defaultBuildTask.task) {
            defaultBuildTask.task.configurationProperties.group = Tasks.TaskGroup.Build;
        }
        else if ((defaultTestTaskGroupName !== Tasks.TaskGroup.Test._id) && (defaultTestTask.rank > -1) && (defaultTestTask.rank < 2) && defaultTestTask.task) {
            defaultTestTask.task.configurationProperties.group = Tasks.TaskGroup.Test;
        }
        return result;
    }
    TaskParser.from = from;
    function assignTasks(target, source) {
        if (source === undefined || source.length === 0) {
            return target;
        }
        if (target === undefined || target.length === 0) {
            return source;
        }
        if (source) {
            // Tasks are keyed by ID but we need to merge by name
            const map = Object.create(null);
            target.forEach((task) => {
                map[task.configurationProperties.name] = task;
            });
            source.forEach((task) => {
                map[task.configurationProperties.name] = task;
            });
            const newTarget = [];
            target.forEach(task => {
                newTarget.push(map[task.configurationProperties.name]);
                delete map[task.configurationProperties.name];
            });
            Object.keys(map).forEach(key => newTarget.push(map[key]));
            target = newTarget;
        }
        return target;
    }
    TaskParser.assignTasks = assignTasks;
})(TaskParser || (TaskParser = {}));
var Globals;
(function (Globals) {
    function from(config, context) {
        let result = fromBase(config, context);
        let osGlobals = undefined;
        if (config.windows && context.platform === 3 /* Platform.Windows */) {
            osGlobals = fromBase(config.windows, context);
        }
        else if (config.osx && context.platform === 1 /* Platform.Mac */) {
            osGlobals = fromBase(config.osx, context);
        }
        else if (config.linux && context.platform === 2 /* Platform.Linux */) {
            osGlobals = fromBase(config.linux, context);
        }
        if (osGlobals) {
            result = Globals.assignProperties(result, osGlobals);
        }
        const command = CommandConfiguration.from(config, context);
        if (command) {
            result.command = command;
        }
        Globals.fillDefaults(result, context);
        Globals.freeze(result);
        return result;
    }
    Globals.from = from;
    function fromBase(config, context) {
        const result = {};
        if (config.suppressTaskName !== undefined) {
            result.suppressTaskName = !!config.suppressTaskName;
        }
        if (config.promptOnClose !== undefined) {
            result.promptOnClose = !!config.promptOnClose;
        }
        if (config.problemMatcher) {
            result.problemMatcher = ProblemMatcherConverter.from(config.problemMatcher, context).value;
        }
        return result;
    }
    Globals.fromBase = fromBase;
    function isEmpty(value) {
        return !value || value.command === undefined && value.promptOnClose === undefined && value.suppressTaskName === undefined;
    }
    Globals.isEmpty = isEmpty;
    function assignProperties(target, source) {
        if (isEmpty(source)) {
            return target;
        }
        if (isEmpty(target)) {
            return source;
        }
        assignProperty(target, source, 'promptOnClose');
        assignProperty(target, source, 'suppressTaskName');
        return target;
    }
    Globals.assignProperties = assignProperties;
    function fillDefaults(value, context) {
        if (!value) {
            return;
        }
        CommandConfiguration.fillDefaults(value.command, context);
        if (value.suppressTaskName === undefined) {
            value.suppressTaskName = (context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */);
        }
        if (value.promptOnClose === undefined) {
            value.promptOnClose = true;
        }
    }
    Globals.fillDefaults = fillDefaults;
    function freeze(value) {
        Object.freeze(value);
        if (value.command) {
            CommandConfiguration.freeze(value.command);
        }
    }
    Globals.freeze = freeze;
})(Globals || (Globals = {}));
export var ExecutionEngine;
(function (ExecutionEngine) {
    function from(config) {
        const runner = config.runner || config._runner;
        let result;
        if (runner) {
            switch (runner) {
                case 'terminal':
                    result = Tasks.ExecutionEngine.Terminal;
                    break;
                case 'process':
                    result = Tasks.ExecutionEngine.Process;
                    break;
            }
        }
        const schemaVersion = JsonSchemaVersion.from(config);
        if (schemaVersion === 1 /* Tasks.JsonSchemaVersion.V0_1_0 */) {
            return result || Tasks.ExecutionEngine.Process;
        }
        else if (schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */) {
            return Tasks.ExecutionEngine.Terminal;
        }
        else {
            throw new Error('Shouldn\'t happen.');
        }
    }
    ExecutionEngine.from = from;
})(ExecutionEngine || (ExecutionEngine = {}));
export var JsonSchemaVersion;
(function (JsonSchemaVersion) {
    const _default = 2 /* Tasks.JsonSchemaVersion.V2_0_0 */;
    function from(config) {
        const version = config.version;
        if (!version) {
            return _default;
        }
        switch (version) {
            case '0.1.0':
                return 1 /* Tasks.JsonSchemaVersion.V0_1_0 */;
            case '2.0.0':
                return 2 /* Tasks.JsonSchemaVersion.V2_0_0 */;
            default:
                return _default;
        }
    }
    JsonSchemaVersion.from = from;
})(JsonSchemaVersion || (JsonSchemaVersion = {}));
export class UUIDMap {
    constructor(other) {
        this.current = Object.create(null);
        if (other) {
            for (const key of Object.keys(other.current)) {
                const value = other.current[key];
                if (Array.isArray(value)) {
                    this.current[key] = value.slice();
                }
                else {
                    this.current[key] = value;
                }
            }
        }
    }
    start() {
        this.last = this.current;
        this.current = Object.create(null);
    }
    getUUID(identifier) {
        const lastValue = this.last ? this.last[identifier] : undefined;
        let result = undefined;
        if (lastValue !== undefined) {
            if (Array.isArray(lastValue)) {
                result = lastValue.shift();
                if (lastValue.length === 0) {
                    delete this.last[identifier];
                }
            }
            else {
                result = lastValue;
                delete this.last[identifier];
            }
        }
        if (result === undefined) {
            result = UUID.generateUuid();
        }
        const currentValue = this.current[identifier];
        if (currentValue === undefined) {
            this.current[identifier] = result;
        }
        else {
            if (Array.isArray(currentValue)) {
                currentValue.push(result);
            }
            else {
                const arrayValue = [currentValue];
                arrayValue.push(result);
                this.current[identifier] = arrayValue;
            }
        }
        return result;
    }
    finish() {
        this.last = undefined;
    }
}
export var TaskConfigSource;
(function (TaskConfigSource) {
    TaskConfigSource[TaskConfigSource["TasksJson"] = 0] = "TasksJson";
    TaskConfigSource[TaskConfigSource["WorkspaceFile"] = 1] = "WorkspaceFile";
    TaskConfigSource[TaskConfigSource["User"] = 2] = "User";
})(TaskConfigSource || (TaskConfigSource = {}));
class ConfigurationParser {
    constructor(workspaceFolder, workspace, platform, problemReporter, uuidMap) {
        this.workspaceFolder = workspaceFolder;
        this.workspace = workspace;
        this.platform = platform;
        this.problemReporter = problemReporter;
        this.uuidMap = uuidMap;
    }
    run(fileConfig, source, contextKeyService) {
        const engine = ExecutionEngine.from(fileConfig);
        const schemaVersion = JsonSchemaVersion.from(fileConfig);
        const context = {
            workspaceFolder: this.workspaceFolder,
            workspace: this.workspace,
            problemReporter: this.problemReporter,
            uuidMap: this.uuidMap,
            namedProblemMatchers: {},
            engine,
            schemaVersion,
            platform: this.platform,
            taskLoadIssues: [],
            contextKeyService
        };
        const taskParseResult = this.createTaskRunnerConfiguration(fileConfig, context, source);
        return {
            validationStatus: this.problemReporter.status,
            custom: taskParseResult.custom,
            configured: taskParseResult.configured,
            engine
        };
    }
    createTaskRunnerConfiguration(fileConfig, context, source) {
        const globals = Globals.from(fileConfig, context);
        if (this.problemReporter.status.isFatal()) {
            return { custom: [], configured: [] };
        }
        context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
        let globalTasks = undefined;
        let externalGlobalTasks = undefined;
        if (fileConfig.windows && context.platform === 3 /* Platform.Windows */) {
            globalTasks = TaskParser.from(fileConfig.windows.tasks, globals, context, source).custom;
            externalGlobalTasks = fileConfig.windows.tasks;
        }
        else if (fileConfig.osx && context.platform === 1 /* Platform.Mac */) {
            globalTasks = TaskParser.from(fileConfig.osx.tasks, globals, context, source).custom;
            externalGlobalTasks = fileConfig.osx.tasks;
        }
        else if (fileConfig.linux && context.platform === 2 /* Platform.Linux */) {
            globalTasks = TaskParser.from(fileConfig.linux.tasks, globals, context, source).custom;
            externalGlobalTasks = fileConfig.linux.tasks;
        }
        if (context.schemaVersion === 2 /* Tasks.JsonSchemaVersion.V2_0_0 */ && globalTasks && globalTasks.length > 0 && externalGlobalTasks && externalGlobalTasks.length > 0) {
            const taskContent = [];
            for (const task of externalGlobalTasks) {
                taskContent.push(JSON.stringify(task, null, 4));
            }
            context.problemReporter.error(nls.localize({ key: 'TaskParse.noOsSpecificGlobalTasks', comment: ['\"Task version 2.0.0\" refers to the 2.0.0 version of the task system. The \"version 2.0.0\" is not localizable as it is a json key and value.'] }, 'Task version 2.0.0 doesn\'t support global OS specific tasks. Convert them to a task with a OS specific command. Affected tasks are:\n{0}', taskContent.join('\n')));
        }
        let result = { custom: [], configured: [] };
        if (fileConfig.tasks) {
            result = TaskParser.from(fileConfig.tasks, globals, context, source);
        }
        if (globalTasks) {
            result.custom = TaskParser.assignTasks(result.custom, globalTasks);
        }
        if ((!result.custom || result.custom.length === 0) && (globals.command && globals.command.name)) {
            const matchers = ProblemMatcherConverter.from(fileConfig.problemMatcher, context).value ?? [];
            const isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : undefined;
            const name = Tasks.CommandString.value(globals.command.name);
            const task = new Tasks.CustomTask(context.uuidMap.getUUID(name), Object.assign({}, source, 'workspace', { config: { index: -1, element: fileConfig, workspaceFolder: context.workspaceFolder } }), name, Tasks.CUSTOMIZED_TASK_TYPE, {
                name: undefined,
                runtime: undefined,
                presentation: undefined,
                suppressTaskName: true
            }, false, { reevaluateOnRerun: true }, {
                name: name,
                identifier: name,
                group: Tasks.TaskGroup.Build,
                isBackground: isBackground,
                problemMatchers: matchers
            });
            const taskGroupKind = GroupKind.from(fileConfig.group);
            if (taskGroupKind !== undefined) {
                task.configurationProperties.group = taskGroupKind;
            }
            else if (fileConfig.group === 'none') {
                task.configurationProperties.group = undefined;
            }
            CustomTask.fillGlobals(task, globals);
            CustomTask.fillDefaults(task, context);
            result.custom = [task];
        }
        result.custom = result.custom || [];
        result.configured = result.configured || [];
        return result;
    }
}
const uuidMaps = new Map();
const recentUuidMaps = new Map();
export function parse(workspaceFolder, workspace, platform, configuration, logger, source, contextKeyService, isRecents = false) {
    const recentOrOtherMaps = isRecents ? recentUuidMaps : uuidMaps;
    let selectedUuidMaps = recentOrOtherMaps.get(source);
    if (!selectedUuidMaps) {
        recentOrOtherMaps.set(source, new Map());
        selectedUuidMaps = recentOrOtherMaps.get(source);
    }
    let uuidMap = selectedUuidMaps.get(workspaceFolder.uri.toString());
    if (!uuidMap) {
        uuidMap = new UUIDMap();
        selectedUuidMaps.set(workspaceFolder.uri.toString(), uuidMap);
    }
    try {
        uuidMap.start();
        return (new ConfigurationParser(workspaceFolder, workspace, platform, logger, uuidMap)).run(configuration, source, contextKeyService);
    }
    finally {
        uuidMap.finish();
    }
}
export function createCustomTask(contributedTask, configuredProps) {
    return CustomTask.createCustomTask(contributedTask, configuredProps);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0NvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9jb21tb24vdGFza0NvbmZpZ3VyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBSTlELE9BQU8sS0FBSyxLQUFLLE1BQU0sa0NBQWtDLENBQUM7QUFDMUQsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUd4RCxPQUFPLEVBQ2dCLG9CQUFvQixFQUMxQyxxQkFBcUIsRUFBRSxzQkFBc0IsRUFDN0MsTUFBTSxxQkFBcUIsQ0FBQztBQUc3QixPQUFPLEtBQUssS0FBSyxNQUFNLFlBQVksQ0FBQztBQUNwQyxPQUFPLEVBQTJCLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFHOUYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFHcEcsTUFBTSxDQUFOLElBQWtCLFlBZWpCO0FBZkQsV0FBa0IsWUFBWTtJQUM3Qjs7T0FFRztJQUNILG1EQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILG1EQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILCtDQUFRLENBQUE7QUFDVCxDQUFDLEVBZmlCLFlBQVksS0FBWixZQUFZLFFBZTdCO0FBa0hELE1BQU0sS0FBVyxlQUFlLENBSy9CO0FBTEQsV0FBaUIsZUFBZTtJQUMvQixTQUFnQixFQUFFLENBQUMsS0FBYztRQUNoQyxNQUFNLFNBQVMsR0FBb0IsS0FBd0IsQ0FBQztRQUM1RCxPQUFPLFNBQVMsS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBRSxLQUF5QixDQUFDLElBQUks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