# Code - OSS Development Container

This dev container includes configuration for a development container for working with Code - OSS in a local container. For using [GitHub Codespaces](https://github.com/features/codespaces) follow the [prebuilt setup](prebuilt/README.md) which installs VNC for displaying the application window.

> **Note:** You will need X11's `DISPLAY` or Wayland's `WAYLAND_DISPLAY` environment variable set locally to allow for the Code - OSS window to display. See [Running GUI app on WSL](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps) for Windows and [Quartz](https://www.xquartz.org) for Mac.

## Quick start

1. Install Docker Desktop or Docker for Linux on your local machine. (See [docs](https://aka.ms/vscode-remote/containers/getting-started) for additional details.)

2. **Important**: Docker needs at least **4 Cores and 8 GB of RAM** to run a full build with **9 GB of RAM** being recommended. If you are on macOS, or are using the old Hyper-V engine for Windows, update these values for Docker Desktop by right-clicking on the Docker status bar item and going to **Preferences/Settings > Resources > Advanced**.

    > **Note:** The [Resource Monitor](https://marketplace.visualstudio.com/items?itemName=mutantdino.resourcemonitor) extension is included in the container so you can keep an eye on CPU/Memory in the status bar.

3. Install [Visual Studio Code Stable](https://code.visualstudio.com/) or [Insiders](https://code.visualstudio.com/insiders/) and the [Dev Containers](https://aka.ms/vscode-remote/download/containers) extension.

    ![Image of Dev Containers extension](https://microsoft.github.io/vscode-remote-release/images/dev-containers-extn.png)

    > **Note:** The Dev Containers extension requires the Visual Studio Code distribution of Code - OSS. See the [FAQ](https://aka.ms/vscode-remote/faq/license) for details.

4. Due to the size of the repository we strongly recommend cloning it on a Linux filesystem for better bind mount performance. On macOS we recommend using a Docker volume (press <kbd>F1</kbd> and select **Dev Containers: Clone Repository in Container Volume...**) and on Windows we recommend using a WSL folder:

- Make sure you are running a recent WSL version to get X11 and Wayland support.
- Use the WSL extension for VS Code to open the cloned folder in WSL.
- Press <kbd>F1</kbd> and select **Dev Containers: Reopen in Container**.

Next: **[Try it out!](#try-it)**

## Try it

To start working with Code - OSS, follow these steps:

1. In your local VS Code client, open a terminal (<kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>\`</kbd>) and type the following commands:

    ```bash
    yarn install
    bash scripts/code.sh
    ```

2. You should now see Code - OSS!

Next, let's try debugging.

1. Shut down Code - OSS by clicking the box in the upper right corner of the Code - OSS window.

2. Go to your local VS Code client, and use the **Run / Debug** view to launch the **VS Code** configuration. (Typically the default, so you can likely just press <kbd>F5</kbd>).

    > **Note:** If launching times out, you can increase the value of `timeout` in the "VS Code", "Attach Main Process", "Attach Extension Host", and "Attach to Shared Process" configurations in [launch.json](../../.vscode/launch.json). However, running `scripts/code.sh` first will set up Electron which will usually solve timeout issues.

3. After a bit, Code - OSS will appear with the debugger attached!

Enjoy!

## Notes

The container comes with VS Code Insiders installed. To run it from an Integrated Terminal use `VSCODE_IPC_HOOK_CLI= /usr/bin/code-insiders .`.
