// Design space: Claude's instructions for a design, the subagent that writes one frame (so the frames
// of a design are written at the same time), and the scripts the canvas puts in its pages: comment mode,
// and the page that shows a design while it's being written. Pages run in sandboxed frames and talk by postMessage.
import type { DesignInfo, DesignKind } from '../shared/types'

const KIND_GUIDE: Record<DesignKind, string> = {
  prototype: `This is an interactive prototype. Make each frame work like the real product (buttons, tabs, menus, a modal, a form that responds) with fake data and in-memory state. Web pages are 1440×900 frames that must also work at 834px and 390px wide (the user can switch); a mobile app's screens are 390×844 frames.`,
  slides: `This is a slide deck: each slide is its own 1920×1080 frame in the section "Slides", titled "1 · Title", "2 · …" in order. Use a consistent master layout (title slide, section headers, content slides, a closing slide), large type (body text at least 28px), one idea per slide, charts drawn with inline SVG or CSS where numbers matter, and slide numbers. The deck exports as one PDF with a page per slide. A deck has several frames, so follow the steps for several frames, with the deck's look as the design system.`,
  wireframe: `This is a wireframe, low fidelity on purpose: grayscale only, simple boxes and lines, image placeholders (a box with a cross), real but short labels, and a plain system font. Focus on layout, hierarchy and flow rather than polish, with short notes on the key interactions. Each screen is its own frame (1440×900 for desktop, 390×844 for mobile).`,
  onepager: `This is a printable page, like a one-pager, flyer, poster, résumé or report page: an A4 frame (794×1123), or US Letter (816×1056) if the user asks for it, that fills the frame exactly and exports as one PDF page with its background.`,
  other: `Choose the format that fits the request (a landing page, poster, social media graphic, email, logo, icon set, …) and give the frame its real size.`
}

/** Instructions added to Claude's system prompt in a design. */
export function designPrompt(design: DesignInfo, cwd: string): string {
  const lines = [
    `<design kind="${design.kind}">`,
    `This chat is a design in LocalClaude's Design space, which works like Claude Design. Beside this chat the user sees a board: every artifact is a frame on it, in rows by section, each labeled with its title. They can zoom and pan, open a frame to use it (and view it at desktop, tablet and mobile widths), click any element to comment on it, go back to earlier versions, present the frames, and export them as PNG, PDF or HTML.`,
    ``,
    `How to work (the user is watching, so speed matters):`,
    `- Start right away. No to-do list, no exploring files${design.matchStyle ? ' beyond the style check below' : ''}, and keep your planning short. Make sensible choices and mention the main ones briefly; ask first only if the request is truly unclear.`,
    `- Every frame is one artifact of type "html": a complete, self-contained page with its CSS in a <style> in the head, then the content from top to bottom, then any JavaScript in one <script> at the end. Give it a title (its label on the board), a section, and its real size as width and height (390×844 for a phone screen, 1440×900 for a desktop page, 1920×1080 for a slide, 1200×900 for a board). Fonts, icons and libraries may load from public CDNs (Google Fonts, cdnjs, jsDelivr, unpkg). Use type "react" only if the user asks for it.`,
    `- One or two frames: write each yourself in ONE create_artifact call; the board shows it live as you write. Never write a skeleton to fill in later, and never split one frame over several calls.`,
    `- Three or more frames (a flow, several pages, light and dark versions, a deck): work in parallel, which is much faster.`,
    `  1. First write the design system in ONE create_artifact call: id "design-system", title "Design system", section "Design system", 1200×900. It's a board showing the palette (with contrast), the type scale and the key components, with every token as a CSS variable in one :root block and the components as reusable classes.`,
    `  2. Then, in ONE message, call the Agent tool once per frame with subagent_type "design-screen", all in that same message so they run at the same time. Give each a short brief: the design system's id, then the frame's id, title, section and size, what's on it and its real content. They read the design system themselves and write their own frame.`,
    `  3. Don't write those frames yourself.`,
    `- Keep each frame focused (about 150 to 400 lines). All content must be visible without JavaScript (no fade-in-on-scroll that starts invisible, no content rendered only by JS); use JavaScript for interaction only. Never embed base64 images or long data.`,
    `- Make it look finished and intentional: real, specific content (never lorem ipsum), a clear type hierarchy, consistent spacing on a 4/8px grid, a restrained palette with one accent color, accessible contrast, and hover, focus and active states for anything interactive. Use inline SVG, CSS shapes and gradients for illustrations and icons; use photos only from a stable URL (such as images.unsplash.com) and never leave a broken image.`,
    `- For changes, keep the frame's id and use update_artifact with old_str/new_str, one small replacement per call, instead of rewriting; rewrite with content only when most of the frame changes. When a change touches several frames, update them all in one message. Every change becomes a version the user can go back to. A new frame or section is fine whenever the user asks for one.`,
    `- When the user comments on an element, their message names the frame, the element's CSS selector, its text and the start of its HTML. Change that element as asked and keep the rest as it is.`,
    `- The design lives in the artifacts: don't create or edit files in the working folder unless the user asks you to.`,
    `- Reply in a sentence or two: what you made or changed, and perhaps one or two ideas for next steps. Don't paste the code into the chat.`,
    ``,
    KIND_GUIDE[design.kind] ?? KIND_GUIDE.other
  ]
  if (design.matchStyle)
    lines.push(
      ``,
      `Match the product in the working folder (${cwd}). Before designing, take a quick look (a handful of files, found with Glob or Grep) at its design system: theme tokens and CSS variables, Tailwind or other style config, global styles, the component library, fonts, and the logo. Use the same colors, type, radii, spacing and component patterns (copy small SVG logos and icons inline) in the design system board and every frame, and say in a line what you based the design on.`
    )
  lines.push('</design>')
  return lines.join('\n')
}

/** The subagent that writes one frame, so the frames of a design are written at the same time. */
export const SCREEN_AGENT = {
  description:
    "Designs one frame of the current design (a screen, page, slide or board) and saves it with create_artifact. Brief it with the design system's id, the frame id, title, section, size, what is on it and its content; it reads the design system itself.",
  prompt: [
    `You design one frame of a design in LocalClaude's Design space and save it as an artifact. Other designers are writing the other frames at the same time, so the shared design system keeps everything consistent.`,
    ``,
    `1. Read the design system: read_artifact with the id your brief gives for it. If the brief doesn't give one, call read_artifact with no id to list the frames, then read the one in the "Design system" section.`,
    `2. Write your frame in ONE create_artifact call: type "html", with the id, title, section, width and height from your brief, and a complete, self-contained page. Copy the design system's :root variables and the component classes you use into a <style> in the head, then write the content from top to bottom, then any JavaScript in one <script> at the end.`,
    `3. Reply with one short line saying what you made.`,
    ``,
    `The frame fills its size (a 390×844 phone screen shows one screen). Use real, specific content from your brief, never lorem ipsum. All content is visible without JavaScript; JavaScript is for interaction only. Keep it to about 150 to 400 lines, with icons as small inline SVG and no base64 images. Start writing right away: don't read other files, don't make other artifacts, and don't ask questions.`
  ].join('\n'),
  tools: ['mcp__artifacts__read_artifact', 'mcp__artifacts__create_artifact', 'mcp__artifacts__update_artifact'],
  model: 'inherit',
  omitClaudeMd: true,
  maxTurns: 6
}

/**
 * Comment mode for the design canvas. The canvas turns it on with {__lcDesign: 'comment', on};
 * hovering outlines elements, and a click picks one ({__lcDesignPick}) instead of reaching the page.
 * {__lcDesign: 'release'} lets go of the picked element when the comment box closes.
 */
const DESIGN_BRIDGE = `<script>(function(){
var on=false,held=null,box=null;
function ok(s){return /^[A-Za-z][\\w-]*$/.test(s)}
function cssPath(el){var parts=[];while(el&&el.nodeType===1&&el!==document.documentElement&&parts.length<6){if(el.id&&ok(el.id)){parts.unshift('#'+el.id);break}var tag=el.tagName.toLowerCase();if(tag==='body'){parts.unshift('body');break}var s=tag,cls=[].slice.call(el.classList).filter(ok).slice(0,2);if(cls.length)s+='.'+cls.join('.');var p=el.parentElement;if(p){var same=[].filter.call(p.children,function(c){return c.tagName===el.tagName});if(same.length>1)s+=':nth-of-type('+(same.indexOf(el)+1)+')'}parts.unshift(s);el=p}return parts.join(' > ')}
function show(el){if(!box){box=document.createElement('div');box.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #d97757;background:rgba(217,119,87,.1);border-radius:3px;box-sizing:border-box';document.documentElement.appendChild(box)}var r=el.getBoundingClientRect();box.style.display='block';box.style.left=r.left+'px';box.style.top=r.top+'px';box.style.width=r.width+'px';box.style.height=r.height+'px'}
function hide(){if(box)box.style.display='none'}
function mode(v){on=v;held=null;document.documentElement.style.cursor=v?'crosshair':'';if(!v)hide()}
window.addEventListener('message',function(e){var d=e.data;if(e.source!==parent||!d)return;if(d.__lcDesign==='comment')mode(!!d.on);else if(d.__lcDesign==='release'){held=null;hide()}});
document.addEventListener('mousemove',function(e){if(on&&!held&&e.target&&e.target.nodeType===1)show(e.target)},true);
document.addEventListener('mouseleave',function(){if(on&&!held)hide()});
window.addEventListener('scroll',function(){if(held)show(held)},true);
['mousedown','mouseup','pointerdown','pointerup','dblclick','submit','contextmenu'].forEach(function(t){document.addEventListener(t,function(e){if(on){e.preventDefault();e.stopPropagation()}},true)});
document.addEventListener('click',function(e){if(!on)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();var el=e.target;if(!el||el.nodeType!==1)return;held=el;show(el);var r=el.getBoundingClientRect();
parent.postMessage({__lcDesignPick:{selector:cssPath(el),tag:el.tagName.toLowerCase(),text:(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,160),html:el.outerHTML.slice(0,400),rect:{x:r.left,y:r.top,w:r.width,h:r.height}}},'*')},true);
document.addEventListener('keydown',function(e){if(on&&e.key==='Escape')parent.postMessage({__lcDesignKey:'Escape'},'*')},true);
})()</script>`

/**
 * The page the canvas shows while Claude is still writing a design (artifact://draft/). The canvas posts
 * the HTML so far ({__lcDraft}); it's parsed without running scripts (a half-written script can't run,
 * and the finished design replaces this page), and the view follows the newest part unless you scroll up.
 */
export const DRAFT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><script>(function(){
var head=null,follow=true;
addEventListener('wheel',function(e){if(e.deltaY<0)follow=false},{passive:true});
addEventListener('message',function(e){var d=e.data;if(e.source!==parent||!d||typeof d.__lcDraft!=='string')return;
var html=d.__lcDraft.replace(/<script\\b[\\s\\S]*?(?:<\\/script\\s*>|$)/gi,'');
var doc=new DOMParser().parseFromString(html,'text/html'),root=document.documentElement;
[].slice.call(root.attributes).forEach(function(a){root.removeAttribute(a.name)});
[].slice.call(doc.documentElement.attributes).forEach(function(a){root.setAttribute(a.name,a.value)});
if(doc.head.innerHTML!==head){head=doc.head.innerHTML;document.head.innerHTML=head}
document.body.replaceWith(document.adoptNode(doc.body));
if(follow)scrollTo(0,root.scrollHeight)});
})()</script></body></html>`

/** The preview page with comment mode added (the canvas loads previews with ?design=1). */
export function withDesignBridge(page: string): string {
  const i = page.toLowerCase().lastIndexOf('</body>')
  return i >= 0 ? page.slice(0, i) + DESIGN_BRIDGE + page.slice(i) : page + DESIGN_BRIDGE
}
