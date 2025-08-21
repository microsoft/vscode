/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

import { PlotRenderSettings } from './erdosPlotComm.js';

export interface Param {
	[k: string]: unknown;
}

export interface CallMethodResult {
	[k: string]: unknown;
}

export interface DidChangePlotsRenderSettingsParams {
	settings: PlotRenderSettings;
}

export interface CallMethodParams {
	method: string;
	params: Array<Param>;
}

export interface EditorContext {
	document: TextDocument;
	contents: Array<string>;
	selection: Selection;
	selections: Array<Selection>;
}

export interface TextDocument {
	path: string;
	eol: string;
	is_closed: boolean;
	is_dirty: boolean;
	is_untitled: boolean;
	language_id: string;
	line_count: number;
	version: number;
}

export interface Position {
	character: number;
	line: number;
}

export interface Selection {
	active: Position;
	start: Position;
	end: Position;
	text: string;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface BusyParams {
	busy: boolean;
}

export interface OpenEditorParams {
	file: string;
	line: number;
	column: number;
}

export interface NewDocumentParams {
	contents: string;
	language_id: string;
}

export interface ShowMessageParams {
	message: string;
}

export interface ShowQuestionParams {
	title: string;
	message: string;
	ok_button_title: string;
	cancel_button_title: string;
}

export interface ShowDialogParams {
	title: string;
	message: string;
}

export interface AskForPasswordParams {
	prompt: string;
}

export interface PromptStateParams {
	input_prompt: string;
	continuation_prompt: string;
}

export interface WorkingDirectoryParams {
	directory: string;
}

export interface DebugSleepParams {
	ms: number;
}

export interface ExecuteCommandParams {
	command: string;
}

export interface EvaluateWhenClauseParams {
	when_clause: string;
}

export interface ExecuteCodeParams {
	language_id: string;
	code: string;
	focus: boolean;
	allow_incomplete: boolean;
}

export interface OpenWorkspaceParams {
	path: string;
	new_window: boolean;
}

export interface SetEditorSelectionsParams {
	selections: Array<Range>;
}

export interface ModifyEditorSelectionsParams {
	selections: Array<Range>;
	values: Array<string>;
}

export interface ShowUrlParams {
	url: string;
}

export interface ShowHtmlFileParams {
	path: string;
	title: string;
	is_plot: boolean;
	height: number;
}

export interface OpenWithSystemParams {
	path: string;
}

export interface BusyEvent {
	busy: boolean;
}

export interface ClearConsoleEvent {
}

export interface OpenEditorEvent {
	file: string;
	line: number;
	column: number;
}

export interface ShowMessageEvent {
	message: string;
}

export interface PromptStateEvent {
	input_prompt: string;
	continuation_prompt: string;
}

export interface WorkingDirectoryEvent {
	directory: string;
}

export interface OpenWorkspaceEvent {
	path: string;
	new_window: boolean;
}

export interface SetEditorSelectionsEvent {
	selections: Array<Range>;
}

export interface ShowUrlEvent {
	url: string;
}

export interface ShowHtmlFileEvent {
	path: string;
	title: string;
	is_plot: boolean;
	height: number;
}

export interface OpenWithSystemEvent {
	path: string;
}

export interface ClearWebviewPreloadsEvent {
}

export interface NewDocumentRequest {
	contents: string;
	language_id: string;
}

export interface ShowQuestionRequest {
	title: string;
	message: string;
	ok_button_title: string;
	cancel_button_title: string;
}

export interface ShowDialogRequest {
	title: string;
	message: string;
}

export interface AskForPasswordRequest {
	prompt: string;
}

export interface DebugSleepRequest {
	ms: number;
}

export interface ExecuteCommandRequest {
	command: string;
}

export interface EvaluateWhenClauseRequest {
	when_clause: string;
}

export interface ExecuteCodeRequest {
	language_id: string;
	code: string;
	focus: boolean;
	allow_incomplete: boolean;
}

export interface WorkspaceFolderRequest {
}

export interface ModifyEditorSelectionsRequest {
	selections: Array<Range>;
	values: Array<string>;
}

export interface LastActiveEditorContextRequest {
}

export enum UiFrontendEvent {
	Busy = 'busy',
	ClearConsole = 'clear_console',
	OpenEditor = 'open_editor',
	ShowMessage = 'show_message',
	PromptState = 'prompt_state',
	WorkingDirectory = 'working_directory',
	OpenWorkspace = 'open_workspace',
	SetEditorSelections = 'set_editor_selections',
	ShowUrl = 'show_url',
	ShowHtmlFile = 'show_html_file',
	OpenWithSystem = 'open_with_system',
	ClearWebviewPreloads = 'clear_webview_preloads'
}

export enum UiFrontendRequest {
	NewDocument = 'new_document',
	ShowQuestion = 'show_question',
	ShowDialog = 'show_dialog',
	AskForPassword = 'ask_for_password',
	DebugSleep = 'debug_sleep',
	ExecuteCommand = 'execute_command',
	EvaluateWhenClause = 'evaluate_when_clause',
	ExecuteCode = 'execute_code',
	WorkspaceFolder = 'workspace_folder',
	ModifyEditorSelections = 'modify_editor_selections',
	LastActiveEditorContext = 'last_active_editor_context'
}

export enum UiBackendRequest {
	DidChangePlotsRenderSettings = 'did_change_plots_render_settings',
	CallMethod = 'call_method'
}

export class ErdosUiComm extends ErdosBaseComm {
	constructor(
		instance: IRuntimeClientInstance<any, any>,
		options?: ErdosCommOptions<UiBackendRequest>,
	) {
		super(instance, options);
		this.onDidBusy = super.createEventEmitter('busy', ['busy']);
		this.onDidClearConsole = super.createEventEmitter('clear_console', []);
		this.onDidOpenEditor = super.createEventEmitter('open_editor', ['file', 'line', 'column']);
		this.onDidShowMessage = super.createEventEmitter('show_message', ['message']);
		this.onDidPromptState = super.createEventEmitter('prompt_state', ['input_prompt', 'continuation_prompt']);
		this.onDidWorkingDirectory = super.createEventEmitter('working_directory', ['directory']);
		this.onDidOpenWorkspace = super.createEventEmitter('open_workspace', ['path', 'new_window']);
		this.onDidSetEditorSelections = super.createEventEmitter('set_editor_selections', ['selections']);
		this.onDidShowUrl = super.createEventEmitter('show_url', ['url']);
		this.onDidShowHtmlFile = super.createEventEmitter('show_html_file', ['path', 'title', 'is_plot', 'height']);
		this.onDidOpenWithSystem = super.createEventEmitter('open_with_system', ['path']);
		this.onDidClearWebviewPreloads = super.createEventEmitter('clear_webview_preloads', []);
	}

	didChangePlotsRenderSettings(settings: PlotRenderSettings): Promise<null> {
		return super.performRpc('did_change_plots_render_settings', ['settings'], [settings]);
	}

	callMethod(method: string, params: Array<Param>): Promise<CallMethodResult> {
		return super.performRpc('call_method', ['method', 'params'], [method, params]);
	}

	onDidBusy: Event<BusyEvent>;
	onDidClearConsole: Event<ClearConsoleEvent>;
	onDidOpenEditor: Event<OpenEditorEvent>;
	onDidShowMessage: Event<ShowMessageEvent>;
	onDidPromptState: Event<PromptStateEvent>;
	onDidWorkingDirectory: Event<WorkingDirectoryEvent>;
	onDidOpenWorkspace: Event<OpenWorkspaceEvent>;
	onDidSetEditorSelections: Event<SetEditorSelectionsEvent>;
	onDidShowUrl: Event<ShowUrlEvent>;
	onDidShowHtmlFile: Event<ShowHtmlFileEvent>;
	onDidOpenWithSystem: Event<OpenWithSystemEvent>;
	onDidClearWebviewPreloads: Event<ClearWebviewPreloadsEvent>;
}
