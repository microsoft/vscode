/*
 * render-assist.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 2020 Matt Bierner
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import MarkdownIt from "markdown-it";
import markdownItHljs from "markdown-it-highlightjs";

import {
  Uri,
  window,
  CancellationToken,
  Webview,
  TextEditor,
  commands,
  MarkedString,
  Hover,
  MarkdownString,
  SignatureHelp,
  SignatureInformation,
  Range,
  Position,
} from "vscode";
import { JsonRpcRequestTransport, escapeRegExpCharacters } from "core";
import { CodeViewCellContext, kCodeViewAssist } from "../../types/local-types";
import { embeddedLanguage } from "../../vdoc/languages";
import { virtualDocForCode, withVirtualDocUri } from "../../vdoc/vdoc";
import { getHover, getSignatureHelpHover } from "../../core/hover";
import { Hover as LspHover } from "vscode-languageserver-types";
import { MarkupContent } from "vscode-languageclient";

const kAssistHelp = "Quarto: Help";
const kAssistEquation = "Quarto: Equation";
const kAssistImage = "Quarto: Image";

export function renderWebviewHtml(webview: Webview, extensionUri: Uri) {
  const nonce = scriptNonce();
  const scriptUri = webview.asWebviewUri(assetUri("assist.js", extensionUri));
  const styleUri = webview.asWebviewUri(assetUri("assist.css", extensionUri));

  return /* html */ `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">

      <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src data: https:;
        ">

      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      <link href="${styleUri}" rel="stylesheet">

      <title>Quarto Lens</title>
    </head>
    <body>
      <article id="main" role="document" tabindex="0"></article>

      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
}

export interface Assist {
  type: string;
  html: string;
}

export async function renderCodeViewAssist(
  context: CodeViewCellContext,
  lspRequest: JsonRpcRequestTransport,
  asWebviewUri: (uri: Uri) => Uri,
  token: CancellationToken
): Promise<Assist | undefined> {

  if (context.language === "yaml") {
    const hover = (await lspRequest(kCodeViewAssist, [context])) as LspHover | undefined;
    if (hover) {
      const contents = [new MarkdownString((hover.contents as MarkupContent).value)];
      const range = hover.range
        ? new Range(
          hover.range.start.line,
          hover.range.start.character,
          hover.range.end.line,
          hover.range.end.character
        )
        : undefined;
      const assist = getAssistFromHovers([{ contents, range }], asWebviewUri);
      if (assist) {
        return assist;
      }
    }
    return undefined;

  } else {
    const language = embeddedLanguage(context.language);
    if (language) {
      const vdoc = virtualDocForCode(context.code, language);
      const parentUri = Uri.file(context.filepath);
      return await withVirtualDocUri<Assist | undefined>(vdoc, parentUri, "hover", async (uri: Uri) => {
        try {
          const position = new Position(context.selection.start.line, context.selection.start.character);

          // check for hover
          const hover = await getHover(uri, language, position);
          if (hover) {
            const assist = getAssistFromHovers([hover], asWebviewUri);
            if (assist) {
              return assist;
            }
          }

          if (token.isCancellationRequested) {
            return undefined;
          }

          // check for signature tip
          const signatureHover = await getSignatureHelpHover(uri, language, position);
          if (signatureHover) {
            return getAssistFromSignatureHelp(signatureHover);
          }
        } catch (error) {
          console.error(error);
        }

        return undefined;

      });
    } else {
      return undefined;
    }
  }


}

export async function renderActiveAssist(
  asWebviewUri: (uri: Uri) => Uri,
  token: CancellationToken
): Promise<Assist | undefined> {

  // first check for an active text editor
  const editor = window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  // get hovers
  const hovers = await getHoversAtCurrentPositionInEditor(editor);
  if (token.isCancellationRequested) {
    return undefined;
  }

  // see if we can create an assist from the hovers
  const assist = getAssistFromHovers(hovers, asWebviewUri);
  if (assist) {
    return assist;
  }
  if (token.isCancellationRequested) {
    return undefined;
  }

  // get signature help and try to create an assist
  const help = await getSignatureHelpAtCurrentPositionInEditor(editor);
  if (help) {
    return getAssistFromSignatureHelp(help);
  } else {
    return undefined;
  }
}

function getHoversAtCurrentPositionInEditor(editor: TextEditor) {
  return commands.executeCommand<Hover[]>(
    "vscode.executeHoverProvider",
    editor.document.uri,
    editor.selection.active
  );
}

function getSignatureHelpAtCurrentPositionInEditor(editor: TextEditor) {
  return commands.executeCommand<SignatureHelp>(
    "vscode.executeSignatureHelpProvider",
    editor.document.uri,
    editor.selection.active
  );
}

function getAssistFromHovers(hovers: Hover[], asWebviewUri: (uri: Uri) => Uri) {
  const parts = hovers
    .flatMap((hover) => hover.contents)
    .map((content) => getMarkdown(content))
    .filter((content) => content.length > 0)
    .filter(content => !content.includes("command:gitlens"));

  if (parts.length === 0) {
    return undefined;
  }

  const markdown = parts.join("\n---\n");
  if (filterHoverAssist(markdown)) {
    return renderAssist(assistType(markdown), markdown, asWebviewUri);
  } else {
    return undefined;
  }
}

function assistType(markdown: string) {
  if (isEquation(markdown)) {
    return kAssistEquation;
  } else if (isImage(markdown)) {
    return kAssistImage;
  } else {
    return kAssistHelp;
  }
}

function filterHoverAssist(markdown: string) {
  return (
    (!markdown.match(/^```\w*\n.*?\n```\s*$/) &&
      markdown.indexOf("\n") !== -1) ||
    isEquation(markdown) ||
    isImage(markdown)
  );
}

function isEquation(markdown: string) {
  return markdown.startsWith("![equation]");
}

function isImage(markdown: string) {
  return markdown.startsWith("![") || markdown.startsWith("<img src");
}

function getAssistFromSignatureHelp(help: SignatureHelp) {
  // no signatures means no help
  if (help.signatures.length === 0) {
    return undefined;
  }

  // build up markdown for signature
  const markdown: string[] = [];
  const signature = help.signatures[help.activeSignature] || help.signatures[0];
  const activeParameterIndex =
    signature.activeParameter ?? help.activeParameter;

  if (signature.label) {
    markdown.push("");
    const preCode = `<pre class="signature"><code>`;
    if (signature.parameters.length > 0) {
      markdown.push(
        preCode + renderParameters(signature, activeParameterIndex)
      );
    } else {
      markdown.push(preCode + signature.label);
    }
    markdown.push(`</code></pre>`);
  }

  const activeParameter = signature.parameters[activeParameterIndex];
  if (activeParameter?.documentation) {
    markdown.push("");
    markdown.push(getMarkdown(activeParameter.documentation));
  }

  if (signature.documentation) {
    markdown.push("\n");
    markdown.push(getMarkdown(signature.documentation));
  }

  if (markdown.length > 0) {
    return renderAssist(kAssistHelp, markdown.join("\n"));
  } else {
    return undefined;
  }
}

function renderParameters(
  signature: SignatureInformation,
  activeParameterIndex: number
) {
  const [start, end] = getParameterLabelOffsets(
    signature,
    activeParameterIndex
  );

  const parameters = `${signature.label.substring(
    0,
    start
  )}<span class="parameter active">${signature.label.substring(
    start,
    end
  )}</span>${signature.label.substring(end)}`;

  return parameters;
}

function getParameterLabelOffsets(
  signature: SignatureInformation,
  paramIdx: number
): [number, number] {
  const param = signature.parameters[paramIdx];
  if (!param) {
    return [0, 0];
  } else if (Array.isArray(param.label)) {
    return param.label;
  } else if (!param.label.length) {
    return [0, 0];
  } else {
    const regex = new RegExp(
      `(\\W|^)${escapeRegExpCharacters(param.label)}(?=\\W|$)`,
      "g"
    );
    regex.test(signature.label);
    const idx = regex.lastIndex - param.label.length;
    return idx >= 0 ? [idx, regex.lastIndex] : [0, 0];
  }
}

function getMarkdown(content: MarkedString | MarkdownString | string): string {
  if (typeof content === "string") {
    return content;
  } else if (content instanceof MarkdownString) {
    return content.value;
  } else {
    const markdown = new MarkdownString();
    markdown.appendCodeblock(content.value, content.language);
    return markdown.value;
  }
}

function renderAssist(
  type: string,
  markdown: string,
  asWebviewUri?: (uri: Uri) => Uri
) {
  const md = MarkdownIt("default", {
    html: true,
    linkify: true,
  });
  const validateLink = md.validateLink;
  md.validateLink = (link: string) => {
    return (
      validateLink(link) ||
      link.startsWith("vscode-resource:") ||
      link.startsWith("file:") ||
      /^data:image\/.*?;/.test(link)
    );
  };
  md.use(markdownItHljs, {
    auto: true,
    code: true,
  });
  let html = md.render(markdown).trim();

  // replace image paths with webview safe ones
  if (asWebviewUri) {
    const imgPattern = /^<img src="([^"]+)"(.*?>)$/;
    const imgMatch = html.match(imgPattern);
    if (imgMatch) {
      const webviewUri = asWebviewUri(Uri.file(imgMatch[1]));
      html = `<img src="${webviewUri.toString()}"${imgMatch[2]}`;
    }
  }

  return {
    type,
    html,
  };
}

function scriptNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function assetUri(file: string, extensionUri: Uri) {
  return Uri.joinPath(extensionUri, "assets", "www", "assist", file);
}
