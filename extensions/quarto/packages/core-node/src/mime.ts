/* eslint-disable @typescript-eslint/naming-convention */
/*
 * mime.ts
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

import { extname } from "node:path";

export const kTextHtml = "text/html";
export const kTextMarkdown = "text/markdown";
export const kTextXml = "text/xml";
export const kTextLatex = "text/latex";
export const kTextPlain = "text/plain";
export const kImagePng = "image/png";
export const kImageJpeg = "image/jpeg";
export const kImageSvg = "image/svg+xml";
export const kApplicationPdf = "application/pdf";
export const kApplicationJavascript = "application/javascript";
export const kApplicationJupyterWidgetState =
  "application/vnd.jupyter.widget-state+json";
export const kApplicationJupyterWidgetView =
  "application/vnd.jupyter.widget-view+json";

export const kRestructuredText = "text/restructuredtext";
export const kApplicationRtf = "application/rtf";

export function extensionForMimeImageType(mimeType: string) {
  switch (mimeType) {
    case kImagePng:
      return "png";
    case kImageJpeg:
      return "jpeg";
    case kImageSvg:
      return "svg";
    case kApplicationPdf:
      return "pdf";
    default:
      return "bin";
  }
}

export function contentType(path: string): string | undefined {
  return MEDIA_TYPES[extname(path.toLowerCase())];
}

export function isPdfContent(path?: string) {
  return path && contentType(path) === kApplicationPdf;
}

export function isHtmlContent(path?: string) {
  return path && contentType(path) === kTextHtml;
}

export function isTextContent(path?: string) {
  return (
    path &&
    (contentType(path) === kTextMarkdown ||
      contentType(path) === kTextPlain ||
      contentType(path) === kTextXml)
  );
}

export function isIpynbContent(path?: string) {
  return !!path && path.toLowerCase().endsWith(".ipynb");
}

const MEDIA_TYPES: Record<string, string> = {
  ".md": kTextMarkdown,
  ".markdown": kTextMarkdown,
  ".html": kTextHtml,
  ".htm": kTextHtml,
  ".json": "application/json",
  ".map": "application/json",
  ".txt": kTextPlain,
  ".tex": kTextPlain,
  ".adoc": kTextPlain,
  ".asciidoc": kTextPlain,
  ".xml": "text/xml",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".js": "application/javascript",
  ".jsx": "text/jsx",
  ".gz": "application/gzip",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".mjs": "application/javascript",
  ".svg": kImageSvg,
  ".png": kImagePng,
  ".jpg": kImageJpeg,
  ".jpeg": kImageJpeg,
  ".pdf": kApplicationPdf,
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".textile": kTextPlain,
  ".texinfo": kTextPlain,
  ".tei": kTextPlain,
  ".rst": kTextPlain,
  ".org": kTextPlain,
  ".opml": kTextPlain,
  ".muse": kTextPlain,
  ".ms": kTextPlain,
  ".native": kTextPlain,
  ".man": kTextPlain,
  ".dokuwiki": kTextPlain,
  ".haddock": kTextPlain,
  ".icml": kTextPlain,
  ".jira": kTextPlain,
  ".mediawiki": kTextPlain,
  ".xwiki": kTextPlain,
  ".zim": kTextPlain,
};
