/*!
 * xterm-addon-search-bar.js v0.2.0
 * (c) 2018-2020 yinshuxun
 * Released under the MIT License.
 */

interface StyleInjectOptions {
  insertAt?: string;
}

interface HTMLStyleElementWithStyleSheet extends HTMLStyleElement {
  styleSheet?: {
    cssText: string;
  };
}

function styleInject(css: string, ref: StyleInjectOptions = {}) {
  const insertAt = ref.insertAt;

  if (!css || typeof document === 'undefined') { return; }

  const head = document.head || document.getElementsByTagName('head')[0];
  const style = document.createElement('style') as HTMLStyleElementWithStyleSheet;
  style.type = 'text/css';

  if (insertAt === 'top') {
    if (head.firstChild) {
      head.insertBefore(style, head.firstChild);
    } else {
      head.appendChild(style);
    }
  } else {
    head.appendChild(style);
  }

  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }
}

var css = ".xterm-search-bar__addon{position:absolute;max-width:1467px;top:0;right:28px;color:#000;background:#fff;padding:5px 10px;box-shadow:0 2px 8px #000;background-color:#252526;z-index:999;display:flex}.xterm-search-bar__addon .search-bar__input{background-color:#3c3c3c;color:#ccc;border:0;padding:2px;height:20px;width:227px}.xterm-search-bar__addon .search-bar__btn{min-width:20px;width:20px;height:20px;display:flex;display:-webkit-flex;flex:initial;background-position:50%;margin-left:3px;background-repeat:no-repeat;background-color:#252526;border:0;cursor:pointer}.xterm-search-bar__addon .search-bar__btn:hover{background-color:#666}.xterm-search-bar__addon .search-bar__btn.prev{margin-left:20px;background-image:url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0iI2ZmZiI+PHBhdGggZD0iTTUuNCA4YS42LjYgMCAwMS4xNzYtLjQyNGw0LTRhLjU5OC41OTggMCAwMS44NDggMCAuNTk4LjU5OCAwIDAxMCAuODQ4TDYuODQ5IDhsMy41NzUgMy41NzZhLjU5OC41OTggMCAwMTAgLjg0OC41OTguNTk4IDAgMDEtLjg0OCAwbC00LTRBLjYuNiAwIDAxNS40IDgiLz48L3N2Zz4=\")}.xterm-search-bar__addon .search-bar__btn.next{background-image:url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0iI2ZmZiI+PHBhdGggZD0iTTEwLjYgOGEuNi42IDAgMDEtLjE3Ni40MjRsLTQgNGEuNTk4LjU5OCAwIDAxLS44NDggMCAuNTk4LjU5OCAwIDAxMC0uODQ4TDkuMTUxIDggNS41NzYgNC40MjRhLjU5OC41OTggMCAwMTAtLjg0OC41OTguNTk4IDAgMDEuODQ4IDBsNCA0QS42LjYgMCAwMTEwLjYgOCIvPjwvc3ZnPg==\")}.xterm-search-bar__addon .search-bar__btn.close{background-image:url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMiIgaGVpZ2h0PSIxMiIgZmlsbD0iI2ZmZiI+PHBhdGggZD0iTTcgNmwyLTJhLjcxMS43MTEgMCAwMDAtMSAuNzExLjcxMSAwIDAwLTEgMEw2IDUgNCAzYS43MTEuNzExIDAgMDAtMSAwIC43MTEuNzExIDAgMDAwIDFsMiAyLTIgMmEuNzExLjcxMSAwIDAwMCAxIC43MTEuNzExIDAgMDAxIDBsMi0yIDIgMmEuNzExLjcxMSAwIDAwMSAwIC43MTEuNzExIDAgMDAwLTFMNyA2eiIvPjwvc3ZnPg==\")}";
styleInject(css);

const ADDON_MARKER_NAME = 'xterm-search-bar__addon';

interface SearchAddon {
    findNext(term: string, options: { incremental: boolean }): void;
    findPrevious(term: string, options: { incremental: boolean }): void;
}

interface Terminal {
    element: HTMLElement;
}

interface SearchBarOptions {
    searchAddon?: SearchAddon;
}

class SearchBarAddon {
    private options: SearchBarOptions;
    private searchAddon: SearchAddon;
    private terminal: Terminal;
    private searchBarElement: HTMLElement;
    private searchKey: string = '';

    constructor(options?: SearchBarOptions) {
        this.options = options || {};
        if (this.options && this.options.searchAddon) {
            this.searchAddon = this.options.searchAddon;
        }
    }
    activate(terminal: Terminal) {
        this.terminal = terminal;
        if (!this.searchAddon) {
            console.error('Cannot use search bar addon until search addon has been loaded!');
        }
    }
    dispose() {
        this.hidden();
    }
    show() {
        if (!this.terminal || !this.terminal.element) {
            return;
        }
        if (this.searchBarElement) {
            this.searchBarElement.style.visibility = 'visible';
            this.searchBarElement.querySelector('input').select();
            return;
        }
        this.terminal.element.style.position = 'relative';
        const element = document.createElement('div');
        element.innerHTML = `
       <input type="text" class="search-bar__input" name="search-bar__input"/>
       <button class="search-bar__btn prev"></button>
       <button class="search-bar__btn next"></button>
       <button class="search-bar__btn close"></button>
    `;
        element.className = ADDON_MARKER_NAME;
        const parentElement = this.terminal.element.parentElement;
        this.searchBarElement = element;
        if (!['relative', 'absoulte', 'fixed'].includes(parentElement.style.position)) {
            parentElement.style.position = 'relative';
        }
        parentElement.appendChild(this.searchBarElement);
        this.on('.search-bar__btn.close', 'click', () => {
            this.hidden();
        });
        this.on('.search-bar__btn.next', 'click', () => {
            this.searchAddon.findNext(this.searchKey, {
                incremental: false
            });
        });
        this.on('.search-bar__btn.prev', 'click', () => {
            this.searchAddon.findPrevious(this.searchKey, {
                incremental: false
            });
        });
        this.on('.search-bar__input', 'keyup', (e: KeyboardEvent) => {
            this.searchKey = (e.target as HTMLInputElement).value;
            this.searchAddon.findNext(this.searchKey, {
                incremental: e.key !== `Enter`
            });
        });
        this.searchBarElement.querySelector('input').select();
    }
    hidden() {
        if (this.searchBarElement && this.terminal.element.parentElement) {
            this.searchBarElement.style.visibility = 'hidden';
        }
    }
    on(selector: string, event: string, cb: (e: Event) => void) {
        const parentElement = this.terminal.element.parentElement;
        if (!parentElement) return;
        
        parentElement.addEventListener(event, (e) => {
            let target = e.target as HTMLElement | null;
            while (target && target !== document.querySelector(selector)) {
                if (target === parentElement) {
                    target = null;
                    break;
                }
                target = target.parentElement;
            }
            if (target === document.querySelector(selector)) {
                cb.call(this, e);
                e.stopPropagation();
            }
        });
    }
    addNewStyle(newStyle: string) {
        let styleElement = document.getElementById(ADDON_MARKER_NAME) as HTMLStyleElement | null;
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.id = ADDON_MARKER_NAME;
            document.getElementsByTagName('head')[0].appendChild(styleElement);
        }
        styleElement.appendChild(document.createTextNode(newStyle));
    }
}

export { SearchBarAddon };
