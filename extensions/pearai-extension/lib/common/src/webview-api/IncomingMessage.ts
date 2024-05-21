import zod from "zod";
import { panelStateSchema } from "./PanelState";

export const incomingMessageSchema = zod.object({
	data: zod.object({
		type: zod.literal("updateState"),
		state: panelStateSchema,
	}),
});

/**
 * A message sent from the extension to the webview.
 */
export type IncomingMessage = zod.infer<typeof incomingMessageSchema>;
