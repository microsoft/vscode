/* eslint-disable max-classes-per-file */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { EventEmitter as NodeEventEmitter } from 'events';
import * as vscode from 'vscode';

// export * from './range';
// export * from './position';
// export * from './selection';
export * as vscMockExtHostedTypes from './extHostedTypes';
export * as vscUri from './uri';

const escapeCodiconsRegex = /(\\)?\$\([a-z0-9\-]+?(?:~[a-z0-9\-]*?)?\)/gi;
export function escapeCodicons(text: string): string {
    return text.replace(escapeCodiconsRegex, (match, escaped) => (escaped ? match : `\\${match}`));
}

export class ThemeIcon {
    static readonly File: ThemeIcon;

    static readonly Folder: ThemeIcon;

    constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
    constructor(public readonly id: string) {}
}

export enum ExtensionKind {
    /**
     * Extension runs where the UI runs.
     */
    UI = 1,

    /**
     * Extension runs where the remote extension host runs.
     */
    Workspace = 2,
}

export enum LanguageStatusSeverity {
    Information = 0,
    Warning = 1,
    Error = 2,
}

export enum QuickPickItemKind {
    Separator = -1,
    Default = 0,
}

export class Disposable {
    static from(...disposables: { dispose(): () => void }[]): Disposable {
        return new Disposable(() => {
            if (disposables) {
                for (const disposable of disposables) {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                }

                disposables = [];
            }
        });
    }

    private _callOnDispose: (() => void) | undefined;

    constructor(callOnDispose: () => void) {
        this._callOnDispose = callOnDispose;
    }

    dispose(): void {
        if (typeof this._callOnDispose === 'function') {
            this._callOnDispose();
            this._callOnDispose = undefined;
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace l10n {
    export function t(message: string, ...args: unknown[]): string;
    export function t(options: {
        message: string;
        args?: Array<string | number | boolean> | Record<string, unknown>;
        comment: string | string[];
    }): string;

    export function t(
        message:
            | string
            | {
                  message: string;
                  args?: Array<string | number | boolean> | Record<string, unknown>;
                  comment: string | string[];
              },
        ...args: unknown[]
    ): string {
        let _message = message;
        let _args: unknown[] | Record<string, unknown> | undefined = args;
        if (typeof message !== 'string') {
            _message = message.message;
            _args = message.args ?? args;
        }

        if ((_args as Array<string>).length > 0) {
            return (_message as string).replace(/{(\d+)}/g, (match, number) =>
                (_args as Array<string>)[number] === undefined ? match : (_args as Array<string>)[number],
            );
        }
        return _message as string;
    }
    export const bundle: { [key: string]: string } | undefined = undefined;
    export const uri: vscode.Uri | undefined = undefined;
}

export class EventEmitter<T> implements vscode.EventEmitter<T> {
    public event: vscode.Event<T>;

    public emitter: NodeEventEmitter;

    constructor() {
        this.event = (this.add.bind(this) as unknown) as vscode.Event<T>;
        this.emitter = new NodeEventEmitter();
    }

    public fire(data?: T): void {
        this.emitter.emit('evt', data);
    }

    public dispose(): void {
        this.emitter.removeAllListeners();
    }

    protected add = (
        listener: (e: T) => void,
        _thisArgs?: EventEmitter<T>,
        _disposables?: Disposable[],
    ): Disposable => {
        const bound = _thisArgs ? listener.bind(_thisArgs) : listener;
        this.emitter.addListener('evt', bound);
        return {
            dispose: () => {
                this.emitter.removeListener('evt', bound);
            },
        } as Disposable;
    };
}

export class CancellationToken<T> extends EventEmitter<T> implements vscode.CancellationToken {
    public isCancellationRequested!: boolean;

    public onCancellationRequested: vscode.Event<T>;

    constructor() {
        super();
        this.onCancellationRequested = this.add.bind(this) as vscode.Event<T>;
    }

    public cancel(): void {
        this.isCancellationRequested = true;
        this.fire();
    }
}

export class CancellationTokenSource {
    public token: CancellationToken<unknown>;

    constructor() {
        this.token = new CancellationToken();
    }

    public cancel(): void {
        this.token.cancel();
    }

    public dispose(): void {
        this.token.dispose();
    }
}

export class CodeAction {
    public title: string;

    public edit?: vscode.WorkspaceEdit;

    public diagnostics?: vscode.Diagnostic[];

    public command?: vscode.Command;

    public kind?: CodeActionKind;

    public isPreferred?: boolean;

    constructor(_title: string, _kind?: CodeActionKind) {
        this.title = _title;
        this.kind = _kind;
    }
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    Reference = 17,
    File = 16,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
    User = 25,
    Issue = 26,
}
export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}
export enum IndentAction {
    None = 0,
    Indent = 1,
    IndentOutdent = 2,
    Outdent = 3,
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2,
}

export class MarkdownString {
    public value: string;

    public isTrusted?: boolean;

    public readonly supportThemeIcons?: boolean;

    constructor(value?: string, supportThemeIcons = false) {
        this.value = value ?? '';
        this.supportThemeIcons = supportThemeIcons;
    }

    public static isMarkdownString(thing?: string | MarkdownString | unknown): thing is vscode.MarkdownString {
        if (thing instanceof MarkdownString) {
            return true;
        }
        return (
            thing !== undefined &&
            typeof thing === 'object' &&
            thing !== null &&
            thing.hasOwnProperty('appendCodeblock') &&
            thing.hasOwnProperty('appendMarkdown') &&
            thing.hasOwnProperty('appendText') &&
            thing.hasOwnProperty('value')
        );
    }

    public appendText(value: string): MarkdownString {
        // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
        this.value += (this.supportThemeIcons ? escapeCodicons(value) : value)
            .replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&')
            .replace(/\n/g, '\n\n');

        return this;
    }

    public appendMarkdown(value: string): MarkdownString {
        this.value += value;

        return this;
    }

    public appendCodeblock(code: string, language = ''): MarkdownString {
        this.value += '\n```';
        this.value += language;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }
}

export class Hover {
    public contents: vscode.MarkdownString[] | vscode.MarkedString[];

    public range: vscode.Range | undefined;

    constructor(
        contents: vscode.MarkdownString | vscode.MarkedString | vscode.MarkdownString[] | vscode.MarkedString[],
        range?: vscode.Range,
    ) {
        if (!contents) {
            throw new Error('Illegal argument, contents must be defined');
        }
        if (Array.isArray(contents)) {
            this.contents = <vscode.MarkdownString[] | vscode.MarkedString[]>contents;
        } else if (MarkdownString.isMarkdownString(contents)) {
            this.contents = [contents];
        } else {
            this.contents = [contents];
        }
        this.range = range;
    }
}

export class CodeActionKind {
    public static readonly Empty: CodeActionKind = new CodeActionKind('empty');

    public static readonly QuickFix: CodeActionKind = new CodeActionKind('quick.fix');

    public static readonly Refactor: CodeActionKind = new CodeActionKind('refactor');

    public static readonly RefactorExtract: CodeActionKind = new CodeActionKind('refactor.extract');

    public static readonly RefactorInline: CodeActionKind = new CodeActionKind('refactor.inline');

    public static readonly RefactorMove: CodeActionKind = new CodeActionKind('refactor.move');

    public static readonly RefactorRewrite: CodeActionKind = new CodeActionKind('refactor.rewrite');

    public static readonly Source: CodeActionKind = new CodeActionKind('source');

    public static readonly SourceOrganizeImports: CodeActionKind = new CodeActionKind('source.organize.imports');

    public static readonly SourceFixAll: CodeActionKind = new CodeActionKind('source.fix.all');

    public static readonly Notebook: CodeActionKind = new CodeActionKind('notebook');

    private constructor(private _value: string) {}

    public append(parts: string): CodeActionKind {
        return new CodeActionKind(`${this._value}.${parts}`);
    }

    public intersects(other: CodeActionKind): boolean {
        return this._value.includes(other._value) || other._value.includes(this._value);
    }

    public contains(other: CodeActionKind): boolean {
        return this._value.startsWith(other._value);
    }

    public get value(): string {
        return this._value;
    }
}

export interface DebugAdapterExecutableOptions {
    env?: { [key: string]: string };
    cwd?: string;
}

export class DebugAdapterServer {
    constructor(public readonly port: number, public readonly host?: string) {}
}
export class DebugAdapterExecutable {
    constructor(
        public readonly command: string,
        public readonly args: string[] = [],
        public readonly options?: DebugAdapterExecutableOptions,
    ) {}
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export enum UIKind {
    Desktop = 1,
    Web = 2,
}

export class InlayHint {
    tooltip?: string | MarkdownString | undefined;

    textEdits?: vscode.TextEdit[];

    paddingLeft?: boolean;

    paddingRight?: boolean;

    constructor(
        public position: vscode.Position,
        public label: string | vscode.InlayHintLabelPart[],
        public kind?: vscode.InlayHintKind,
    ) {}
}

export enum LogLevel {
    /**
     * No messages are logged with this level.
     */
    Off = 0,

    /**
     * All messages are logged with this level.
     */
    Trace = 1,

    /**
     * Messages with debug and higher log level are logged with this level.
     */
    Debug = 2,

    /**
     * Messages with info and higher log level are logged with this level.
     */
    Info = 3,

    /**
     * Messages with warning and higher log level are logged with this level.
     */
    Warning = 4,

    /**
     * Only error messages are logged with this level.
     */
    Error = 5,
}

export class TestMessage {
    /**
     * Human-readable message text to display.
     */
    message: string | MarkdownString;

    /**
     * Expected test output. If given with {@link TestMessage.actualOutput actualOutput }, a diff view will be shown.
     */
    expectedOutput?: string;

    /**
     * Actual test output. If given with {@link TestMessage.expectedOutput expectedOutput }, a diff view will be shown.
     */
    actualOutput?: string;

    /**
     * Associated file location.
     */
    location?: vscode.Location;

    /**
     * Creates a new TestMessage that will present as a diff in the editor.
     * @param message Message to display to the user.
     * @param expected Expected output.
     * @param actual Actual output.
     */
    static diff(message: string | MarkdownString, expected: string, actual: string): TestMessage {
        const testMessage = new TestMessage(message);
        testMessage.expectedOutput = expected;
        testMessage.actualOutput = actual;
        return testMessage;
    }

    /**
     * Creates a new TestMessage instance.
     * @param message The message to show to the user.
     */
    constructor(message: string | MarkdownString) {
        this.message = message;
    }
}

export interface TestItemCollection extends Iterable<[string, vscode.TestItem]> {
    /**
     * Gets the number of items in the collection.
     */
    readonly size: number;

    /**
     * Replaces the items stored by the collection.
     * @param items Items to store.
     */
    replace(items: readonly vscode.TestItem[]): void;

    /**
     * Iterate over each entry in this collection.
     *
     * @param callback Function to execute for each entry.
     * @param thisArg The `this` context used when invoking the handler function.
     */
    forEach(callback: (item: vscode.TestItem, collection: TestItemCollection) => unknown, thisArg?: unknown): void;

    /**
     * Adds the test item to the children. If an item with the same ID already
     * exists, it'll be replaced.
     * @param item Item to add.
     */
    add(item: vscode.TestItem): void;

    /**
     * Removes a single test item from the collection.
     * @param itemId Item ID to delete.
     */
    delete(itemId: string): void;

    /**
     * Efficiently gets a test item by ID, if it exists, in the children.
     * @param itemId Item ID to get.
     * @returns The found item or undefined if it does not exist.
     */
    get(itemId: string): vscode.TestItem | undefined;
}

/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export class Location {
    /**
     * The resource identifier of this location.
     */
    uri: vscode.Uri;

    /**
     * The document range of this location.
     */
    range: vscode.Range;

    /**
     * Creates a new location object.
     *
     * @param uri The resource identifier.
     * @param rangeOrPosition The range or position. Positions will be converted to an empty range.
     */
    constructor(uri: vscode.Uri, rangeOrPosition: vscode.Range) {
        this.uri = uri;
        this.range = rangeOrPosition;
    }
}

/**
 * The kind of executions that {@link TestRunProfile TestRunProfiles} control.
 */
export enum TestRunProfileKind {
    /**
     * The `Run` test profile kind.
     */
    Run = 1,
    /**
     * The `Debug` test profile kind.
     */
    Debug = 2,
    /**
     * The `Coverage` test profile kind.
     */
    Coverage = 3,
}
