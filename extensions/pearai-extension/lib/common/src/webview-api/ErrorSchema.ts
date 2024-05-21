import zod from "zod";

export const errorSchema = zod.union([
	zod.string(),
	zod.object({
		title: zod.string(),
		message: zod.string(),
		level: zod
			.union([zod.literal("error"), zod.literal("warning")])
			.default("error")
			.optional(),
		disableRetry: zod.boolean().optional(),
		disableDismiss: zod.boolean().optional(),
	}),
]);

/**
 * Say what happened.
 * Provide re-assurance and explain why it happened. Suggest actions
 * to help them fix it and/or give them a way out.
 *
 * You can use Markdown syntax for `title` and `message`.
 *
 * @see https://wix-ux.com/when-life-gives-you-lemons-write-better-error-messages-46c5223e1a2f
 *
 * @example Simple scenario
 * "Unable to connect to OpenAI"
 *
 * @example More elaborate object
 * {
 *   title: "Unable to connect to OpenAI",
 *   message: "Your changes were saved, but we could not connect your account due to a technical issue on our end. Please try connecting again. If the issue keeps happening, [contact Support](#link-to-contact-support)."
 * }
 */
export type Error = zod.infer<typeof errorSchema>;
