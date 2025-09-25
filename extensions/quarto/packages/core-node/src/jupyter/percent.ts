/*
/*
 * percent.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
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

// IMPORTANT: This is a port of https://github.com/quarto-dev/quarto-cli/blob/main/src/execute/jupyter/percent.ts
// Changes to this file should also be propagated to that file and vice-versa

import path from 'node:path';
import fs from 'node:fs';

import { Metadata, asYamlText, lines, metadataFromKeyvalueText, trimEmptyLines } from "../../../core/src/index.js";
import { kApplicationJavascript, kApplicationRtf, kRestructuredText, kTextHtml, kTextLatex } from "../mime.js";

const kCellRawMimeType = "raw_mimetype";

export const kJupyterPercentScriptExtensions = [
  ".py",
  ".jl",
  ".r",
];

export function isJupyterPercentScript(file: string, contents?: string) {
  const ext = path.extname(file).toLowerCase();
  if (kJupyterPercentScriptExtensions.includes(ext)) {
    contents = contents || fs.readFileSync(file, { encoding: "utf-8" });
    return !!contents.trim().match(/^\s*#\s*%%+\s+\[markdown|raw\]/);
  } else {
    return false;
  }
}

export function markdownFromJupyterPercentScript(file: string, contents: string, maxCells?: number) {
  // determine language/kernel
  const ext = path.extname(file).toLowerCase();
  const language = ext === ".jl" ? "julia" : ext === ".r" ? "r" : "python";

  // break into cells
  contents = contents || fs.readFileSync(file, { encoding: "utf-8"});
  const cells: PercentCell[] = [];
  const activeCell = () => cells[cells.length - 1];
  for (const line of lines(contents.trim())) {
    const header = percentCellHeader(line);
    if (header) {
      cells.push({ header, lines: [] });
    } else {
      activeCell()?.lines.push(line);
    }
  }

  // functions to resolve markdown and raw cells
  const isTripleQuote = (line: string) => !!line.match(/^"{3,}\s*$/);
  const asCell = (lines: string[]) => lines.join("\n") + "\n\n";
  const stripPrefix = (line: string) => line.replace(/^#\s?/, "");
  const cellContent = (cellLines: string[]) => {
    if (
      cellLines.length > 2 && isTripleQuote(cellLines[0]) &&
      isTripleQuote(cellLines[cellLines.length - 1])
    ) {
      return asCell(cellLines.slice(1, cellLines.length - 1));
    } else {
      // commented
      return asCell(cellLines.map(stripPrefix));
    }
  };

  return cells.reduce((markdown, cell, index) => {
    // enforce max cells
    if (maxCells !== undefined && index > maxCells) {
      return markdown;
    }

    const cellLines = trimEmptyLines(cell.lines);
    if (cell.header.type === "code") {
      if (cell.header.metadata) {
        const yamlText = asYamlText(cell.header.metadata);
        cellLines.unshift(...lines(yamlText).map((line) => `#| ${line}`));
      }
      markdown += asCell(["```{" + language + "}", ...cellLines, "```"]);
    } else if (cell.header.type === "markdown") {
      markdown += cellContent(cellLines);
    } else if (cell.header.type == "raw") {
      let rawContent = cellContent(cellLines);
      const format = cell.header?.metadata?.["format"];
      const mimeType = cell.header.metadata?.[kCellRawMimeType];
      if (typeof (mimeType) === "string") {
        const rawBlock = mdRawOutput(mimeType, lines(rawContent));
        rawContent = rawBlock || rawContent;
      } else if (typeof (format) === "string") {
        rawContent = mdFormatOutput(format, lines(rawContent));
      }
      markdown += rawContent;
    }
    return markdown;
  }, "");
}

interface PercentCell {
  header: PercentCellHeader;
  lines: string[];
}

interface PercentCellHeader {
  type: "code" | "raw" | "markdown";
  metadata?: Metadata;
}

function percentCellHeader(line: string): PercentCellHeader | undefined {
  const match = line.match(
    /^\s*#\s*%%+\s*(?:\[(markdown|raw)\])?\s*(.*)?$/,
  );
  if (match) {
    const type = match[1] || "code";
    const attribs = match[2] || "";
    if (["code", "raw", "markdown"].includes(type)) {
      return {
        type,
        metadata: parsePercentAttribs(attribs),
      } as PercentCellHeader;
    } else {
      throw new Error(`Invalid cell type: ${type}`);
    }
  }
  return undefined;
}

function parsePercentAttribs(
  attribs: string,
): Metadata | undefined {
  // skip over title
  const match = attribs.match(/[\w-]+=.*$/);
  if (match) {
    return metadataFromKeyvalueText(match[0], " ");
  }
  return undefined;
}


function mdRawOutput(mimeType: string, source: string[]): string {
  switch (mimeType) {
    case kTextHtml:
      return mdHtmlOutput(source);
    case kTextLatex:
      return mdLatexOutput(source);
    case kRestructuredText:
      return mdFormatOutput("rst", source);
    case kApplicationRtf:
      return mdFormatOutput("rtf", source);
    case kApplicationJavascript:
      return mdScriptOutput(mimeType, source);
    default:
      return source.join("\n");
  }
}


function mdLatexOutput(latex: string[]) {
  return mdFormatOutput("tex", latex);
}

function mdHtmlOutput(html: string[]) {
  return mdFormatOutput("html", html);
}

function mdScriptOutput(mimeType: string, script: string[]) {
  const scriptTag = [
    `<script type="${mimeType}">\n`,
    ...script,
    "\n</script>",
  ];
  return mdHtmlOutput(scriptTag);
}

function mdFormatOutput(format: string, source: string[]) {
  const ticks = ticksForCode(source);
  return mdEnclosedOutput(ticks + "{=" + format + "}", source, ticks);
}

function ticksForCode(code: string[]) {
  const n = Math.max(3, countTicks(code) + 1);
  return "`".repeat(n);
};

function countTicks(code: string[]) {
  // FIXME do we need trim() here?
  const countLeadingTicks = (s: string) => {
    // count leading ticks using regexps
    const m = s.match(/^\s*`+/);
    if (m) {
      return m[0].length;
    } else {
      return 0;
    }
  };
  return Math.max(0, ...code.map((s) => countLeadingTicks(s)));
};

function mdEnclosedOutput(begin: string, text: string[], end: string) {
  const output = text.join("");
  const md: string[] = [
    begin + "\n",
    output + (output.endsWith("\n") ? "" : "\n"),
    end + "\n",
  ];
  return md.join("");
}


