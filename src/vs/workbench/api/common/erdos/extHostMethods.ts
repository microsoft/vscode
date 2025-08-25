/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extHostProtocol from './extHost.erdos.protocol.js';
import { ExtHostEditors } from '../extHostTextEditors.js';
import { ExtHostDocuments } from '../extHostDocuments.js';
import { ExtHostWorkspace } from '../extHostWorkspace.js';
import { ExtHostQuickOpen } from '../extHostQuickOpen.js';
import { ExtHostCommands } from '..//extHostCommands.js';
import { ExtHostModalDialogs } from '../erdos/extHostModalDialogs.js';
import { ExtHostContextKeyService } from '../erdos/extHostContextKeyService.js';
import { ExtHostLanguageRuntime } from '../erdos/extHostLanguageRuntime.js';
import { UiFrontendRequest, EditorContext, Range as UIRange } from '../../../services/languageRuntime/common/erdosUiComm.js';
import { JsonRpcErrorCode } from '../../../services/languageRuntime/common/erdosBaseComm.js';
import { Range } from '../extHostTypes.js';
import { EndOfLine, TextEditorOpenOptions } from '../extHostTypeConverters.js';

type JsonRpcResponse = JsonRpcResult | JsonRpcError;

interface JsonRpcResult {
	result: any;
}
interface JsonRpcError {
	error: JsonRpcErrorData;
}

interface JsonRpcErrorData {
	/** An error code */
	code: JsonRpcErrorCode;

	/** A human-readable error message */
	message: string;

	/** Additional error information (optional) */
	data?: any;
}

export class ExtHostMethods implements extHostProtocol.ExtHostMethodsShape {
	constructor(
		_mainContext: extHostProtocol.IMainErdosContext,
		private readonly editors: ExtHostEditors,
		private readonly documents: ExtHostDocuments,
		private readonly dialogs: ExtHostModalDialogs,
		private readonly runtime: ExtHostLanguageRuntime,
		private readonly workspace: ExtHostWorkspace,
		private readonly quickOpen: ExtHostQuickOpen,
		private readonly commands: ExtHostCommands,
		private readonly contextKeys: ExtHostContextKeyService
	) {
	}

	// Parses arguments and calls relevant method. Does not throw, returns
	// JSON-RPC error responses instead.
	async call(extensionId: string, method: UiFrontendRequest, params: Record<string, any>): Promise<JsonRpcResponse> {
		try {
			if (!Object.values(UiFrontendRequest).includes(method)) {
				return <JsonRpcError>{
					error: {
						code: JsonRpcErrorCode.MethodNotFound,
						message: `Can't find method ${method}`,
					}
				};
			}

			// TODO: Use a library or write our own tool to type-check
			// arguments according to the OpenRPC schema

			let result;
			switch (method) {
				case UiFrontendRequest.LastActiveEditorContext: {
					if (params && Object.keys(params).length > 0) {
						return newInvalidParamsError(method);
					}
					result = await this.lastActiveEditorContext();
					break;
				}
				case UiFrontendRequest.ModifyEditorSelections: {
					if (!params ||
						!Object.keys(params).includes('selections') ||
						!Object.keys(params).includes('values')) {
						return newInvalidParamsError(method);
					}
					const sel = params.selections as UIRange[];
					const selections = sel.map(s =>
						new Range(s.start.line, s.start.character, s.end.line, s.end.character));
					result = await this.modifyEditorLocations(selections, params.values as string[]);
					break;
				}
				case UiFrontendRequest.WorkspaceFolder: {
					if (params && Object.keys(params).length > 0) {
						return newInvalidParamsError(method);
					}
					result = await this.workspaceFolder();
					break;
				}
				case UiFrontendRequest.NewDocument: {
					if (!params ||
						!Object.keys(params).includes('contents') ||
						!Object.keys(params).includes('language_id')) {
						return newInvalidParamsError(method);
					}
					result = await this.createDocument(params.contents as string,
						params.language_id as string);
					break;
				}
				case UiFrontendRequest.ExecuteCommand: {
					if (!params || !Object.keys(params).includes('command')) {
						return newInvalidParamsError(method);
					}
					result = await this.executeCommand(params.command as string);
					break;
				}
				case UiFrontendRequest.ShowQuestion: {
					if (!params ||
						!Object.keys(params).includes('title') ||
						!Object.keys(params).includes('message') ||
						!Object.keys(params).includes('ok_button_title') ||
						!Object.keys(params).includes('cancel_button_title')) {
						return newInvalidParamsError(method);
					}
					result = await this.showQuestion(params.title as string,
						params.message as string,
						params.ok_button_title as string,
						params.cancel_button_title as string);
					break;
				}
				case UiFrontendRequest.ShowDialog: {
					if (!params ||
						!Object.keys(params).includes('title') ||
						!Object.keys(params).includes('message')) {
						return newInvalidParamsError(method);
					}
					result = await this.showDialog(params.title as string,
						params.message as string);
					break;
				}
				case UiFrontendRequest.AskForPassword: {
					if (!params || !Object.keys(params).includes('prompt')) {
						return newInvalidParamsError(method);
					}
					result = await this.askForPassword(params.prompt as string);
					break;
				}
				case UiFrontendRequest.ExecuteCode: {
					if (!params ||
						!Object.keys(params).includes('language_id') ||
						!Object.keys(params).includes('code') ||
						!Object.keys(params).includes('focus') ||
						!Object.keys(params).includes('allow_incomplete')) {
						return newInvalidParamsError(method);
					}
					result = await this.executeCode(params.language_id as string,
						params.code as string,
						extensionId,
						params.focus as boolean,
						params.allow_incomplete as boolean);
					break;
				}
				case UiFrontendRequest.EvaluateWhenClause: {
					if (!params || !Object.keys(params).includes('when_clause')) {
						return newInvalidParamsError(method);
					}
					result = await this.evaluateWhenClause(params.when_clause as string);
					break;
				}
				case UiFrontendRequest.DebugSleep: {
					if (!params || !Object.keys(params).includes('ms')) {
						return newInvalidParamsError(method);
					}
					result = await this.debugSleep(params.ms as number);
					break;
				}
			}

			return <JsonRpcResult>({ result });
		} catch (e) {
			return <JsonRpcError>{
				error: {
					code: JsonRpcErrorCode.InternalError,
					message: `Internal error: ${e}`,
				}
			};
		}
	}

	async lastActiveEditorContext(): Promise<EditorContext | null> {
		const editor = this.editors.getActiveTextEditor();
		if (!editor) {
			return null;
		}

		// The selections in this text editor. The primary selection is always at index 0.
		//
		// The gymnastics here are so that we return character positions with respect to
		// Unicode code points. Otherwise, the native Position type provides offsets with respect to
		// UTF-16 encoded text. That would be confusing for downstream consumers, who probably
		// ultimately receive this text as UTF-8 and want to operate on this text in terms of
		// as user-perceivable "characters". This only matters when the selection's neighborhood
		// includes Unicode characters in the astral plane.
		//
		// Another resource that supports that what I'm doing here is desirable in Jupyter-land:
		// https://jupyter-client.readthedocs.io/en/latest/messaging.html#notes
		const selections = editor.selections.map(selection => {
			const lineTextBeforeActive = editor.document
				.lineAt(selection.active.line)
				.text.substring(0, selection.active.character);
			const unicodePointsBeforeActive = Array.from(lineTextBeforeActive).length;

			const lineTextBeforeStart = editor.document
				.lineAt(selection.start.line)
				.text.substring(0, selection.start.character);
			const unicodePointsBeforeStart = Array.from(lineTextBeforeStart).length;

			const text = editor.document.getText(selection);

			const lineTextBeforeEnd = editor.document
				.lineAt(selection.end.line)
				.text.substring(0, selection.end.character);
			const unicodePointsInSelectionEnd = Array.from(lineTextBeforeEnd).length;

			return {
				active: { line: selection.active.line, character: unicodePointsBeforeActive },
				start: { line: selection.start.line, character: unicodePointsBeforeStart },
				end: { line: selection.end.line, character: unicodePointsInSelectionEnd },
				text: text
			};
		});

		// it's surprisingly fiddly to finesse this vscode.EndOfLife enum, which we don't have
		// direct access to here
		const eolSequenceEnum = EndOfLine.from(editor.document.eol);
		const eolSequence = eolSequenceEnum === 0 ? '\n' : '\r\n';
		const documentText = editor.document.getText();
		const lines = documentText.split(eolSequence);

		return {
			document: {
				path: editor.document.fileName,
				eol: eolSequence,
				is_closed: editor.document.isClosed,
				is_dirty: editor.document.isDirty,
				is_untitled: editor.document.isUntitled,
				language_id: editor.document.languageId,
				line_count: editor.document.lineCount,
				version: editor.document.version,
			},
			contents: lines,
			// The primary selection in this text editor. Shorthand for `TextEditor.selections[0]`.
			selection: selections[0],
			selections: selections
		};
	}

	async modifyEditorLocations(locations: Range[], values: string[]): Promise<null> {
		const editor = this.editors.getActiveTextEditor();
		if (!editor) {
			return null;
		}

		editor.edit(editBuilder => {
			locations.map((location, i) => {
				editBuilder.replace(location, values[i]);
			});
		});

		return null;
	}

	async workspaceFolder(): Promise<string | null> {
		const folders = this.workspace.getWorkspaceFolders();
		if (folders && folders.length > 0) {
			return folders[0].uri.fsPath;
		}
		return null;
	}

	async showDialog(title: string, message: string): Promise<null> {
		return this.dialogs.showSimpleModalDialogMessage(title, message);
	}

	async createDocument(contents: string, languageId: string): Promise<null> {
		const uri = await this.documents.createDocumentData({
			content: contents,
			language: languageId,
		});
		const documentData = await this.documents.ensureDocumentData(uri);

		const opts: TextEditorOpenOptions = { preview: true };
		await this.editors.showTextDocument(documentData.document, opts);

		// TODO: Return a document ID
		return null;
	}

	async executeCommand(commandId: string): Promise<any> {
		const result = await this.commands.executeCommand(commandId);
		if (result === undefined) {
			// If result is undefined, it probably means that the command is a `void` function
			// and we should return null.
			return null;
		}
		return result;
	}

	async showQuestion(title: string, message: string, okButtonTitle: string, cancelButtonTitle: string): Promise<boolean> {
		return this.dialogs.showSimpleModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
	}

	async askForPassword(prompt: string): Promise<string | null> {
		const result = await this.quickOpen.showInput({ password: true, title: prompt });
		if (result === undefined) {
			return null;
		}
		return result;
	}

	async executeCode(languageId: string, code: string, extensionId: string, focus: boolean, allowIncomplete?: boolean): Promise<Record<string, any>> {
		return this.runtime.executeCode(languageId, code, extensionId, focus, allowIncomplete);
	}

	async evaluateWhenClause(whenClause: string): Promise<boolean> {
		return this.contextKeys.evaluateWhenClause(whenClause);
	}

	async debugSleep(ms: number): Promise<null> {
		await delay(ms);
		return null;
	}
}


/* Utils */

function newInvalidParamsError(method: UiFrontendRequest) {
	return <JsonRpcError>{
		error: {
			code: JsonRpcErrorCode.InvalidParams,
			message: `Unexpected arguments for '${method}'`,
		}
	};
}

async function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}



