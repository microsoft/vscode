export const auto = () => {
    const vscodeStyle = document.documentElement.style;
    function get(name: string): string {
        return vscodeStyle.getPropertyValue(name)
    }
    return {
        
        cursor:get('--vscode-editorCursor-foreground'),

        foreground: get('--vscode-terminal-foreground'),
        background: get('--vscode-editor-background'),

        brightBlack: get('--vscode-terminal-ansiBrightBlack'),
        black: get('--vscode-terminal-ansiBlack'),

        brightBlue: get('--vscode-terminal-ansBrightiBlue'),
        blue: get('--vscode-terminal-ansiBlue'),

        brightGreen: get('--vscode-terminal-ansiBrightGreen'),
        green: get('--vscode-terminal-ansiGreen'),

        brightRed: get('--vscode-terminal-ansiBrightRed'),
        red: get('--vscode-terminal-ansiRed'),

        brightCyan: get('--vscode-terminal-ansiBrightCyan'),
        cyan: get('--vscode-terminal-ansiCyan'),

        brightPurple: get('--vscode-terminal-ansiBrightMagenta'),
        purple: get('--vscode-terminal-ansiMagenta'),

        brightYellow: get('--vscode-terminal-ansiBrightYellow'),
        yellow: get('--vscode-terminal-ansiYellow'),

        brightWhite: get('--vscode-terminal-ansiBrightWhite'),
        white: get('--vscode-terminal-ansiWhite'),
    }
}