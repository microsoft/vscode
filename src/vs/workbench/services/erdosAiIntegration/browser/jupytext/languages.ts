/**
 * Determine notebook or cell language
 * Converted from src/jupytext/languages.py
 */

// Jupyter magic commands that are also languages (lines 5-35)
const _JUPYTER_LANGUAGES = [
    "R",
    "bash",
    "sh",
    "python",
    "python2",
    "python3",
    "coconut",
    "javascript",
    "js",
    "perl",
    "html",
    "latex",
    "markdown",
    "pypy",
    "ruby",
    "script",
    "svg",
    "matlab",
    "octave",
    "idl",
    "robotframework",
    "sas",
    "spark",
    "sql",
    "cython",
    "haskell",
    "tcl",
    "gnuplot",
    "wolfram language",
];

// Supported file extensions (and languages) (lines 39-99)
interface ScriptExtension {
    language: string;
    comment: string;
    comment_suffix?: string;
}

export const SCRIPT_EXTENSIONS: Record<string, ScriptExtension> = {
    ".py": { language: "python", comment: "#" },
    ".coco": { language: "coconut", comment: "#" },
    ".R": { language: "R", comment: "#" },
    ".r": { language: "R", comment: "#" },
    ".jl": { language: "julia", comment: "#" },
    ".cpp": { language: "c++", comment: "//" },
    ".ss": { language: "scheme", comment: ";;" },
    ".clj": { language: "clojure", comment: ";;" },
    ".scm": { language: "scheme", comment: ";;" },
    ".sh": { language: "bash", comment: "#" },
    ".ps1": { language: "powershell", comment: "#" },
    ".q": { language: "q", comment: "/" },
    ".m": { language: "matlab", comment: "%" },
    ".wolfram": {
        language: "wolfram language",
        comment: "(*",
        comment_suffix: "*)",
    },
    ".pro": { language: "idl", comment: ";" },
    ".js": { language: "javascript", comment: "//" },
    ".ts": { language: "typescript", comment: "//" },
    ".scala": { language: "scala", comment: "//" },
    ".rs": { language: "rust", comment: "//" },
    ".robot": { language: "robotframework", comment: "#" },
    ".resource": { language: "robotframework", comment: "#" },
    ".cs": { language: "csharp", comment: "//" },
    ".fsx": { language: "fsharp", comment: "//" },
    ".fs": { language: "fsharp", comment: "//" },
    ".sos": { language: "sos", comment: "#" },
    ".java": { language: "java", comment: "//" },
    ".groovy": { language: "groovy", comment: "//" },
    ".sage": { language: "sage", comment: "#" },
    ".ml": {
        language: "ocaml",
        comment: "(*",
        comment_suffix: "*)",
    },
    ".hs": { language: "haskell", comment: "--" },
    ".tcl": { language: "tcl", comment: "#" },
    ".mac": {
        language: "maxima",
        comment: "/*",
        comment_suffix: "*/",
    },
    ".gp": { language: "gnuplot", comment: "#" },
    ".do": { language: "stata", comment: "//" },
    ".sas": {
        language: "sas",
        comment: "/*",
        comment_suffix: "*/",
    },
    ".xsh": { language: "xonsh", comment: "#" },
    ".lgt": { language: "logtalk", comment: "%" },
    ".logtalk": { language: "logtalk", comment: "%" },
    ".lua": { language: "lua", comment: "--" },
    ".go": { language: "go", comment: "//" },
};

// Comment characters (lines 101-105)
export const COMMENT_CHARS = Object.values(SCRIPT_EXTENSIONS)
    .map(ext => ext.comment)
    .filter(comment => comment !== "#");

// Comment mapping (lines 107-110)
export const COMMENT: Record<string, string> = {};
for (const ext in SCRIPT_EXTENSIONS) {
    const scriptExt = SCRIPT_EXTENSIONS[ext];
    COMMENT[scriptExt.language] = scriptExt.comment;
}

// Also export as _COMMENT for compatibility with Python naming
export const _COMMENT = COMMENT;

// Jupyter languages with additional entries (lines 111-116)
export const JUPYTER_LANGUAGES = new Set([
    ..._JUPYTER_LANGUAGES,
    ...Object.keys(COMMENT),
    "c#", "f#", "cs", "fs"
]);

export const JUPYTER_LANGUAGES_LOWER_AND_UPPER = new Set([
    ...JUPYTER_LANGUAGES,
    ...[...JUPYTER_LANGUAGES].map(lang => lang.toUpperCase())
]);

// Also export with underscore prefix for compatibility
export { _JUPYTER_LANGUAGES };
export const _JUPYTER_LANGUAGES_LOWER_AND_UPPER = JUPYTER_LANGUAGES_LOWER_AND_UPPER;

// Go double percent command regex (line 117)
export const GO_DOUBLE_PERCENT_COMMAND = /^(%%\s*|%%\s+-.*)$/;

// Functions (lines 120-247)

export function defaultLanguageFromMetadataAndExt(
    metadata: Record<string, any>, 
    ext: string, 
    popMainLanguage: boolean = false
): string | null {
    const defaultFromExt = SCRIPT_EXTENSIONS[ext]?.language;

    const mainLanguage = metadata.jupytext?.main_language;
    const defaultLanguage = metadata.kernelspec?.language || defaultFromExt;
    const language = mainLanguage || defaultLanguage;

    if (mainLanguage !== null && 
        mainLanguage === defaultLanguage && 
        popMainLanguage) {
        delete metadata.jupytext.main_language;
    }

    if (language === null || language === "R" || language === "sas") {
        return language;
    }

    if (language.startsWith("C++")) {
        return "c++";
    }

    return language.toLowerCase().replace("#", "sharp");
}

export function usualLanguageName(language: string): string {
    const lowerLang = language.toLowerCase();
    if (lowerLang === "r") {
        return "R";
    }
    if (lowerLang.startsWith("c++")) {
        return "c++";
    }
    if (lowerLang === "octave") {
        return "matlab";
    }
    if (lowerLang === "cs" || lowerLang === "c#") {
        return "csharp";
    }
    if (lowerLang === "fs" || lowerLang === "f#") {
        return "fsharp";
    }
    if (lowerLang === "sas") {
        return "SAS";
    }
    return lowerLang;
}

export function sameLanguage(kernelLanguage: string, language: string): boolean {
    return usualLanguageName(kernelLanguage) === usualLanguageName(language);
}

export function setMainAndCellLanguage(
    metadata: Record<string, any>, 
    cells: any[], 
    ext: string, 
    customCellMagics: string[]
): void {
    let mainLanguage = defaultLanguageFromMetadataAndExt(metadata, ext);

    if (mainLanguage === null) {
        const languages: Record<string, number> = { "python": 0.5 };
        for (const cell of cells) {
            if (cell.metadata?.language) {
                const language = usualLanguageName(cell.metadata.language);
                languages[language] = (languages[language] || 0.0) + 1;
            }
        }

        mainLanguage = Object.keys(languages).reduce((a, b) => 
            languages[a] > languages[b] ? a : b
        );
    }

    // Save main language when no kernel is set
    if (!metadata.kernelspec?.language && cells.length > 0) {
        metadata.jupytext = metadata.jupytext || {};
        metadata.jupytext.main_language = mainLanguage;
    }

    // Remove 'language' metadata and add a magic if not main language
    for (const cell of cells) {
        if (cell.metadata?.language) {
            const language = cell.metadata.language;
            if (language === mainLanguage) {
                delete cell.metadata.language;
                continue;
            }

            if (usualLanguageName(language) === mainLanguage) {
                continue;
            }

            if (JUPYTER_LANGUAGES.has(language) || customCellMagics.includes(language)) {
                delete cell.metadata.language;
                const magic = mainLanguage !== "csharp" ? "%%" : "#!";
                const currentSource = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                if (cell.metadata.magic_args) {
                    const magicArgs = cell.metadata.magic_args;
                    delete cell.metadata.magic_args;
                    cell.source = `${magic}${language} ${magicArgs}\n${currentSource}`;
                } else {
                    cell.source = `${magic}${language}\n${currentSource}`;
                }
            }
        }
    }
}

export function cellLanguage(
    source: string[], 
    defaultLanguage: string, 
    customCellMagics: string[]
): [string | null, string | null] {
    if (source.length > 0) {
        const line = source[0];
        if (defaultLanguage === "go" && GO_DOUBLE_PERCENT_COMMAND.test(line)) {
            return [null, null];
        }
        if (defaultLanguage === "csharp") {
            if (line.startsWith("#!")) {
                const lang = line.slice(2).trim();
                if (JUPYTER_LANGUAGES.has(lang)) {
                    source.shift();
                    return [lang, ""];
                }
            }
        } else if (line.startsWith("%%")) {
            const magic = line.slice(2);
            let lang: string;
            let magicArgs: string;
            
            if (magic.includes(" ")) {
                [lang, magicArgs] = magic.split(" ", 2);
            } else {
                lang = magic;
                magicArgs = "";
            }

            if (JUPYTER_LANGUAGES.has(lang) || customCellMagics.includes(lang)) {
                source.shift();
                return [lang, magicArgs];
            }
        }
    }

    return [null, null];
}

export function commentLines(lines: string[], prefix: string, suffix: string = ""): string[] {
    if (!prefix) {
        return lines;
    }
    if (!suffix) {
        return lines.map(line => line ? `${prefix} ${line}` : prefix);
    }
    return lines.map(line => 
        line ? `${prefix} ${line} ${suffix}` : `${prefix} ${suffix}`
    );
}
