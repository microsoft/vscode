<template>
    <div class="box">
        <div id="header">
            <div id="status"></div>
        </div>
        <div id="terminal-container" class="terminal"></div>
    </div>
</template>

<script>
    import { Terminal } from 'xterm'
    import { FitAddon } from 'xterm-addon-fit'
    import { WebLinksAddon } from "xterm-addon-web-links";
    import { SearchAddon } from 'xterm-addon-search';
    import { SearchBarAddon } from './xterm-addon-search-bar';
    import { auto } from "./theme/auto";
    import { eventNames } from 'process';
    require('xterm/css/xterm.css')
    import { inject } from "../mixin/vscodeInject";
    export default {
        mixins: [inject],
        data() {
            return {};
        },
        mounted() {
            this.on("terminalConfig", (data) => {
                var errorExists = false;
                const terminal = new Terminal({
                    theme: auto(),
                    cursorStyle: "bar",
                    fontSize: data.fontSize,
                    fontFamily: "'Consolas ligaturized',Consolas, 'Microsoft YaHei','Courier New', monospace",
                    disableStdin: false,
                    lineHeight: 1.1,
                    rightClickSelectsWord: true,
                    cursorBlink: true, scrollback: 10000, tabStopWidth: 8, bellStyle: "sound"
                })

                const fitAddon = new FitAddon()
                const searchAddon = new SearchAddon();
                const searchAddonBar = new SearchBarAddon({ searchAddon });

                terminal.loadAddon(fitAddon)
                terminal.loadAddon(searchAddon)
                terminal.loadAddon(searchAddonBar);
                terminal.loadAddon(new WebLinksAddon(() => { }, {
                    willLinkActivate: (e, uri) => {
                        // set timeout to remove selection
                        setTimeout(() => {
                            this.emit('openLink', uri)
                        }, 100);
                    }
                }))

                const container = document.getElementById('terminal-container');
                terminal.onKey(async e => {
                    const event = e.domEvent;
                    if (event.code == "KeyC" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                        if (terminal.hasSelection()) {
                            document.execCommand('copy')
                        }
                        return;
                    } else if ((event.code == "KeyV" && event.ctrlKey && !event.altKey && !event.shiftKey) ||
                        (event.code == "KeyF" && event.ctrlKey && !event.altKey && !event.shiftKey)
                    ) {
                        return;
                    } else {
                        const new_e = new event.constructor(event.type, event);
                        document.getElementById("header").dispatchEvent(new_e);
                    }
                })
                terminal.open(container)
                fitAddon.fit()
                terminal.focus()
                terminal.onData((data) => {
                    this.emit('data', data)
                })

                const resizeScreen = () => {
                    fitAddon.fit()
                    this.emit('resize', { cols: terminal.cols, rows: terminal.rows })
                }

                window.addEventListener('resize', resizeScreen, false)
                window.addEventListener("keyup", async event => {
                    if (event.code == "KeyV" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                        this.emit('data', await navigator.clipboard.readText())
                    } else if (event.code == "KeyF" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                        searchAddonBar.show();
                    } else if (event.code == "Escape") {
                        searchAddonBar.hidden();
                    }
                })
                window.onfocus = () => {
                    terminal.focus()
                }

                container.oncontextmenu = async (event) => {
                    event.stopPropagation()
                    if (terminal.hasSelection()) {
                        document.execCommand('copy')
                        terminal.clearSelection()
                    } else {
                        this.emit('data', await navigator.clipboard.readText())
                    }
                }

                const status = document.getElementById('status')
                this
                    .on('connecting', content => {
                        terminal.write(content)
                        // terminal.focus()
                    })
                    .on('data', (content) => {
                        terminal.write(content)
                        // terminal.focus()
                    })
                    .on('path', path => {
                        this.emit('data', `cd ${path}\n`)
                    })
                    .on('status', (data) => {
                        resizeScreen()
                        status.innerHTML = data
                        status.style.backgroundColor = '#338c33'
                        // terminal.focus()
                    })
                    .on('ssherror', (data) => {
                        status.innerHTML = data
                        status.style.backgroundColor = 'red'
                        errorExists = true
                    })
                    .on('error', (err) => {
                        if (!errorExists) {
                            status.style.backgroundColor = 'red'
                            status.innerHTML = 'ERROR: ' + err
                        }
                    });

                this.emit('initTerminal', { cols: terminal.cols, rows: terminal.rows })
            }).init();
        },
        methods: {}
    };
</script>
<style scoped>
    body,
    html {
        font-family: helvetica, sans-serif, arial;
        font-size: 1em;
        color: #111;
        /* background-color: #2f3032; */
        color: rgb(240, 240, 240);
        height: 100%;
        margin: 0;
        padding: 0;
    }

    .dropup-content {
        display: none;
    }

    #header {
        background-color: rgb(84, 84, 84);
        color: #fafafa;
        width: 100%;
        border-color: white;
        border-style: none none solid none;
        border-width: 1px;
        text-align: center;
        flex: 0 1 auto;
        z-index: 99;
        height: 19px;
    }

    #header a {
        color: #fafafa;
    }

    .box {
        display: block;
        height: 100%;
    }

    #terminal-container {
        display: block;
        width: calc(100% - 1 px);
        margin: 0 auto;
        /* padding-top: 2px;
    padding-left: 3px; */
        height: 95vh;
    }

    #terminal-container .terminal {
        background-color: #000000;
        color: #fafafa;
        /* padding: 2px; */
        height: 95vh;
    }

    #terminal-container .terminal:focus .terminal-cursor {
        background-color: #fafafa;
    }

    #bottomdiv {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        background-color: rgb(50, 50, 50);
        border-color: white;
        border-style: solid none none none;
        border-width: 1px;
        z-index: 99;
        height: 19px;
    }

    #status {
        background-color: #338c33;
        display: inline-block;
        padding-left: 10px;
        padding-right: 10px;
        border-color: white;
        border-style: none solid none solid;
        border-width: 1px;
        text-align: left;
        z-index: 100;
    }

    @keyframes countdown {
        from {
            background-color: rgb(255, 255, 0);
        }

        to {
            background-color: inherit;
        }
    }

    #menu {
        display: inline-block;
        font-size: 16px;
        color: rgb(255, 255, 255);
        z-index: 100;
    }

    #menu:hover .dropup-content {
        display: block;
    }

    #logBtn,
    #credentialsBtn,
    #reauthBtn {
        color: #000;
    }
</style>