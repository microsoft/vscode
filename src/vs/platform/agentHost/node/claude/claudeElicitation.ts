/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ElicitationRequest, ElicitationResult } from '@anthropic-ai/claude-agent-sdk';
import type { PrimitiveSchemaDefinition } from '@modelcontextprotocol/sdk/types.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { vArray, vNumber, vObj, vOptionalProp, vString, vUnknown, type ValidatorType } from '../../../../base/common/validation.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputOption, type ChatInputQuestion, type ChatInputRequest } from '../../common/state/sessionState.js';

/**
 * Pure projections between the Claude SDK's MCP elicitation request/response
 * and the agentHost workbench protocol.
 *
 * When an MCP server calls `elicit/create`, the SDK invokes
 * `Options.onElicitation` with an {@link ElicitationRequest}. The agent surfaces
 * it as structured user input (a {@link ChatInputRequest}, the same channel
 * `AskUserQuestion` uses — NOT the permission gate) and translates the user's
 * answer back into the SDK's {@link ElicitationResult}. This module owns those
 * projections so they can be unit-tested without standing up an agent.
 *
 * Unlike the Codex provider — whose `requestedSchema` is a strongly-typed
 * generated schema — the Claude SDK delivers `requestedSchema` as an untyped
 * `Record<string, unknown>`. Each field is runtime-validated with the base-layer
 * {@link vObj} validator ({@link vElicitationField}), which drops malformed
 * fields instead of mis-projecting or throwing. The field type is *derived* from
 * that validator (not hand-rolled) and cross-checked against the MCP SDK's
 * authoritative {@link PrimitiveSchemaDefinition} by
 * {@link _assertElicitationFieldCoversSchema} (which catches an incompatible
 * reshape of a covered field, though not a purely additive new variant). The
 * base-layer validator is used rather than the SDK's own zod schema because this
 * module is loaded by the unit-test renderer, where a runtime
 * `@modelcontextprotocol/sdk` import does not resolve (all SDK runtime access
 * goes through `IClaudeAgentSdkService`).
 */

/** Value the SDK accepts back for a single elicited field. */
type ElicitationFieldValue = NonNullable<ElicitationResult['content']>[string];

/** A `{ const, title? }` option, shared by `oneOf` and array `items.anyOf`. */
const vTitledOption = vObj({ const: vString(), title: vOptionalProp(vString()) });

/**
 * Lenient runtime validator for a single elicitation schema field. Structure is
 * validated (a present `enum` must be a string array, `minimum` a number, …) so
 * a malformed field is dropped rather than mis-projected; value-level
 * constraints (e.g. `format`, `type`) stay permissive so real-world schema
 * variation still renders. {@link IElicitationField} is derived from this, and
 * {@link _assertElicitationFieldCoversSchema} pins it to the MCP SDK's
 * {@link PrimitiveSchemaDefinition}.
 */
const vElicitationField = vObj({
	type: vOptionalProp(vString()),
	title: vOptionalProp(vString()),
	description: vOptionalProp(vString()),
	format: vOptionalProp(vString()),
	default: vOptionalProp(vUnknown()),
	minimum: vOptionalProp(vNumber()),
	maximum: vOptionalProp(vNumber()),
	minLength: vOptionalProp(vNumber()),
	maxLength: vOptionalProp(vNumber()),
	minItems: vOptionalProp(vNumber()),
	maxItems: vOptionalProp(vNumber()),
	enum: vOptionalProp(vArray(vString())),
	enumNames: vOptionalProp(vArray(vString())),
	oneOf: vOptionalProp(vArray(vTitledOption)),
	items: vOptionalProp(vObj({
		enum: vOptionalProp(vArray(vString())),
		anyOf: vOptionalProp(vArray(vTitledOption)),
	})),
});

type IElicitationField = ValidatorType<typeof vElicitationField>;

/**
 * Compile-time guard: every member of the MCP SDK's authoritative
 * {@link PrimitiveSchemaDefinition} union must be assignable to
 * {@link IElicitationField}. This catches an *incompatible reshape* of a field
 * we already project (e.g. the SDK retyping `enum` from `string[]` to
 * `number[]`) by failing to compile. It does NOT catch purely additive changes
 * — a brand-new union member or keyword stays structurally assignable to this
 * all-optional view and would be silently ignored by the projection until a
 * human notices the new shape. It is type-only: never called, erased at runtime.
 */
function _assertElicitationFieldCoversSchema(field: PrimitiveSchemaDefinition): IElicitationField {
	return field;
}

/**
 * Reshaped, validated view of the `form`-mode `requestedSchema`: the schema's
 * `properties` record flattened into ordered `[name, field]` tuples, plus its
 * `required` list as a set for O(1) per-field lookup during projection.
 */
interface IParsedElicitationSchema {
	readonly fields: ReadonlyArray<readonly [string, IElicitationField]>;
	readonly required: ReadonlySet<string>;
}

/**
 * Narrow the untyped `requestedSchema` into an ordered list of runtime-validated
 * fields plus the required set. Fields that fail {@link vElicitationField}
 * validation are dropped. Returns `undefined` when the schema is absent or has no
 * usable `properties` object, so the caller can fall back to a message-only
 * request.
 */
function parseElicitationSchema(schema: unknown): IParsedElicitationSchema | undefined {
	if (!isObject(schema)) {
		return undefined;
	}
	const properties = (schema as { properties?: unknown }).properties;
	if (!isObject(properties)) {
		return undefined;
	}
	const rawRequired = (schema as { required?: unknown }).required;
	const required = new Set<string>(Array.isArray(rawRequired) ? rawRequired.filter(isString) : []);
	const fields: Array<readonly [string, IElicitationField]> = [];
	for (const [name, field] of Object.entries(properties)) {
		const { content, error } = vElicitationField.validate(field);
		if (!error) {
			fields.push([name, content]);
		}
	}
	return { fields, required };
}

/**
 * Build the workbench {@link ChatInputRequest} for an MCP elicitation.
 *
 * - `url` mode surfaces the URL via {@link ChatInputRequest.url} with no
 *   questions, driving the renderer's "open URL" affordance.
 * - `form` mode projects each field of the requested JSON schema into a
 *   {@link ChatInputQuestion}. A missing/malformed schema falls back to a
 *   message-only request so the user can still accept or decline.
 */
export function buildElicitationRequest(requestId: string, request: ElicitationRequest): ChatInputRequest {
	if (request.mode === 'url') {
		const result: ChatInputRequest = { id: requestId, message: request.message };
		if (request.url) {
			result.url = request.url;
		}
		return result;
	}
	const schema = parseElicitationSchema(request.requestedSchema);
	if (!schema || schema.fields.length === 0) {
		return { id: requestId, message: request.message };
	}
	const questions = schema.fields.map(([name, field]) => elicitationFieldToQuestion(name, field, schema.required.has(name)));
	return { id: requestId, message: request.message, questions };
}

/**
 * Build the SDK {@link ElicitationResult} from the client's answers. A declined
 * request maps to `decline`, a cancelled/closed request to `cancel`, and an
 * accepted request to `accept` with a `content` object keyed by field name
 * (omitting skipped/missing answers). `url`-mode acceptances carry no content.
 */
export function elicitationResultFromAnswers(
	request: ElicitationRequest,
	response: ChatInputResponseKind,
	answers: Record<string, ChatInputAnswer> | undefined,
): ElicitationResult {
	if (response === ChatInputResponseKind.Decline) {
		return { action: 'decline' };
	}
	if (response !== ChatInputResponseKind.Accept) {
		return { action: 'cancel' };
	}
	const schema = request.mode === 'url' ? undefined : parseElicitationSchema(request.requestedSchema);
	if (!schema) {
		return { action: 'accept' };
	}
	// Field names come from an untrusted schema and may be `__proto__` or another
	// inherited key, so read answers with `Object.hasOwn` and materialize the
	// content via `Object.fromEntries` (define semantics) so such a name lands as
	// an own data property instead of mutating the prototype or being dropped.
	const entries: [string, ElicitationFieldValue][] = [];
	for (const [name, field] of schema.fields) {
		const answer = answers && Object.hasOwn(answers, name) ? answers[name] : undefined;
		const value = elicitationAnswerToValue(field, answer);
		if (value !== undefined) {
			entries.push([name, value]);
		}
	}
	return { action: 'accept', content: Object.fromEntries(entries) };
}

/** Cancel result used when there is no session to route the elicitation to. */
export function cancelledElicitationResult(): ElicitationResult {
	return { action: 'cancel' };
}

/**
 * Project a single narrowed schema field into a {@link ChatInputQuestion}. The
 * schema's property key becomes the stable question id (the key the answer map
 * is later read back by). Unknown/missing types fall back to a plain text field.
 */
function elicitationFieldToQuestion(id: string, field: IElicitationField, required: boolean): ChatInputQuestion {
	const base = { id, title: field.title ?? id, message: field.description ?? field.title ?? id, required };

	switch (field.type) {
		case 'boolean':
			return { ...base, kind: ChatInputQuestionKind.Boolean, defaultValue: typeof field.default === 'boolean' ? field.default : undefined };
		case 'number':
		case 'integer':
			return {
				...base,
				kind: field.type === 'integer' ? ChatInputQuestionKind.Integer : ChatInputQuestionKind.Number,
				min: field.minimum,
				max: field.maximum,
				defaultValue: typeof field.default === 'number' ? field.default : undefined,
			};
		case 'array':
			return {
				...base,
				kind: ChatInputQuestionKind.MultiSelect,
				// MCP enum arrays are strict — only the declared options are valid —
				// but the workbench defaults an omitted `allowFreeformInput` to true.
				allowFreeformInput: false,
				options: field.items?.anyOf
					? field.items.anyOf.map((o): ChatInputOption => ({ id: o.const, label: o.title || o.const }))
					: (field.items?.enum ?? []).map((v): ChatInputOption => ({ id: v, label: v })),
				min: field.minItems,
				max: field.maxItems,
			};
		case 'string':
		default:
			// Titled single-select (`oneOf`), enum/legacy single-select (`enum`,
			// optionally `enumNames`), or a plain text field. MCP enums are strict,
			// so free-form input is disabled for the select variants.
			if (field.oneOf) {
				return {
					...base,
					kind: ChatInputQuestionKind.SingleSelect,
					allowFreeformInput: false,
					options: field.oneOf.map((o): ChatInputOption => ({ id: o.const, label: o.title || o.const })),
				};
			}
			if (field.enum) {
				const names = field.enumNames;
				return {
					...base,
					kind: ChatInputQuestionKind.SingleSelect,
					allowFreeformInput: false,
					options: field.enum.map((v, i): ChatInputOption => ({ id: v, label: names?.[i] || v })),
				};
			}
			return {
				...base,
				kind: ChatInputQuestionKind.Text,
				format: field.format,
				min: field.minLength,
				max: field.maxLength,
				defaultValue: typeof field.default === 'string' ? field.default : undefined,
			};
	}
}

/**
 * Project a single {@link ChatInputAnswer} back into the raw value the SDK
 * expects for the given field, coercing to the field's declared type. This is
 * schema-aware because the workbench renders number/integer/boolean questions as
 * text inputs (no dedicated widget) and returns them as {@link ChatInputAnswer}
 * text values, so `"3"` / `"false"` must be coerced back to `3` / `false` to
 * satisfy the requested schema. Skipped/missing/uncoercible answers return
 * `undefined` so the caller omits them from the content object.
 */
function elicitationAnswerToValue(field: IElicitationField, answer: ChatInputAnswer | undefined): ElicitationFieldValue | undefined {
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return undefined;
	}
	const { value } = answer;
	switch (field.type) {
		case 'boolean':
			if (value.kind === ChatInputAnswerValueKind.Boolean) {
				return value.value;
			}
			if (value.kind === ChatInputAnswerValueKind.Text) {
				if (value.value === 'true') { return true; }
				if (value.value === 'false') { return false; }
			}
			return undefined;
		case 'number':
		case 'integer': {
			const n = value.kind === ChatInputAnswerValueKind.Number
				? value.value
				: value.kind === ChatInputAnswerValueKind.Text && value.value.trim() !== ''
					? Number(value.value)
					: undefined;
			if (n === undefined || !Number.isFinite(n)) {
				return undefined;
			}
			return field.type === 'integer' ? Math.trunc(n) : n;
		}
		case 'array':
			if (value.kind === ChatInputAnswerValueKind.SelectedMany) {
				return [...value.value, ...(value.freeformValues ?? [])];
			}
			if (value.kind === ChatInputAnswerValueKind.Selected) {
				return value.value ? [value.value, ...(value.freeformValues ?? [])] : [...(value.freeformValues ?? [])];
			}
			if (value.kind === ChatInputAnswerValueKind.Text) {
				return value.value ? [value.value] : [];
			}
			return undefined;
		case 'string':
		default:
			if (value.kind === ChatInputAnswerValueKind.Text) {
				return value.value;
			}
			if (value.kind === ChatInputAnswerValueKind.Selected) {
				return value.value;
			}
			return undefined;
	}
}
