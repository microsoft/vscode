//@js-check

(function () {
  const vscode = acquireVsCodeApi();

  const reportError = _.debounce((message) => {
    const previewErrorMsg = document.getElementById("preview-error-message");
    previewErrorMsg.innerText = message;
    document.getElementById("preview-error").classList.remove("hidden");
  }, 2000);

  function clearError() {
    reportError.cancel();
    document.getElementById("preview-error").classList.add("hidden");
  }

  // clear preview
  function clearPreview() {
    document.body.classList.remove("with-preview");
    document.body.classList.remove("mermaid");
    document.body.classList.remove("graphviz");
    const noPreview = document.createElement("p");
    noPreview.innerText = "No diagram currently selected";
    const previewDiv = document.querySelector("#no-preview");
    previewDiv.appendChild(noPreview);
  }

  function updateMermaidPreview(src) {
    document.body.classList.add("with-preview");
    document.body.classList.add("mermaid");
    document.body.classList.remove("graphviz");

    // validate first
    try {
      window.mermaid.parse(src);
    } catch (err) {
      reportError(err.str);
      return;
    }

    // render
    const kMermaidId = "mermaidSvg";
    mermaidApi.render(kMermaidId, src, () => {
      const mermaidEl = document.querySelector(`#${kMermaidId}`);
      const previewDiv = document.querySelector("#mermaid-preview");
      while (previewDiv.firstChild) {
        previewDiv.removeChild(previewDiv.firstChild);
      }
      previewDiv.appendChild(mermaidEl);
      clearError();
    });
  }

  function updateGraphvizPreview(graphviz, dot) {
    document.body.classList.add("with-preview");
    document.body.classList.add("graphviz");
    document.body.classList.remove("mermaid");
    graphviz.renderDot(dot);
  }

  // always start with no preview
  clearPreview();

  // initialize mermaid
  const mermaidApi = window.mermaid.mermaidAPI;
  mermaidApi.initialize({ startOnLoad: false });

  // initialize graphvix
  const hpccWasm = window["@hpcc-js/wasm"];
  hpccWasm.graphvizSync().then(() => {
    const graphviz = d3
      .select("#graphviz-preview")
      .graphviz({ zoom: false, fit: true })
      .transition(function () {
        return d3.transition("main");
      })
      .on("initEnd", () => {
        vscode.postMessage({ type: "initialized" });
      });

    // error handling
    graphviz.onerror(reportError);
    graphviz.on("layoutEnd", clearError);

    // remember the last message and skip processing if its identical
    // to the current message (e.g. would happen on selection change)
    let lastMessage = undefined;

    // handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
      // get the message
      const message = event.data;

      // skip if its the same as the last message
      if (
        lastMessage &&
        lastMessage.type === message.type &&
        lastMessage.engine === message.engine &&
        lastMessage.src === message.src
      ) {
        return;
      }

      // set last message
      lastMessage = message;

      // handle the message
      if (message.type === "render") {
        vscode.postMessage({ type: "render-begin" });
        try {
          switch (message.engine) {
            case "mermaid": {
              updateMermaidPreview(message.src);
              break;
            }
            case "graphviz": {
              updateGraphvizPreview(graphviz, message.src);
              break;
            }
          }
        } finally {
          vscode.postMessage({ type: "render-end" });
        }
      } else if (message.type === "clear") {
        clearPreview();
      }
    });
  });
})();
