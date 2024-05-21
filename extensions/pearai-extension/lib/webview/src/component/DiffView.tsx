import React from "react";
import DiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { sendMessage } from "../vscode/SendMessage";

// @ts-expect-error Somehow the component can only be accessed from .default
const ReactDiffViewer = DiffViewer.default;

interface DiffViewProps {
	oldCode: string;
	newCode: string;
	languageId?: string;
}

export const DiffView: React.FC<DiffViewProps> = ({
	oldCode,
	newCode,
	languageId,
}) => {
	const { grammar, language } = toPrismHighlightOptions(languageId);
	const { highlight } = getPrism();

	return (
		<ReactDiffViewer
			oldValue={oldCode}
			newValue={newCode}
			splitView
			showDiffOnly
			extraLinesSurroundingDiff={3}
			compareMethod={DiffMethod.WORDS}
			renderContent={(str: string | undefined) => {
				return (
					<pre
						style={{ display: "inline" }}
						dangerouslySetInnerHTML={{
							__html: highlight(str ?? "", grammar, language),
						}}
					/>
				);
			}}
			styles={{
				variables: {
					light: {
						fontFamily: "var(--vscode-editor-font-family)",
						fontSize: "var(--vscode-editor-font-size)",

						// Documented properties: https://github.com/praneshr/react-diff-viewer/tree/v3.0.0#overriding-styles
						diffViewerBackground: "var(--vscode-editor-background)",
						diffViewerColor: "var(--vscode-editor-foreground)",

						addedBackground: "var(--vscode-diffEditor-insertedLineBackground)",
						addedColor: "var(--vscode-editor-foreground)",
						wordAddedBackground:
							"var(--vscode-diffEditor-insertedLineBackground)",

						removedBackground: "var(--vscode-diffEditor-removedLineBackground)",
						removedColor: "var(--vscode-editor-foreground)",
						wordRemovedBackground:
							"var(--vscode-diffEditor-removedLineBackground)",

						highlightBackground:
							"var(--vscode-editor-rangeHighlightBackground)",
						highlightGutterBackground:
							"var(--vscode-editor-rangeHighlightBackground)",

						codeFoldGutterBackground: "var(--vscode-editorGutter-background)",
						codeFoldBackground: "var(--vscode-diffEditor-diagonalFill)",

						emptyLineBackground: "var(--vscode-editor-background)",

						gutterColor: "var(--vscode-editorLineNumber-foreground)",
						addedGutterColor: "var(--vscode-editorLineNumber-foreground)",
						removedGutterColor: "var(--vscode-editorLineNumber-foreground)",
						addedGutterBackground: "var(--vscode-editorGutter-addedBackground)",
						removedGutterBackground:
							"var(--vscode-editorGutter-deletedBackground)",
						gutterBackground: "var(--vscode-editorGutter-background)",
						gutterBackgroundDark: "var(--vscode-editorGutter-background)",

						codeFoldContentColor:
							"var(--vscode-editorGutter-foldingControlForeground)",
						diffViewerTitleBackground: "var(--vscode-editor-background)",
						diffViewerTitleColor: "var(--vscode-editor-foreground)",
						diffViewerTitleBorderColor:
							"var(--vscode-sideBySideEditor-horizontalBorder)",
					},
				},
				contentText: {
					fontFamily: "var(--vscode-editor-font-family) !important",
				},
				gutter: {
					borderLeft: "1px solid var(--vscode-panel-border)",
					borderRight: "1px solid var(--vscode-panel-border)",
					"> pre": {
						opacity: 1,
					},
					"&:first-child": {
						borderLeft: "none",
					},
				},
				marker: {
					paddingLeft: "5px",
					paddingRight: "0px",
					"> pre": {
						display: "none",
					},
				},
				codeFoldGutter: {
					background: "var(--vscode-panel-background)",
				},
				codeFold: {
					borderTop: "1px solid var(--vscode-panel-border)",
					borderBottom: "1px solid var(--vscode-panel-border)",
					background: "var(--vscode-panel-background)",
					"&:last-child": {
						borderBottom: "none",
					},
					"&:first-child": {
						borderTop: "none",
					},
					"> td > a": {
						textDecoration: "none !important",
					},
				},
			}}
		/>
	);
};

/**
 * Source: https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
 */
const VSCODE_SUPPORTED_LANGUAGES = [
	"abap",
	"bat",
	"bibtex",
	"clojure",
	"coffeescript",
	"c",
	"cpp",
	"csharp",
	"cuda-cpp",
	"css",
	"diff",
	// From https://marketplace.visualstudio.com/items?itemName=batisteo.vscode-django
	"django-html",
	"django-txt",
	"dockerfile",
	"fsharp",
	"git-commit and git-rebase",
	"go",
	"groovy",
	"handlebars",
	"haml",
	"html",
	"ini",
	"java",
	"javascript",
	"javascriptreact",
	"json",
	"jsonc",
	"latex",
	"less",
	"lua",
	"makefile",
	"markdown",
	"objective-c",
	"objective-cpp",
	"perl and perl6",
	"php",
	"plaintext",
	"powershell",
	"jade, pug",
	"python",
	"r",
	"razor",
	"ruby",
	"rust",
	"scss (syntax using curly brackets), sass (indented syntax)",
	"shellscript",
	"slim",
	"sql",
	"stylus",
	"swift",
	"typescript",
	"typescriptreact",
	"tex",
	// From https://marketplace.visualstudio.com/items?itemName=mblode.twig-language-2
	"twig",
	"vb",
	"vue",
	"vue-html",
	"xml",
	"xsl",
	"yaml",
] as const;

type VSCodeLanguage = (typeof VSCODE_SUPPORTED_LANGUAGES)[number];

// `(string & {})` forces TS to resolve the type
// It allows any string, but still auto-completes known values from the union
// eslint-disable-next-line @typescript-eslint/ban-types
type VSCodeLanguageOrAnyString = VSCodeLanguage | (string & {});

type PrismHighlightOptions = {
	grammar: Prism.Grammar;
	language: string;
};

function toPrismHighlightOptions(
	languageId: VSCodeLanguageOrAnyString | undefined
): PrismHighlightOptions {
	// Check out the asset/prism.js file to see what languages we support
	const { languages } = getPrism();

	const DEFAULT_PRISM_OPTIONS: PrismHighlightOptions = {
		grammar: languages.text,
		language: "text",
	};

	if (!languageId) {
		return DEFAULT_PRISM_OPTIONS;
	}

	switch (languageId) {
		case "javascript":
		case "vue":
		case "coffeescript":
			return {
				grammar: languages.javascript,
				language: "javascript",
			};

		case "typescript":
			return {
				grammar: languages.typescript,
				language: "typescript",
			};

		case "javascriptreact":
			return {
				grammar: languages.jsx,
				language: "jsx",
			};

		case "typescriptreact":
			return {
				grammar: languages.tsx,
				language: "tsx",
			};

		case "json":
		case "jsonc":
			return {
				grammar: languages.json,
				language: "json",
			};

		case "markdown":
			return {
				grammar: languages.markdown,
				language: "markdown",
			};

		case "java":
			return {
				grammar: languages.java,
				language: "java",
			};

		case "html":
		case "vue-html":
		case "django-html":
			return {
				grammar: languages.html,
				language: "html",
			};

		case "xml":
			return {
				grammar: languages.xml,
				language: "xml",
			};

		case "css":
			return {
				grammar: languages.css,
				language: "css",
			};

		case "python":
			return {
				grammar: languages.python,
				language: "python",
			};

		case "powershell":
			return {
				grammar: languages.powershell,
				language: "powershell",
			};

		case "php":
			return {
				grammar: languages.php,
				language: "php",
			};

		case "go":
			return {
				grammar: languages.go,
				language: "go",
			};

		case "ruby":
			return {
				grammar: languages.ruby,
				language: "ruby",
			};

		case "rust":
			return {
				grammar: languages.rust,
				language: "rust",
			};

		case "shellscript":
			return {
				grammar: languages.bash,
				language: "bash",
			};

		case "sql":
			return {
				grammar: languages.sql,
				language: "sql",
			};

		case "twig":
			return {
				grammar: languages.twig,
				language: "twig",
			};

		case "yaml":
			return {
				grammar: languages.yaml,
				language: "yaml",
			};

		case "dockerfile": {
			return {
				grammar: languages.docker,
				language: "docker",
			};
		}

		case "csharp":
			return {
				grammar: languages.csharp,
				language: "csharp",
			};

		case "cpp":
			return {
				grammar: languages.cpp,
				language: "cpp",
			};

		case "dart":
			return {
				grammar: languages.dart,
				language: "dart",
			};

		case "haskell":
			return {
				grammar: languages.haskell,
				language: "haskell",
			};

		// If you want to use new grammar, make sure to update the prism.js file

		case "plaintext":
		case "django-txt":
		case "diff":
			return DEFAULT_PRISM_OPTIONS;

		default:
			sendMessage({
				type: "reportError",
				error: {
					title: `Unable to highlight syntax for language ${languageId}`,
					message: `We could not find a matching Prism grammar for language ${languageId}. We used the default one (${DEFAULT_PRISM_OPTIONS.language}). Please [open an issue](https://github.com/trypear/pearai-app/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=Add%20syntax%20highlight%20for%20language%20%22${languageId}%22) to ask for supporting this language.`,
					level: "warning",
					disableRetry: true,
				},
			});
			return DEFAULT_PRISM_OPTIONS;
	}
}

function getPrism() {
	if (!globalThis) {
		throw new Error("Prism should be loaded for DiffView to work");
	}

	return globalThis.Prism;
}
