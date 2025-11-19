function stripPromptPrefix(line: string): string {
    return line.replace(/^\s*\$\s?/, '').trim();
}

function normalizeLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map(stripPromptPrefix)
        .filter(Boolean);
}

export function extractRunnableCommand(text: string): string | undefined {
    const codeBlockMatch = text.match(/```(?:bash|sh|shell|zsh)\s+([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
        const lines = normalizeLines(codeBlockMatch[1]);
        if (lines.length) {
            return lines.join('\n');
        }
    }

    const commandLines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('$'))
        .map(stripPromptPrefix)
        .filter(Boolean);

    if (commandLines.length) {
        return commandLines.join('\n');
    }

    return undefined;
}
