/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { assertNever, softAssertNever } from '../../../../base/common/assert.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ChatElicitationRequestPart } from '../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../chat/common/chatModel.js';
import { ElicitationState, IChatService } from '../../chat/common/chatService.js';
import { LocalChatSessionUri } from '../../chat/common/chatUri.js';
import { ElicitationKind, ElicitResult, IFormModeElicitResult, IMcpElicitationService, IMcpServer, IMcpToolCallContext, IUrlModeElicitResult, McpConnectionState, MpcResponseError } from '../common/mcpTypes.js';
import { mcpServerToSourceData } from '../common/mcpTypesUtils.js';
import { MCP } from '../common/modelContextProtocol.js';

const noneItem: IQuickPickItem = { id: undefined, label: localize('mcp.elicit.enum.none', 'None'), description: localize('mcp.elicit.enum.none.description', 'No selection'), alwaysShow: true };

type Pre20251125ElicitationParams = Omit<MCP.ElicitRequestFormParams, 'mode'> & { mode?: undefined };

function isFormElicitation(params: MCP.ElicitRequest['params'] | Pre20251125ElicitationParams): params is (MCP.ElicitRequestFormParams | Pre20251125ElicitationParams) {
	return params.mode === 'form' || (params.mode === undefined && !!(params as Pre20251125ElicitationParams).requestedSchema);
}

function isUrlElicitation(params: MCP.ElicitRequest['params']): params is MCP.ElicitRequestURLParams {
	return params.mode === 'url';
}

function isLegacyTitledEnumSchema(schema: MCP.PrimitiveSchemaDefinition): schema is MCP.LegacyTitledEnumSchema & { enumNames: string[] } {
	const cast = schema as MCP.LegacyTitledEnumSchema;
	return cast.type === 'string' && Array.isArray(cast.enum) && Array.isArray(cast.enumNames);
}

function isUntitledEnumSchema(schema: MCP.PrimitiveSchemaDefinition): schema is MCP.LegacyTitledEnumSchema | MCP.UntitledSingleSelectEnumSchema {
	const cast = schema as MCP.LegacyTitledEnumSchema | MCP.UntitledSingleSelectEnumSchema;
	return cast.type === 'string' && Array.isArray(cast.enum);
}

function isTitledSingleEnumSchema(schema: MCP.PrimitiveSchemaDefinition): schema is MCP.TitledSingleSelectEnumSchema {
	const cast = schema as MCP.TitledSingleSelectEnumSchema;
	return cast.type === 'string' && Array.isArray(cast.oneOf);
}

function isUntitledMultiEnumSchema(schema: MCP.PrimitiveSchemaDefinition): schema is MCP.UntitledMultiSelectEnumSchema {
	const cast = schema as MCP.UntitledMultiSelectEnumSchema;
	return cast.type === 'array' && !!cast.items?.enum;
}

function isTitledMultiEnumSchema(schema: MCP.PrimitiveSchemaDefinition): schema is MCP.TitledMultiSelectEnumSchema {
	const cast = schema as MCP.TitledMultiSelectEnumSchema;
	return cast.type === 'array' && !!cast.items?.anyOf;
}

export class McpElicitationService implements IMcpElicitationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IChatService private readonly _chatService: IChatService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	public elicit(server: IMcpServer, context: IMcpToolCallContext | undefined, elicitation: MCP.ElicitRequest['params'], token: CancellationToken): Promise<ElicitResult> {
		if (isFormElicitation(elicitation)) {
			return this._elicitForm(server, context, elicitation, token);
		} else if (isUrlElicitation(elicitation)) {
			return this._elicitUrl(server, context, elicitation, token);
		} else {
			softAssertNever(elicitation);
			return Promise.reject(new MpcResponseError('Unsupported elicitation type', MCP.INVALID_PARAMS, undefined));
		}
	}

	private async _elicitForm(server: IMcpServer, context: IMcpToolCallContext | undefined, elicitation: MCP.ElicitRequestFormParams | Pre20251125ElicitationParams, token: CancellationToken): Promise<IFormModeElicitResult> {
		const store = new DisposableStore();
		const value = await new Promise<MCP.ElicitResult>(resolve => {
			const chatModel = context?.chatSessionId && this._chatService.getSession(LocalChatSessionUri.forSession(context.chatSessionId));
			if (chatModel instanceof ChatModel) {
				const request = chatModel.getRequests().at(-1);
				if (request) {
					const part = new ChatElicitationRequestPart(
						localize('mcp.elicit.title', 'Request for Input'),
						elicitation.message,
						localize('msg.subtitle', "{0} (MCP Server)", server.definition.label),
						localize('mcp.elicit.accept', 'Respond'),
						localize('mcp.elicit.reject', 'Cancel'),
						async () => {
							const p = this._doElicitForm(elicitation, token);
							resolve(p);
							const result = await p;
							part.acceptedResult = result.content;
							return result.action === 'accept' ? ElicitationState.Accepted : ElicitationState.Rejected;
						},
						() => {
							resolve({ action: 'decline' });
							return Promise.resolve(ElicitationState.Rejected);
						},
						mcpServerToSourceData(server),
					);
					chatModel.acceptResponseProgress(request, part);
				}
			} else {
				const handle = this._notificationService.notify({
					message: elicitation.message,
					source: localize('mcp.elicit.source', 'MCP Server ({0})', server.definition.label),
					severity: Severity.Info,
					actions: {
						primary: [store.add(new Action('mcp.elicit.give', localize('mcp.elicit.give', 'Respond'), undefined, true, () => resolve(this._doElicitForm(elicitation, token))))],
						secondary: [store.add(new Action('mcp.elicit.cancel', localize('mcp.elicit.cancel', 'Cancel'), undefined, true, () => resolve({ action: 'decline' })))],
					}
				});
				store.add(handle.onDidClose(() => resolve({ action: 'cancel' })));
				store.add(token.onCancellationRequested(() => resolve({ action: 'cancel' })));
			}

		}).finally(() => store.dispose());

		return { kind: ElicitationKind.Form, value, dispose: () => { } };
	}

	private async _elicitUrl(server: IMcpServer, context: IMcpToolCallContext | undefined, elicitation: MCP.ElicitRequestURLParams, token: CancellationToken): Promise<IUrlModeElicitResult> {
		const promiseStore = new DisposableStore();

		// We create this ahead of time in case e.g. a user manually opens the URL beforehand
		const completePromise = new Promise<void>((resolve, reject) => {
			promiseStore.add(token.onCancellationRequested(() => reject(new CancellationError())));
			promiseStore.add(autorun(reader => {
				const cnx = server.connection.read(reader);
				const handler = cnx?.handler.read(reader);
				if (handler) {
					reader.store.add(handler.onDidReceiveElicitationCompleteNotification(e => {
						if (e.params.elicitationId === elicitation.elicitationId) {
							resolve();
						}
					}));
				} else if (!McpConnectionState.isRunning(server.connectionState.read(reader))) {
					reject(new CancellationError());
				}
			}));
		}).finally(() => promiseStore.dispose());

		const store = new DisposableStore();
		const value = await new Promise<MCP.ElicitResult>(resolve => {
			const chatModel = context?.chatSessionId && this._chatService.getSession(LocalChatSessionUri.forSession(context.chatSessionId));
			if (chatModel instanceof ChatModel) {
				const request = chatModel.getRequests().at(-1);
				if (request) {
					const part = new ChatElicitationRequestPart(
						localize('mcp.elicit.url.title', 'Authorization Required'),
						new MarkdownString().appendText(elicitation.message)
							.appendMarkdown('\n\n' + localize('mcp.elicit.url.instruction', 'Open this URL?'))
							.appendCodeblock('', elicitation.url),
						localize('msg.subtitle', "{0} (MCP Server)", server.definition.label),
						localize('mcp.elicit.url.open', 'Open {0}', URI.parse(elicitation.url).authority),
						localize('mcp.elicit.reject', 'Cancel'),
						async () => {
							const result = await this._doElicitUrl(elicitation, token);
							resolve(result);
							completePromise.then(() => part.hide());
							return result.action === 'accept' ? ElicitationState.Accepted : ElicitationState.Rejected;
						},
						() => {
							resolve({ action: 'decline' });
							return Promise.resolve(ElicitationState.Rejected);
						},
						mcpServerToSourceData(server),
					);
					chatModel.acceptResponseProgress(request, part);
				}
			} else {
				const handle = this._notificationService.notify({
					message: elicitation.message + ' ' + localize('mcp.elicit.url.instruction2', 'This will open {0}', elicitation.url),
					source: localize('mcp.elicit.source', 'MCP Server ({0})', server.definition.label),
					severity: Severity.Info,
					actions: {
						primary: [store.add(new Action('mcp.elicit.url.open2', localize('mcp.elicit.url.open2', 'Open URL'), undefined, true, () => resolve(this._doElicitUrl(elicitation, token))))],
						secondary: [store.add(new Action('mcp.elicit.cancel', localize('mcp.elicit.cancel', 'Cancel'), undefined, true, () => resolve({ action: 'decline' })))],
					}
				});
				store.add(handle.onDidClose(() => resolve({ action: 'cancel' })));
				store.add(token.onCancellationRequested(() => resolve({ action: 'cancel' })));
			}
		}).finally(() => store.dispose());

		return {
			kind: ElicitationKind.URL,
			value,
			wait: completePromise,
			dispose: () => promiseStore.dispose(),
		};
	}

	private async _doElicitUrl(elicitation: MCP.ElicitRequestURLParams, token: CancellationToken): Promise<MCP.ElicitResult> {
		if (token.isCancellationRequested) {
			return { action: 'cancel' };
		}

		try {
			if (await this._openerService.open(elicitation.url, { allowCommands: false })) {
				return { action: 'accept' };
			}
		} catch {
			// ignored
		}

		return { action: 'decline' };
	}

	private async _doElicitForm(elicitation: MCP.ElicitRequestFormParams | Pre20251125ElicitationParams, token: CancellationToken): Promise<MCP.ElicitResult> {
		const quickPick = this._quickInputService.createQuickPick<IQuickPickItem>();
		const store = new DisposableStore();

		try {
			const properties = Object.entries(elicitation.requestedSchema.properties);
			const requiredFields = new Set(elicitation.requestedSchema.required || []);
			const results: Record<string, string | number | boolean | string[]> = {};
			const backSnapshots: { value: string; validationMessage?: string }[] = [];

			quickPick.title = elicitation.message;
			quickPick.totalSteps = properties.length;
			quickPick.ignoreFocusOut = true;

			for (let i = 0; i < properties.length; i++) {
				const [propertyName, schema] = properties[i];
				const isRequired = requiredFields.has(propertyName);
				const restore = backSnapshots.at(i);

				store.clear();
				quickPick.step = i + 1;
				quickPick.title = schema.title || propertyName;
				quickPick.placeholder = this._getFieldPlaceholder(schema, isRequired);
				quickPick.value = restore?.value ?? '';
				quickPick.validationMessage = '';
				quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];

				let result: { type: 'value'; value: string | number | boolean | undefined | string[] } | { type: 'back' } | { type: 'cancel' };
				if (schema.type === 'boolean') {
					result = await this._handleEnumField(quickPick, { enum: [{ const: 'true' }, { const: 'false' }], default: schema.default ? String(schema.default) : undefined }, isRequired, store, token);
					if (result.type === 'value') { result.value = result.value === 'true' ? true : false; }
				} else if (isLegacyTitledEnumSchema(schema)) {
					result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v, i) => ({ const: v, title: schema.enumNames[i] })), default: schema.default }, isRequired, store, token);
				} else if (isUntitledEnumSchema(schema)) {
					result = await this._handleEnumField(quickPick, { enum: schema.enum.map(v => ({ const: v })), default: schema.default }, isRequired, store, token);
				} else if (isTitledSingleEnumSchema(schema)) {
					result = await this._handleEnumField(quickPick, { enum: schema.oneOf, default: schema.default }, isRequired, store, token);
				} else if (isTitledMultiEnumSchema(schema)) {
					result = await this._handleMultiEnumField(quickPick, { enum: schema.items.anyOf, default: schema.default }, isRequired, store, token);
				} else if (isUntitledMultiEnumSchema(schema)) {
					result = await this._handleMultiEnumField(quickPick, { enum: schema.items.enum.map(v => ({ const: v })), default: schema.default }, isRequired, store, token);
				} else {
					result = await this._handleInputField(quickPick, schema, isRequired, store, token);
					if (result.type === 'value' && (schema.type === 'number' || schema.type === 'integer')) {
						result.value = Number(result.value);
					}
				}

				if (result.type === 'back') {
					i -= 2;
					continue;
				}
				if (result.type === 'cancel') {
					return { action: 'cancel' };
				}

				backSnapshots[i] = { value: quickPick.value };

				if (result.value === undefined) {
					delete results[propertyName];
				} else {
					results[propertyName] = result.value;
				}
			}

			return {
				action: 'accept',
				content: results,
			};
		} finally {
			store.dispose();
			quickPick.dispose();
		}
	}

	private _getFieldPlaceholder(schema: MCP.PrimitiveSchemaDefinition, required: boolean): string {
		let placeholder = schema.description || '';
		if (!required) {
			placeholder = placeholder ? `${placeholder} (${localize('optional', 'Optional')})` : localize('optional', 'Optional');
		}
		return placeholder;
	}

	private async _handleEnumField(
		quickPick: IQuickPick<IQuickPickItem>,
		schema: { default?: string; enum: { const: string; title?: string }[] },
		required: boolean,
		store: DisposableStore,
		token: CancellationToken
	) {
		const items: IQuickPickItem[] = schema.enum.map(({ const: value, title }) => ({
			id: value,
			label: value,
			description: title,
		}));

		if (!required) {
			items.push(noneItem);
		}

		quickPick.canSelectMany = false;
		quickPick.items = items;
		if (schema.default !== undefined) {
			quickPick.activeItems = items.filter(item => item.id === schema.default);
		}

		return new Promise<{ type: 'value'; value: string | undefined } | { type: 'back' } | { type: 'cancel' }>(resolve => {
			store.add(token.onCancellationRequested(() => resolve({ type: 'cancel' })));
			store.add(quickPick.onDidAccept(() => {
				const selected = quickPick.selectedItems[0];
				if (selected) {
					resolve({ type: 'value', value: selected.id });
				}
			}));
			store.add(quickPick.onDidTriggerButton(() => resolve({ type: 'back' })));
			store.add(quickPick.onDidHide(() => resolve({ type: 'cancel' })));

			quickPick.show();
		});
	}

	private async _handleMultiEnumField(
		quickPick: IQuickPick<IQuickPickItem>,
		schema: { default?: string[]; enum: { const: string; title?: string }[] },
		required: boolean,
		store: DisposableStore,
		token: CancellationToken
	) {
		const items: IQuickPickItem[] = schema.enum.map(({ const: value, title }) => ({
			id: value,
			label: value,
			description: title,
			picked: !!schema.default?.includes(value),
			pickable: true,
		}));

		if (!required) {
			items.push(noneItem);
		}

		quickPick.canSelectMany = true;
		quickPick.items = items;

		return new Promise<{ type: 'value'; value: string[] | undefined } | { type: 'back' } | { type: 'cancel' }>(resolve => {
			store.add(token.onCancellationRequested(() => resolve({ type: 'cancel' })));
			store.add(quickPick.onDidAccept(() => {
				const selected = quickPick.selectedItems[0];
				if (selected.id === undefined) {
					resolve({ type: 'value', value: undefined });
				} else {
					resolve({ type: 'value', value: quickPick.selectedItems.map(i => i.id).filter(isDefined) });
				}
			}));
			store.add(quickPick.onDidTriggerButton(() => resolve({ type: 'back' })));
			store.add(quickPick.onDidHide(() => resolve({ type: 'cancel' })));

			quickPick.show();
		});
	}

	private async _handleInputField(
		quickPick: IQuickPick<IQuickPickItem>,
		schema: MCP.NumberSchema | MCP.StringSchema,
		required: boolean,
		store: DisposableStore,
		token: CancellationToken
	) {
		quickPick.canSelectMany = false;

		const updateItems = () => {
			const items: IQuickPickItem[] = [];
			if (quickPick.value) {
				const validation = this._validateInput(quickPick.value, schema);
				quickPick.validationMessage = validation.message;
				if (validation.isValid) {
					items.push({ id: '$current', label: `\u27A4 ${quickPick.value}` });
				}
			} else {
				quickPick.validationMessage = '';

				if (schema.default) {
					items.push({ id: '$default', label: `${schema.default}`, description: localize('mcp.elicit.useDefault', 'Default value') });
				}
			}


			if (quickPick.validationMessage) {
				quickPick.severity = Severity.Warning;
			} else {
				quickPick.severity = Severity.Ignore;
				if (!required) {
					items.push(noneItem);
				}
			}

			quickPick.items = items;
		};

		updateItems();

		return new Promise<{ type: 'value'; value: string | undefined } | { type: 'back' } | { type: 'cancel' }>(resolve => {
			if (token.isCancellationRequested) {
				resolve({ type: 'cancel' });
				return;
			}

			store.add(token.onCancellationRequested(() => resolve({ type: 'cancel' })));
			store.add(quickPick.onDidChangeValue(updateItems));
			store.add(quickPick.onDidAccept(() => {
				const id = quickPick.selectedItems[0].id;
				if (!id) {
					resolve({ type: 'value', value: undefined });
				} else if (id === '$default') {
					resolve({ type: 'value', value: String(schema.default) });
				} else if (!quickPick.validationMessage) {
					resolve({ type: 'value', value: quickPick.value });
				}
			}));
			store.add(quickPick.onDidTriggerButton(() => resolve({ type: 'back' })));
			store.add(quickPick.onDidHide(() => resolve({ type: 'cancel' })));

			quickPick.show();
		});
	}

	private _validateInput(value: string, schema: MCP.NumberSchema | MCP.StringSchema): { isValid: boolean; message?: string } {
		switch (schema.type) {
			case 'string':
				return this._validateString(value, schema);
			case 'number':
			case 'integer':
				return this._validateNumber(value, schema);
			default:
				assertNever(schema);
		}
	}

	private _validateString(value: string, schema: MCP.StringSchema): { isValid: boolean; parsedValue?: string; message?: string } {
		if (schema.minLength && value.length < schema.minLength) {
			return { isValid: false, message: localize('mcp.elicit.validation.minLength', 'Minimum length is {0}', schema.minLength) };
		}
		if (schema.maxLength && value.length > schema.maxLength) {
			return { isValid: false, message: localize('mcp.elicit.validation.maxLength', 'Maximum length is {0}', schema.maxLength) };
		}
		if (schema.format) {
			const formatValid = this._validateStringFormat(value, schema.format);
			if (!formatValid.isValid) {
				return formatValid;
			}
		}
		return { isValid: true, parsedValue: value };
	}

	private _validateStringFormat(value: string, format: string): { isValid: boolean; message?: string } {
		switch (format) {
			case 'email':
				return value.includes('@')
					? { isValid: true }
					: { isValid: false, message: localize('mcp.elicit.validation.email', 'Please enter a valid email address') };
			case 'uri':
				if (URL.canParse(value)) {
					return { isValid: true };
				} else {
					return { isValid: false, message: localize('mcp.elicit.validation.uri', 'Please enter a valid URI') };
				}
			case 'date': {
				const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
				if (!dateRegex.test(value)) {
					return { isValid: false, message: localize('mcp.elicit.validation.date', 'Please enter a valid date (YYYY-MM-DD)') };
				}
				const date = new Date(value);
				return !isNaN(date.getTime())
					? { isValid: true }
					: { isValid: false, message: localize('mcp.elicit.validation.date', 'Please enter a valid date (YYYY-MM-DD)') };
			}
			case 'date-time': {
				const dateTime = new Date(value);
				return !isNaN(dateTime.getTime())
					? { isValid: true }
					: { isValid: false, message: localize('mcp.elicit.validation.dateTime', 'Please enter a valid date-time') };
			}
			default:
				return { isValid: true };
		}
	}

	private _validateNumber(value: string, schema: MCP.NumberSchema): { isValid: boolean; parsedValue?: number; message?: string } {
		const parsed = Number(value);
		if (isNaN(parsed)) {
			return { isValid: false, message: localize('mcp.elicit.validation.number', 'Please enter a valid number') };
		}
		if (schema.type === 'integer' && !Number.isInteger(parsed)) {
			return { isValid: false, message: localize('mcp.elicit.validation.integer', 'Please enter a valid integer') };
		}
		if (schema.minimum !== undefined && parsed < schema.minimum) {
			return { isValid: false, message: localize('mcp.elicit.validation.minimum', 'Minimum value is {0}', schema.minimum) };
		}
		if (schema.maximum !== undefined && parsed > schema.maximum) {
			return { isValid: false, message: localize('mcp.elicit.validation.maximum', 'Maximum value is {0}', schema.maximum) };
		}
		return { isValid: true, parsedValue: parsed };
	}
}
