/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../nls.js';
import { URI } from '../../base/common/uri.js';
import { ICodeEditorService } from './services/codeEditorService.js';
import { Position } from '../common/core/position.js';
import { IModelService } from '../common/services/model.js';
import { ITextModelService } from '../common/services/resolverService.js';
import { MenuId, MenuRegistry, Action2 } from '../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { assertType } from '../../base/common/types.js';
import { ILogService } from '../../platform/log/common/log.js';
import { getActiveElement } from '../../base/browser/dom.js';
import { TriggerInlineEditCommandsRegistry } from './triggerInlineEditCommandsRegistry.js';
export var EditorContributionInstantiation;
(function (EditorContributionInstantiation) {
    /**
     * The contribution is created eagerly when the {@linkcode ICodeEditor} is instantiated.
     * Only Eager contributions can participate in saving or restoring of view state.
     */
    EditorContributionInstantiation[EditorContributionInstantiation["Eager"] = 0] = "Eager";
    /**
     * The contribution is created at the latest 50ms after the first render after attaching a text model.
     * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
     * If there is idle time available, it will be instantiated sooner.
     */
    EditorContributionInstantiation[EditorContributionInstantiation["AfterFirstRender"] = 1] = "AfterFirstRender";
    /**
     * The contribution is created before the editor emits events produced by user interaction (mouse events, keyboard events).
     * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
     * If there is idle time available, it will be instantiated sooner.
     */
    EditorContributionInstantiation[EditorContributionInstantiation["BeforeFirstInteraction"] = 2] = "BeforeFirstInteraction";
    /**
     * The contribution is created when there is idle time available, at the latest 5000ms after the editor creation.
     * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
     */
    EditorContributionInstantiation[EditorContributionInstantiation["Eventually"] = 3] = "Eventually";
    /**
     * The contribution is created only when explicitly requested via `getContribution`.
     */
    EditorContributionInstantiation[EditorContributionInstantiation["Lazy"] = 4] = "Lazy";
})(EditorContributionInstantiation || (EditorContributionInstantiation = {}));
export class Command {
    constructor(opts) {
        this.id = opts.id;
        this.precondition = opts.precondition;
        this._kbOpts = opts.kbOpts;
        this._menuOpts = opts.menuOpts;
        this.metadata = opts.metadata;
        this.canTriggerInlineEdits = opts.canTriggerInlineEdits;
    }
    register() {
        if (Array.isArray(this._menuOpts)) {
            this._menuOpts.forEach(this._registerMenuItem, this);
        }
        else if (this._menuOpts) {
            this._registerMenuItem(this._menuOpts);
        }
        if (this._kbOpts) {
            const kbOptsArr = Array.isArray(this._kbOpts) ? this._kbOpts : [this._kbOpts];
            for (const kbOpts of kbOptsArr) {
                let kbWhen = kbOpts.kbExpr;
                if (this.precondition) {
                    if (kbWhen) {
                        kbWhen = ContextKeyExpr.and(kbWhen, this.precondition);
                    }
                    else {
                        kbWhen = this.precondition;
                    }
                }
                const desc = {
                    id: this.id,
                    weight: kbOpts.weight,
                    args: kbOpts.args,
                    when: kbWhen,
                    primary: kbOpts.primary,
                    secondary: kbOpts.secondary,
                    win: kbOpts.win,
                    linux: kbOpts.linux,
                    mac: kbOpts.mac,
                };
                KeybindingsRegistry.registerKeybindingRule(desc);
            }
        }
        CommandsRegistry.registerCommand({
            id: this.id,
            handler: (accessor, args) => this.runCommand(accessor, args),
            metadata: this.metadata
        });
        if (this.canTriggerInlineEdits) {
            TriggerInlineEditCommandsRegistry.registerCommand(this.id);
        }
    }
    _registerMenuItem(item) {
        MenuRegistry.appendMenuItem(item.menuId, {
            group: item.group,
            command: {
                id: this.id,
                title: item.title,
                icon: item.icon,
                precondition: this.precondition
            },
            when: item.when,
            order: item.order
        });
    }
}
export class MultiCommand extends Command {
    constructor() {
        super(...arguments);
        this._implementations = [];
    }
    /**
     * A higher priority gets to be looked at first
     */
    addImplementation(priority, name, implementation, when) {
        this._implementations.push({ priority, name, implementation, when });
        this._implementations.sort((a, b) => b.priority - a.priority);
        return {
            dispose: () => {
                for (let i = 0; i < this._implementations.length; i++) {
                    if (this._implementations[i].implementation === implementation) {
                        this._implementations.splice(i, 1);
                        return;
                    }
                }
            }
        };
    }
    runCommand(accessor, args) {
        const logService = accessor.get(ILogService);
        const contextKeyService = accessor.get(IContextKeyService);
        logService.trace(`Executing Command '${this.id}' which has ${this._implementations.length} bound.`);
        for (const impl of this._implementations) {
            if (impl.when) {
                const context = contextKeyService.getContext(getActiveElement());
                const value = impl.when.evaluate(context);
                if (!value) {
                    continue;
                }
            }
            const result = impl.implementation(accessor, args);
            if (result) {
                logService.trace(`Command '${this.id}' was handled by '${impl.name}'.`);
                if (typeof result === 'boolean') {
                    return;
                }
                return result;
            }
        }
        logService.trace(`The Command '${this.id}' was not handled by any implementation.`);
    }
}
//#endregion
/**
 * A command that delegates to another command's implementation.
 *
 * This lets different commands be registered but share the same implementation
 */
export class ProxyCommand extends Command {
    constructor(command, opts) {
        super(opts);
        this.command = command;
    }
    runCommand(accessor, args) {
        return this.command.runCommand(accessor, args);
    }
}
export class EditorCommand extends Command {
    /**
     * Create a command class that is bound to a certain editor contribution.
     */
    static bindToContribution(controllerGetter) {
        return class EditorControllerCommandImpl extends EditorCommand {
            constructor(opts) {
                super(opts);
                this._callback = opts.handler;
            }
            runEditorCommand(accessor, editor, args) {
                const controller = controllerGetter(editor);
                if (controller) {
                    this._callback(controller, args);
                }
            }
        };
    }
    static runEditorCommand(accessor, args, precondition, runner) {
        const codeEditorService = accessor.get(ICodeEditorService);
        // Find the editor with text focus or active
        const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
        if (!editor) {
            // well, at least we tried...
            return;
        }
        return editor.invokeWithinContext((editorAccessor) => {
            const kbService = editorAccessor.get(IContextKeyService);
            if (!kbService.contextMatchesRules(precondition ?? undefined)) {
                // precondition does not hold
                return;
            }
            return runner(editorAccessor, editor, args);
        });
    }
    runCommand(accessor, args) {
        return EditorCommand.runEditorCommand(accessor, args, this.precondition, (accessor, editor, args) => this.runEditorCommand(accessor, editor, args));
    }
}
export class EditorAction extends EditorCommand {
    static convertOptions(opts) {
        let menuOpts;
        if (Array.isArray(opts.menuOpts)) {
            menuOpts = opts.menuOpts;
        }
        else if (opts.menuOpts) {
            menuOpts = [opts.menuOpts];
        }
        else {
            menuOpts = [];
        }
        function withDefaults(item) {
            if (!item.menuId) {
                item.menuId = MenuId.EditorContext;
            }
            if (!item.title) {
                item.title = typeof opts.label === 'string' ? opts.label : opts.label.value;
            }
            item.when = ContextKeyExpr.and(opts.precondition, item.when);
            return item;
        }
        if (Array.isArray(opts.contextMenuOpts)) {
            menuOpts.push(...opts.contextMenuOpts.map(withDefaults));
        }
        else if (opts.contextMenuOpts) {
            menuOpts.push(withDefaults(opts.contextMenuOpts));
        }
        opts.menuOpts = menuOpts;
        return opts;
    }
    constructor(opts) {
        super(EditorAction.convertOptions(opts));
        if (typeof opts.label === 'string') {
            this.label = opts.label;
            this.alias = opts.alias ?? opts.label;
        }
        else {
            this.label = opts.label.value;
            this.alias = opts.alias ?? opts.label.original;
        }
    }
    runEditorCommand(accessor, editor, args) {
        this.reportTelemetry(accessor, editor);
        return this.run(accessor, editor, args || {});
    }
    reportTelemetry(accessor, editor) {
        accessor.get(ITelemetryService).publicLog2('editorActionInvoked', { name: this.label, id: this.id });
    }
}
export class MultiEditorAction extends EditorAction {
    constructor() {
        super(...arguments);
        this._implementations = [];
    }
    /**
     * A higher priority gets to be looked at first
     */
    addImplementation(priority, implementation) {
        this._implementations.push([priority, implementation]);
        this._implementations.sort((a, b) => b[0] - a[0]);
        return {
            dispose: () => {
                for (let i = 0; i < this._implementations.length; i++) {
                    if (this._implementations[i][1] === implementation) {
                        this._implementations.splice(i, 1);
                        return;
                    }
                }
            }
        };
    }
    run(accessor, editor, args) {
        for (const impl of this._implementations) {
            const result = impl[1](accessor, editor, args);
            if (result) {
                if (typeof result === 'boolean') {
                    return;
                }
                return result;
            }
        }
    }
}
//#endregion EditorAction
//#region EditorAction2
export class EditorAction2 extends Action2 {
    run(accessor, ...args) {
        // Find the editor with text focus or active
        const codeEditorService = accessor.get(ICodeEditorService);
        const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
        if (!editor) {
            // well, at least we tried...
            return;
        }
        // precondition does hold
        return editor.invokeWithinContext((editorAccessor) => {
            const kbService = editorAccessor.get(IContextKeyService);
            const logService = editorAccessor.get(ILogService);
            const enabled = kbService.contextMatchesRules(this.desc.precondition ?? undefined);
            if (!enabled) {
                logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
                return;
            }
            return this.runEditorCommand(editorAccessor, editor, ...args);
        });
    }
}
//#endregion
// --- Registration of commands and actions
export function registerModelAndPositionCommand(id, handler) {
    CommandsRegistry.registerCommand(id, function (accessor, ...args) {
        const instaService = accessor.get(IInstantiationService);
        const [resource, position] = args;
        assertType(URI.isUri(resource));
        assertType(Position.isIPosition(position));
        const model = accessor.get(IModelService).getModel(resource);
        if (model) {
            const editorPosition = Position.lift(position);
            return instaService.invokeFunction(handler, model, editorPosition, ...args.slice(2));
        }
        return accessor.get(ITextModelService).createModelReference(resource).then(reference => {
            return new Promise((resolve, reject) => {
                try {
                    const result = instaService.invokeFunction(handler, reference.object.textEditorModel, Position.lift(position), args.slice(2));
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
            }).finally(() => {
                reference.dispose();
            });
        });
    });
}
export function registerEditorCommand(editorCommand) {
    EditorContributionRegistry.INSTANCE.registerEditorCommand(editorCommand);
    return editorCommand;
}
export function registerEditorAction(ctor) {
    const action = new ctor();
    EditorContributionRegistry.INSTANCE.registerEditorAction(action);
    return action;
}
export function registerMultiEditorAction(action) {
    EditorContributionRegistry.INSTANCE.registerEditorAction(action);
    return action;
}
export function registerInstantiatedEditorAction(editorAction) {
    EditorContributionRegistry.INSTANCE.registerEditorAction(editorAction);
}
/**
 * Registers an editor contribution. Editor contributions have a lifecycle which is bound
 * to a specific code editor instance.
 */
export function registerEditorContribution(id, ctor, instantiation) {
    EditorContributionRegistry.INSTANCE.registerEditorContribution(id, ctor, instantiation);
}
/**
 * Registers a diff editor contribution. Diff editor contributions have a lifecycle which
 * is bound to a specific diff editor instance.
 */
export function registerDiffEditorContribution(id, ctor) {
    EditorContributionRegistry.INSTANCE.registerDiffEditorContribution(id, ctor);
}
export var EditorExtensionsRegistry;
(function (EditorExtensionsRegistry) {
    function getEditorCommand(commandId) {
        return EditorContributionRegistry.INSTANCE.getEditorCommand(commandId);
    }
    EditorExtensionsRegistry.getEditorCommand = getEditorCommand;
    function getEditorActions() {
        return EditorContributionRegistry.INSTANCE.getEditorActions();
    }
    EditorExtensionsRegistry.getEditorActions = getEditorActions;
    function getEditorContributions() {
        return EditorContributionRegistry.INSTANCE.getEditorContributions();
    }
    EditorExtensionsRegistry.getEditorContributions = getEditorContributions;
    function getSomeEditorContributions(ids) {
        return EditorContributionRegistry.INSTANCE.getEditorContributions().filter(c => ids.indexOf(c.id) >= 0);
    }
    EditorExtensionsRegistry.getSomeEditorContributions = getSomeEditorContributions;
    function getDiffEditorContributions() {
        return EditorContributionRegistry.INSTANCE.getDiffEditorContributions();
    }
    EditorExtensionsRegistry.getDiffEditorContributions = getDiffEditorContributions;
})(EditorExtensionsRegistry || (EditorExtensionsRegistry = {}));
// Editor extension points
const Extensions = {
    EditorCommonContributions: 'editor.contributions'
};
class EditorContributionRegistry {
    static { this.INSTANCE = new EditorContributionRegistry(); }
    constructor() {
        this.editorContributions = [];
        this.diffEditorContributions = [];
        this.editorActions = [];
        this.editorCommands = Object.create(null);
    }
    registerEditorContribution(id, ctor, instantiation) {
        this.editorContributions.push({ id, ctor: ctor, instantiation });
    }
    getEditorContributions() {
        return this.editorContributions.slice(0);
    }
    registerDiffEditorContribution(id, ctor) {
        this.diffEditorContributions.push({ id, ctor: ctor });
    }
    getDiffEditorContributions() {
        return this.diffEditorContributions.slice(0);
    }
    registerEditorAction(action) {
        action.register();
        this.editorActions.push(action);
    }
    getEditorActions() {
        return this.editorActions;
    }
    registerEditorCommand(editorCommand) {
        editorCommand.register();
        this.editorCommands[editorCommand.id] = editorCommand;
    }
    getEditorCommand(commandId) {
        return (this.editorCommands[commandId] || null);
    }
}
Registry.add(Extensions.EditorCommonContributions, EditorContributionRegistry.INSTANCE);
function registerCommand(command) {
    command.register();
    return command;
}
export const UndoCommand = registerCommand(new MultiCommand({
    id: 'undo',
    precondition: undefined,
    kbOpts: {
        weight: 0 /* KeybindingWeight.EditorCore */,
        primary: 2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */
    },
    menuOpts: [{
            menuId: MenuId.MenubarEditMenu,
            group: '1_do',
            title: nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"),
            order: 1
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('undo', "Undo"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: '1_do',
            title: nls.localize('undo', "Undo"),
            order: 1
        }]
}));
registerCommand(new ProxyCommand(UndoCommand, { id: 'default:undo', precondition: undefined }));
export const RedoCommand = registerCommand(new MultiCommand({
    id: 'redo',
    precondition: undefined,
    kbOpts: {
        weight: 0 /* KeybindingWeight.EditorCore */,
        primary: 2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 56 /* KeyCode.KeyZ */],
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 56 /* KeyCode.KeyZ */ }
    },
    menuOpts: [{
            menuId: MenuId.MenubarEditMenu,
            group: '1_do',
            title: nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"),
            order: 2
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('redo', "Redo"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: '1_do',
            title: nls.localize('redo', "Redo"),
            order: 2
        }]
}));
registerCommand(new ProxyCommand(RedoCommand, { id: 'default:redo', precondition: undefined }));
export const SelectAllCommand = registerCommand(new MultiCommand({
    id: 'editor.action.selectAll',
    precondition: undefined,
    kbOpts: {
        weight: 0 /* KeybindingWeight.EditorCore */,
        kbExpr: null,
        primary: 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */
    },
    menuOpts: [{
            menuId: MenuId.MenubarSelectionMenu,
            group: '1_basic',
            title: nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"),
            order: 1
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('selectAll', "Select All"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: '9_select',
            title: nls.localize('selectAll', "Select All"),
            order: 1
        }]
}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxjQUFjLENBQUM7QUFDcEMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRS9DLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUd0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekYsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLDRDQUE0QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQXdCLE1BQU0sZ0RBQWdELENBQUM7QUFDMUgsT0FBTyxFQUFxRSxxQkFBcUIsRUFBeUIsTUFBTSxzREFBc0QsQ0FBQztBQUN2TCxPQUFPLEVBQWdCLG1CQUFtQixFQUFvQixNQUFNLHlEQUF5RCxDQUFDO0FBQzlILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFJeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFB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