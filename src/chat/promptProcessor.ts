export interface PromptMeta {
    /** The original user input */
    original: string;
    /** Simple whitespace tokenization */
    tokens: string[];
    /** Basic intent classification */
    intent: 'search' | 'summarize' | 'unknown';
}

export interface WorkspaceContext {
    /** Optional text summaries relevant to the prompt */
    summaries?: string[];
    /** File paths that may be relevant for search */
    filePaths?: string[];
    /** Suggested follow up actions or hints */
    suggestions?: string[];
}

/**
 * Tokenize the prompt and attempt to classify its intent.
 */
export function analyzePrompt(input: string): PromptMeta {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    const normalized = input.toLowerCase();
    let intent: PromptMeta['intent'] = 'unknown';
    if (/\b(search|find|lookup)\b/.test(normalized)) {
        intent = 'search';
    } else if (/\b(summarize|summary|summarise)\b/.test(normalized)) {
        intent = 'summarize';
    }
    return { original: input, tokens, intent };
}

/**
 * Enhance the prompt with additional context information.
 */
export function enhancePrompt(meta: PromptMeta, context: WorkspaceContext): string {
    let enhanced = meta.original;
    if (meta.intent === 'summarize' && context.summaries && context.summaries.length) {
        enhanced += '\n\nSummaries:\n' + context.summaries.join('\n');
    }
    if (meta.intent === 'search' && context.filePaths && context.filePaths.length) {
        enhanced += '\n\nFiles:\n' + context.filePaths.join('\n');
    }
    if (context.suggestions && context.suggestions.length) {
        enhanced += '\n\nSuggestions:\n' + context.suggestions.join('\n');
    }
    return enhanced;
}
