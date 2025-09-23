/*
* html.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/

import Token from "markdown-it/lib/token";
import { readAttrValue } from "./markdownit";

export interface DecoratorOptions {
  customClass?: string;
  hide: {
    id?: boolean;
    classes?: boolean;
    attributes?: boolean;
  }
}

export const decorator = (contents: string[], customClass?: string) => {
  if (contents.length > 0) {
    // Provide a decorator with the attributes
    return `<div class="quarto-attribute-decorator${customClass ? ' ' + customClass : ""}">${contents.map(decoratorSpan).join("")}</div>`  
  } else {
    // There is no decorator - no attributes
    return "";
  }
}

export const attributeDecorator = (token: Token, options?: DecoratorOptions) => {
  // id
  const id = readAttrValue("id", token.attrs);
  
  // classes
  const clz = readAttrValue("class", token.attrs);

  // other attributes
  const otherAttrs = token.attrs?.filter((attr) => { return attr[0] !== "id" && attr[0] !== "class"});

  // Create a decorator for the div
  const contents: string[] = [];
  if (id && !options?.hide.id) {
    contents.push(`#${id}`);
  } 
  if (clz && !options?.hide.classes) {
    const clzStr = clz.split(" ").map((cls) => `.${cls}`).join(" ");
    contents.push(clzStr);
  }
  if (otherAttrs && otherAttrs.length > 0 && !options?.hide.attributes) {
    const otherAttrStr = otherAttrs?.map((attr) => {
      return `${attr[0]}="${attr[1]}"`
    }).join(" ");
    contents.push(otherAttrStr);
  }
  return decorator(contents, options?.customClass);
}

const decoratorSpan = (contents: string) => {
  return `<span class="quarto-attribute-decorator-content">${contents}</span>`
}

