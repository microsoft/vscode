import zod from "zod";
import { conversationSchema } from "./ConversationSchema";
import { errorSchema } from "./ErrorSchema";

export const panelStateSchema = zod
	.discriminatedUnion("type", [
		zod.object({
			type: zod.literal("chat"),
			conversations: zod.array(conversationSchema),
			selectedConversationId: zod.union([zod.string(), zod.undefined()]),
			hasOpenAIApiKey: zod.boolean(),
			surfacePromptForOpenAIPlus: zod.boolean(),
			error: errorSchema.optional(),
		}),
		zod.object({
			type: zod.literal("diff"),
			oldCode: zod.string(),
			newCode: zod.string(),
			languageId: zod.string().optional(),
		}),
	])
	.optional();

export type PanelState = zod.infer<typeof panelStateSchema>;
