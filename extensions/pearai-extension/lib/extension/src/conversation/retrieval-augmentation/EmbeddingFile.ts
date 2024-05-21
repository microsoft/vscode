import zod from "zod";

const chunkSchema = zod.object({
	start_position: zod.number(),
	end_position: zod.number(),
	content: zod.string(),
	file: zod.string(),
	embedding: zod.array(zod.number()),
});

export type ChunkWithContent = zod.infer<typeof chunkSchema>;

export const embeddingFileSchema = zod.object({
	version: zod.literal(0),
	embedding: zod.object({
		source: zod.literal("openai"),
		model: zod.literal("text-embedding-ada-002"),
	}),
	chunks: zod.array(chunkSchema),
});

export type EmbeddingFile = zod.infer<typeof embeddingFileSchema>;
