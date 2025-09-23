//@ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const main = document.getElementById("main");

  // Handle messages sent from the extension to the webview
  let contentShown = false;
  window.addEventListener("message", (event) => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case "update": {
        updateContent(message.body);
        contentShown = true;
        break;
      }
      case "noContent": {
        if (!contentShown) {
          setNoContent(message.body);
        } else if (message.updateMode === "live") {
          setNoContent("");
        }
        break;
      }
    }
  });

  /**
   * @param {string} contents
   */
  function updateContent(contents) {
    main.innerHTML = contents;
    window.scrollTo(0, 0);
  }

  /**
   * @param {string} message
   */
  function setNoContent(message) {
    main.innerHTML = `<p class="no-content">${message}</p>`;
  }
})();
