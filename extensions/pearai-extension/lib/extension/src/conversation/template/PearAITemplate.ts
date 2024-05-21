import zod from "zod";

const completionHandlerSchema = zod.discriminatedUnion("type", [
	zod.object({
		type: zod.literal("message"),
	}),
	zod.object({
		type: zod.literal("update-temporary-editor"),
		botMessage: zod.string(),
		language: zod.string().optional(),
	}),
	zod.object({
		type: zod.literal("active-editor-diff"),
	}),
]);

const retrievalAugmentationSchema = zod.object({
	variableName: zod.string(),
	type: zod.literal("similarity-search"),
	source: zod.literal("embedding-file"),
	file: zod.string(),
	query: zod.string(),
	threshold: zod.number().min(0).max(1),
	maxResults: zod.number().int().min(1),
});

export type RetrievalAugmentation = zod.infer<
	typeof retrievalAugmentationSchema
>;

const promptSchema = zod.object({
	placeholder: zod.string().optional(),
	retrievalAugmentation: retrievalAugmentationSchema.optional(),
	maxTokens: zod.number(),
	stop: zod.array(zod.string()).optional(),
	temperature: zod.number().optional(),
	completionHandler: completionHandlerSchema.optional(),
});

export type Prompt = zod.infer<typeof promptSchema> & {
	/**
	 * Resolved template.
	 */
	template: string;
};

const variableBaseSchema = zod.object({
	name: zod.string(),
	constraints: zod
		.array(
			zod.discriminatedUnion("type", [
				zod.object({
					type: zod.literal("text-length"),
					min: zod.number(),
				}),
			])
		)
		.optional(),
});

const variableSchema = zod.discriminatedUnion("type", [
	variableBaseSchema.extend({
		type: zod.literal("constant"),
		time: zod.literal("conversation-start"),
		value: zod.string(),
	}),
	variableBaseSchema.extend({
		type: zod.literal("message"),
		time: zod.literal("message"),
		index: zod.number(),
		property: zod.enum(["content"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("context"),
		time: zod.enum(["conversation-start"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("selected-text"),
		time: zod.enum(["conversation-start", "message"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("selected-location-text"),
		time: zod.enum(["conversation-start"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("filename"),
		time: zod.enum(["conversation-start"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("language"),
		time: zod.enum(["conversation-start"]),
	}),
	variableBaseSchema.extend({
		type: zod.literal("selected-text-with-diagnostics"),
		time: zod.literal("conversation-start"),
		severities: zod.array(
			zod.enum(["error", "warning", "information", "hint"])
		),
	}),
]);

export type Variable = zod.infer<typeof variableSchema>;

export const pearaiTemplateSchema = zod.object({
	id: zod.string(),
	engineVersion: zod.literal(0),
	label: zod.string(),
	description: zod.string(),
	tags: zod.array(zod.string()).optional(),
	header: zod.object({
		title: zod.string(),
		useFirstMessageAsTitle: zod.boolean().optional(), // default: false
		icon: zod.object({
			type: zod.literal("codicon"),
			value: zod.string(),
		}),
	}),
	chatInterface: zod
		.enum(["message-exchange", "instruction-refinement"])
		.optional(), // default: message-exchange
	isEnabled: zod.boolean().optional(), // default: true
	variables: zod.array(variableSchema).optional(),
	initialMessage: promptSchema.optional(),
	response: promptSchema,
});

export type PearAITemplate = zod.infer<typeof pearaiTemplateSchema> & {
	initialMessage?: Prompt;
	response: Prompt;
};
