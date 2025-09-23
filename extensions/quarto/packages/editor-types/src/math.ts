/*
 * math.ts
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


export const kMathMathjaxTypesetSvg = 'math_mathjax_typeset_svg';

export interface MathjaxTypesetOptions {
  format: "svg" | "data-uri";
  theme: "light" | "dark";
  scale: number;
  extensions: readonly MathjaxSupportedExtension[];
}

export interface MathjaxTypesetResult {
  math?: string;
  error?: string;
}

export type MathjaxSupportedExtension =
  | "action"
  | "ams"
  | "amscd"
  | "autoload"
  | "base"
  | "bbox"
  | "boldsymbol"
  | "braket"
  | "bussproofs"
  | "cancel"
  | "cases"
  | "centernot"
  | "color"
  | "colortbl"
  | "colorv2"
  | "configmacros"
  | "empheq"
  | "enclose"
  | "extpfeil"
  | "gensymb"
  | "html"
  | "mathtools"
  | "mhchem"
  | "newcommand"
  | "noerrors"
  | "noundefined"
  | "physics"
  | "require"
  | "setoptions"
  | "tagformat"
  | "textcomp"
  | "textmacros"
  | "unicode"
  | "upgreek"
  | "verb";


export interface MathServer {
  mathjaxTypeset: (math: string, options: MathjaxTypesetOptions, docPath: string | null) => Promise<MathjaxTypesetResult>;
}

