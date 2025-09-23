/* eslint-disable @typescript-eslint/no-explicit-any */
import MarkdownIt from "markdown-it";
import Mermaid from "mermaid";

export default function mermaidPlugin(md: MarkdownIt, options: { dark?: boolean}) {


  const kLang = "mermaid";
  const kContainer = "quarto-mermaid";

  Mermaid.initialize({
    securityLevel: "loose",
    theme: options.dark ? "dark" : "default",
    ...options,
  });

  const defaultFenceRenderer = md.renderer.rules.fence;

  // Render custom code types as SVGs, letting the fence parser do all the heavy lifting.
  function mermaidFenceRenderer(
    tokens: any[],
    idx: number,
    options: any,
    env: any,
    slf: any
  ) {
    const token = tokens[idx];
    if (token.info === kLang || (token.attrs !== null && token.attrs.length === 1 && token.attrs[0][0] === kLang))  {
      let imageHTML = "";
      const imageAttrs: string[][] = [];
  
      // Create element to render into
      const element = document.createElement("div");
      document.body.appendChild(element);
  
      // Render with Mermaid
      try {
        Mermaid.mermaidAPI.render(
          kContainer,
          token.content,
          (html: string) => {
            // We need to forcibly extract the max-width/height attributes to set on img tag
            const mermaidEl = document.getElementById(kContainer);
            if (mermaidEl !== null) {
              imageAttrs.push([
                "style",
                `max-width:${mermaidEl.style.maxWidth};max-height:${mermaidEl.style.maxHeight}`,
              ]);
            }
            // Store HTML
            imageHTML = html;
          },
          element
        );
      } catch (e) {
        return `<pre>Failed to render mermaid diagram.${e}</pre>`
      } finally {
        element.remove();
      }
  
      // Store encoded image data
      imageAttrs.push(["src", `data:image/svg+xml,${encodeURIComponent(imageHTML)}`]);
      return `<img ${slf.renderAttrs({ attrs: imageAttrs })}>`;
    } else {
      if (defaultFenceRenderer !== undefined) {
        return defaultFenceRenderer(tokens, idx, options, env, slf);
      }
      // Missing fence renderer!
      return "";
    }
  }
  md.renderer.rules.fence = mermaidFenceRenderer;
}