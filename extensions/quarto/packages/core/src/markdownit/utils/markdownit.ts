/*
* markdownit.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/

export const hasClass = (clz: string, attrs: null | [string, string][]) => {
  if (attrs === null) {
    return false
  }

  const classes = readAttrValue("class", attrs);
  if (classes === null) {
    return false;
  } else {
    return classes?.split(" ").includes(clz);
  }


}

export const readAttrValue = (name: string, attrs: null | [string, string][]) => {
  if (attrs === null) {
    return undefined;
  }

  const attr = attrs.find((attr) => { return attr[0] === name; });
  return attr ? attr[1] : undefined;
}

export const addClass = (clz: string, attrs: null | [string, string][]): [string, string][] => {
  if (attrs === null) {
    attrs = []
    attrs.push(["class", clz])
    return attrs;
  } else {
    const clzIdx = attrs.findIndex((attr) => attr[0] === "class");
    if (clzIdx >= 0) {
      const currentClz = attrs[clzIdx];
      attrs[clzIdx] = ["class", `${currentClz[1]} ${clz}`.trim()];
      return attrs;
    } else {
      attrs.push(["class", clz])
      return attrs; 
    }
  }
}
