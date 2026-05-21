/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z, type ZodTypeAny } from 'zod';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';

/**
 * Converts the narrow JSON Schema subset that
 * {@link ToolDefinition.inputSchema} carries into the `Record<string, ZodType>`
 * "raw shape" expected by the Anthropic SDK's `tool()` factory
 * (`AnyZodRawShape`).
 *
 * Per-property failures fall back to {@link z.any} so a single malformed
 * property never rejects an entire tool — clients always get *some* tool
 * surface to bind against.
 */
export function jsonSchemaToZodRawShape(
	inputSchema: ToolDefinition['inputSchema'] | undefined
): Record<string, ZodTypeAny> {
	if (!inputSchema || inputSchema.type !== 'object' || !inputSchema.properties) {
		return {};
	}
	const required = new Set(inputSchema.required ?? []);
	const shape: Record<string, ZodTypeAny> = {};
	for (const [name, raw] of Object.entries(inputSchema.properties)) {
		let zodType: ZodTypeAny;
		try {
			zodType = jsonPropertyToZod(raw as JsonSchemaProperty);
		} catch {
			zodType = z.any();
		}
		if (!required.has(name)) {
			zodType = zodType.optional();
		}
		shape[name] = zodType;
	}
	return shape;
}

interface JsonSchemaProperty {
	type?: string | string[];
	description?: string;
	default?: unknown;
	nullable?: boolean;
	enum?: unknown[];
	oneOf?: JsonSchemaProperty[];
	anyOf?: JsonSchemaProperty[];
	items?: JsonSchemaProperty;
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
}

function jsonPropertyToZod(prop: JsonSchemaProperty): ZodTypeAny {
	if (!prop || typeof prop !== 'object') {
		return z.any();
	}

	let base: ZodTypeAny;

	if (Array.isArray(prop.enum) && prop.enum.length > 0) {
		const literals = prop.enum.filter(v =>
			typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null
		) as (string | number | boolean | null)[];
		if (literals.length === 0) {
			base = z.any();
		} else if (literals.length === 1) {
			base = z.literal(literals[0] as Exclude<typeof literals[number], null>);
		} else {
			base = z.union(literals.map(v => z.literal(v as Exclude<typeof literals[number], null>)) as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
		}
	} else if (Array.isArray(prop.oneOf) && prop.oneOf.length > 0) {
		base = unionOf(prop.oneOf);
	} else if (Array.isArray(prop.anyOf) && prop.anyOf.length > 0) {
		base = unionOf(prop.anyOf);
	} else {
		const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
		switch (type) {
			case 'string':
				base = z.string();
				break;
			case 'number':
				base = z.number();
				break;
			case 'integer':
				base = z.number().int();
				break;
			case 'boolean':
				base = z.boolean();
				break;
			case 'array':
				base = z.array(prop.items ? jsonPropertyToZod(prop.items) : z.any());
				break;
			case 'object': {
				const sub: Record<string, ZodTypeAny> = {};
				const subRequired = new Set(prop.required ?? []);
				for (const [n, p] of Object.entries(prop.properties ?? {})) {
					let t: ZodTypeAny;
					try { t = jsonPropertyToZod(p); } catch { t = z.any(); }
					if (!subRequired.has(n)) { t = t.optional(); }
					sub[n] = t;
				}
				base = z.object(sub);
				break;
			}
			case 'null':
				base = z.null();
				break;
			default:
				base = z.any();
		}
	}

	if (prop.nullable) {
		base = base.nullable();
	}
	if (prop.description) {
		base = base.describe(prop.description);
	}
	if (prop.default !== undefined) {
		base = base.default(prop.default as never);
	}
	return base;
}

function unionOf(schemas: JsonSchemaProperty[]): ZodTypeAny {
	const variants = schemas.map(s => {
		try { return jsonPropertyToZod(s); } catch { return z.any(); }
	});
	if (variants.length === 1) {
		return variants[0];
	}
	return z.union(variants as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}
