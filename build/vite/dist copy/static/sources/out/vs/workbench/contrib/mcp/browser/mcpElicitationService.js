/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Action } from '../../../../base/common/actions.js';
import { assertNever, softAssertNever } from '../../../../base/common/assert.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ChatElicitationRequestPart } from '../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatQuestionCarouselData } from '../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatModel } from '../../chat/common/model/chatModel.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { McpConnectionState, MpcResponseError } from '../common/mcpTypes.js';
import { mcpServerToSourceData } from '../common/mcpTypesUtils.js';
import { MCP } from '../common/modelContextProtocol.js';
const noneItem = { id: undefined, label: localize('mcp.elicit.enum.none', 'None'), description: localize('mcp.elicit.enum.none.description', 'No selection'), alwaysShow: true };
function isFormElicitation(params) {
    return params.mode === 'form' || (params.mode === undefined && !!params.requestedSchema);
}
function isUrlElicitation(params) {
    return params.mode === 'url';
}
function isLegacyTitledEnumSchema(schema) {
    const cast = schema;
    return cast.type === 'string' && Array.isArray(cast.enum) && Array.isArray(cast.enumNames);
}
function isUntitledEnumSchema(schema) {
    const cast = schema;
    return cast.type === 'string' && Array.isArray(cast.enum);
}
function isTitledSingleEnumSchema(schema) {
    const cast = schema;
    return cast.type === 'string' && Array.isArray(cast.oneOf);
}
function isUntitledMultiEnumSchema(schema) {
    const cast = schema;
    return cast.type === 'array' && !!cast.items?.enum;
}
function isTitledMultiEnumSchema(schema) {
    const cast = schema;
    return cast.type === 'array' && !!cast.items?.anyOf;
}
let McpElicitationService = class McpElicitationService {
    constructor(_notificationService, _quickInputService, _chatService, _openerService) {
        this._notificationService = _notificationService;
        this._quickInputService = _quickInputService;
        this._chatService = _chatService;
        this._openerService = _openerService;
    }
    elicit(server, context, elicitation, token) {
        if (isFormElicitation(elicitation)) {
            return this._elicitForm(server, context, elicitation, token);
        }
        else if (isUrlElicitation(elicitation)) {
            return this._elicitUrl(server, context, elicitation, token);
        }
        else {
            softAssertNever(elicitation);
            return Promise.reject(new MpcResponseError('Unsupported elicitation type', MCP.INVALID_PARAMS, undefined));
        }
    }
    async _elicitForm(server, context, elicitation, token) {
        const store = new DisposableStore();
        const value = await new Promise(resolve => {
            const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
            if (chatModel instanceof ChatModel) {
                const request = chatModel.getRequests().at(-1);
                if (request) {
                    const { questions, idToPropertyMap } = this._convertSchemaToQuestions(elicitation);
                    const carousel = new ChatQuestionCarouselData(questions, 
                    /* allowSkip */ true, 
                    /* resolveId */ undefined, 
                    /* data */ undefined, 
                    /* isUsed */ undefined, 
                    /* message */ new MarkdownString(elicitation.message), 
                    /* source */ mcpServerToSourceData(server));
                    chatModel.acceptResponseProgress(request, carousel);
                    store.add(token.onCancellationRequested(() => {
                        carousel.completion.complete({ answers: undefined });
                    }));
                    carousel.completion.p.then(result => {
                        if (!result.answers) {
                            resolve({ action: 'cancel' });
                        }
                        else {
                            const content = this._convertCarouselAnswersToElicitResult(result.answers, idToPropertyMap, elicitation.requestedSchema.properties);
                            resolve({ action: 'accept', content });
                        }
                    });
                    return;
                }
            }
            // Fallback: no chat session → notification + quickpick
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
        }).finally(() => store.dispose());
        return { kind: 0 /* ElicitationKind.Form */, value, dispose: () => { } };
    }
    async _elicitUrl(server, context, elicitation, token) {
        const promiseStore = new DisposableStore();
        // We create this ahead of time in case e.g. a user manually opens the URL beforehand
        const completePromise = new Promise((resolve, reject) => {
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
                }
                else if (!McpConnectionState.isRunning(server.connectionState.read(reader))) {
                    reject(new CancellationError());
                }
            }));
        }).finally(() => promiseStore.dispose());
        const store = new DisposableStore();
        const value = await new Promise(resolve => {
            const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
            if (chatModel instanceof ChatModel) {
                const request = chatModel.getRequests().at(-1);
                if (request) {
                    const part = new ChatElicitationRequestPart(localize('mcp.elicit.url.title', 'Authorization Required'), new MarkdownString().appendText(elicitation.message)
                        .appendMarkdown('\n\n' + localize('mcp.elicit.url.instruction', 'Open this URL?'))
                        .appendCodeblock('', elicitation.url), localize('msg.subtitle', "{0} (MCP Server)", server.definition.label), localize('mcp.elicit.url.open', 'Open {0}', URI.parse(elicitation.url).authority), localize('mcp.elicit.reject', 'Cancel'), async () => {
                        const result = await this._doElicitUrl(elicitation, token);
                        resolve(result);
                        completePromise.then(() => part.hide());
                        return result.action === 'accept' ? "accepted" /* ElicitationState.Accepted */ : "rejected" /* ElicitationState.Rejected */;
                    }, () => {
                        resolve({ action: 'decline' });
                        return Promise.resolve("rejected" /* ElicitationState.Rejected */);
                    }, mcpServerToSourceData(server));
                    chatModel.acceptResponseProgress(request, part);
                }
            }
            else {
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
            kind: 1 /* ElicitationKind.URL */,
            value,
            wait: completePromise,
            dispose: () => promiseStore.dispose(),
        };
    }
    async _doElicitUrl(elicitation, token) {
        if (token.isCancellationRequested) {
            return { action: 'cancel' };
        }
        try {
            if (await this._openerService.open(elicitation.url, { allowCommands: false })) {
                return { action: 'accept' };
            }
        }
        catch {
            // ignored
        }
        return { action: 'decline' };
    }
    async _doElicitForm(elicitation, token) {
        const quickPick = this._quickInputService.createQuickPick();
        const store = new DisposableStore();
        try {
            const properties = Object.entries(elicitation.requestedSchema.properties);
            const requiredFields = new Set(elicitation.requestedSchema.required || []);
            const results = {};
            const backSnapshots = [];
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
                let result;
                if (schema.type === 'boolean') {
                    result = await this._handleEnumField(quickPick, { enum: [{ const: 'true' }, { const: 'false' }], default: schema.default ? String(schema.default) : undefined }, isRequired, store, token);
                    if (result.type === 'value') {
                        result.value = result.value === 'true' ? true : false;
                    }
                }
                else if (isLegacyTitledEnumSchema(schema)) {
                    result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v, i) => ({ const: v, title: schema.enumNames[i] })), default: schema.default }, isRequired, store, token);
                }
                else if (isUntitledEnumSchema(schema)) {
                    result = await this._handleEnumField(quickPick, { enum: schema.enum.map(v => ({ const: v })), default: schema.default }, isRequired, store, token);
                }
                else if (isTitledSingleEnumSchema(schema)) {
                    result = await this._handleEnumField(quickPick, { enum: schema.oneOf, default: schema.default }, isRequired, store, token);
                }
                else if (isTitledMultiEnumSchema(schema)) {
                    result = await this._handleMultiEnumField(quickPick, { enum: schema.items.anyOf, default: schema.default }, isRequired, store, token);
                }
                else if (isUntitledMultiEnumSchema(schema)) {
                    result = await this._handleMultiEnumField(quickPick, { enum: schema.items.enum.map(v => ({ const: v })), default: schema.default }, isRequired, store, token);
                }
                else {
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
                }
                else {
                    results[propertyName] = result.value;
                }
            }
            return {
                action: 'accept',
                content: results,
            };
        }
        finally {
            store.dispose();
            quickPick.dispose();
        }
    }
    _getFieldPlaceholder(schema, required) {
        let placeholder = schema.description || '';
        if (!required) {
            placeholder = placeholder ? `${placeholder} (${localize('optional', 'Optional')})` : localize('optional', 'Optional');
        }
        return placeholder;
    }
    async _handleEnumField(quickPick, schema, required, store, token) {
        const items = schema.enum.map(({ const: value, title }) => ({
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
        return new Promise(resolve => {
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
    async _handleMultiEnumField(quickPick, schema, required, store, token) {
        const items = schema.enum.map(({ const: value, title }) => ({
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
        return new Promise(resolve => {
            store.add(token.onCancellationRequested(() => resolve({ type: 'cancel' })));
            store.add(quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected.id === undefined) {
                    resolve({ type: 'value', value: undefined });
                }
                else {
                    resolve({ type: 'value', value: quickPick.selectedItems.map(i => i.id).filter(isDefined) });
                }
            }));
            store.add(quickPick.onDidTriggerButton(() => resolve({ type: 'back' })));
            store.add(quickPick.onDidHide(() => resolve({ type: 'cancel' })));
            quickPick.show();
        });
    }
    async _handleInputField(quickPick, schema, required, store, token) {
        quickPick.canSelectMany = false;
        const updateItems = () => {
            const items = [];
            if (quickPick.value) {
                const validation = this._validateInput(quickPick.value, schema);
                quickPick.validationMessage = validation.message;
                if (validation.isValid) {
                    items.push({ id: '$current', label: `\u27A4 ${quickPick.value}` });
                }
            }
            else {
                quickPick.validationMessage = '';
                if (schema.default) {
                    items.push({ id: '$default', label: `${schema.default}`, description: localize('mcp.elicit.useDefault', 'Default value') });
                }
            }
            if (quickPick.validationMessage) {
                quickPick.severity = Severity.Warning;
            }
            else {
                quickPick.severity = Severity.Ignore;
                if (!required) {
                    items.push(noneItem);
                }
            }
            quickPick.items = items;
        };
        updateItems();
        return new Promise(resolve => {
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
                }
                else if (id === '$default') {
                    resolve({ type: 'value', value: String(schema.default) });
                }
                else if (!quickPick.validationMessage) {
                    resolve({ type: 'value', value: quickPick.value });
                }
            }));
            store.add(quickPick.onDidTriggerButton(() => resolve({ type: 'back' })));
            store.add(quickPick.onDidHide(() => resolve({ type: 'cancel' })));
            quickPick.show();
        });
    }
    _validateInput(value, schema) {
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
    _validateString(value, schema) {
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
    _validateStringFormat(value, format) {
        switch (format) {
            case 'email':
                return value.includes('@')
                    ? { isValid: true }
                    : { isValid: false, message: localize('mcp.elicit.validation.email', 'Please enter a valid email address') };
            case 'uri':
                if (URL.canParse(value)) {
                    return { isValid: true };
                }
                else {
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
    _validateNumber(value, schema) {
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
    /**
     * Converts an MCP elicitation schema into IChatQuestion[] for the carousel UI.
     * Returns the questions and a map from question ID to schema property name.
     */
    _convertSchemaToQuestions(elicitation) {
        const properties = Object.entries(elicitation.requestedSchema.properties);
        const requiredFields = new Set(elicitation.requestedSchema.required || []);
        const questions = [];
        const idToPropertyMap = new Map();
        for (const [propertyName, schema] of properties) {
            const id = generateUuid();
            idToPropertyMap.set(id, propertyName);
            const title = schema.title || propertyName;
            const description = schema.description;
            const isRequired = requiredFields.has(propertyName);
            if (schema.type === 'boolean') {
                questions.push({
                    id,
                    type: 'singleSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: [
                        { id: 'true', label: localize('mcp.elicit.true', 'True'), value: 'true' },
                        { id: 'false', label: localize('mcp.elicit.false', 'False'), value: 'false' },
                    ],
                    defaultValue: schema.default !== undefined ? String(schema.default) : undefined,
                });
            }
            else if (isLegacyTitledEnumSchema(schema)) {
                questions.push({
                    id,
                    type: 'singleSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: schema.enum.map((v, i) => ({
                        id: v,
                        label: schema.enumNames[i] ? `${v} - ${schema.enumNames[i]}` : v,
                        value: v,
                    })),
                    defaultValue: schema.default,
                });
            }
            else if (isTitledSingleEnumSchema(schema)) {
                questions.push({
                    id,
                    type: 'singleSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: schema.oneOf.map(({ const: value, title: optTitle }) => ({
                        id: value,
                        label: optTitle ? `${value} - ${optTitle}` : value,
                        value,
                    })),
                    defaultValue: schema.default,
                });
            }
            else if (isUntitledEnumSchema(schema)) {
                questions.push({
                    id,
                    type: 'singleSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: schema.enum.map(v => ({ id: v, label: v, value: v })),
                    defaultValue: schema.default,
                });
            }
            else if (isTitledMultiEnumSchema(schema)) {
                questions.push({
                    id,
                    type: 'multiSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: schema.items.anyOf.map(({ const: value, title: optTitle }) => ({
                        id: value,
                        label: optTitle ? `${value} - ${optTitle}` : value,
                        value,
                    })),
                    defaultValue: schema.default,
                });
            }
            else if (isUntitledMultiEnumSchema(schema)) {
                questions.push({
                    id,
                    type: 'multiSelect',
                    title,
                    description,
                    required: isRequired,
                    allowFreeformInput: false,
                    options: schema.items.enum.map(v => ({ id: v, label: v, value: v })),
                    defaultValue: schema.default,
                });
            }
            else {
                // String, number, integer → text input with validation
                const validation = {};
                if (schema.type === 'string') {
                    if (schema.minLength !== undefined) {
                        validation.minLength = schema.minLength;
                    }
                    if (schema.maxLength !== undefined) {
                        validation.maxLength = schema.maxLength;
                    }
                    if (schema.format) {
                        validation.format = schema.format;
                    }
                }
                else if (schema.type === 'number' || schema.type === 'integer') {
                    if (schema.minimum !== undefined) {
                        validation.minimum = schema.minimum;
                    }
                    if (schema.maximum !== undefined) {
                        validation.maximum = schema.maximum;
                    }
                    if (schema.type === 'integer') {
                        validation.isInteger = true;
                    }
                }
                questions.push({
                    id,
                    type: 'text',
                    title,
                    description,
                    required: isRequired,
                    defaultValue: schema.default !== undefined ? String(schema.default) : undefined,
                    validation: Object.keys(validation).length > 0 ? validation : undefined,
                });
            }
        }
        return { questions, idToPropertyMap };
    }
    /**
     * Converts carousel answers (keyed by question ID) back into the
     * MCP ElicitResult content format (keyed by schema property names),
     * coercing types as needed.
     */
    _convertCarouselAnswersToElicitResult(answers, idToPropertyMap, schemaProperties) {
        const content = {};
        for (const [questionId, answer] of Object.entries(answers)) {
            const propertyName = idToPropertyMap.get(questionId);
            if (!propertyName) {
                continue;
            }
            const schema = schemaProperties[propertyName];
            if (!schema) {
                continue;
            }
            // Extract the raw value from structured answers
            let rawValue = answer;
            if (typeof answer === 'object' && answer !== null) {
                const obj = answer;
                if ('selectedValue' in obj) {
                    rawValue = obj.selectedValue;
                }
                else if ('selectedValues' in obj) {
                    rawValue = obj.selectedValues;
                }
                else if ('freeformValue' in obj && obj.freeformValue) {
                    rawValue = obj.freeformValue;
                }
            }
            if (rawValue === undefined || rawValue === null) {
                continue;
            }
            // Type coercion based on schema
            if (schema.type === 'boolean') {
                content[propertyName] = rawValue === 'true' || rawValue === true;
            }
            else if (schema.type === 'number' || schema.type === 'integer') {
                const num = Number(rawValue);
                if (!isNaN(num)) {
                    content[propertyName] = num;
                }
            }
            else if (schema.type === 'array') {
                if (Array.isArray(rawValue)) {
                    content[propertyName] = rawValue.map(v => String(v));
                }
            }
            else {
                content[propertyName] = String(rawValue);
            }
        }
        return content;
    }
};
McpElicitationService = __decorate([
    __param(0, INotificationService),
    __param(1, IQuickInputService),
    __param(2, IChatService),
    __param(3, IOpenerService)
], McpElicitationService);
export { McpElicitationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwRWxpY2l0YXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2Jyb3dzZXIvbWNwRWxpY2l0YXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBOEIsTUFBTSxzREFBc0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNySCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNq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