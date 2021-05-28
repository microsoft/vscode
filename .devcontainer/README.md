# Code - OSS Development Container

This repository includes configuration for a development container for working with Code - OSS in an isolated local container or using [GitHub Codespaces](https://github.com/features/codespaces).

> **Tip:** The default VNC password is `vscode`. The VNC server runs on port `5901` with a web client at `6080`. For better performance, we recommend using a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/). Applications like the macOS Screen Sharing app will not perform as well.

## Quick start - local

1. Install Docker Desktop or Docker for Linux on your local machine. (See [docs](https://aka.ms/vscode-remote/containers/getting-started) for additional details.)

2. **Important**: Docker needs at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run full build. If you on macOS, or using the old Hyper-V engine for Windows, update these values for Docker Desktop by right-clicking on the Docker status bar item, going to **Preferences/Settings > Resources > Advanced**.

    > **Note:** The [Resource Monitor](https://marketplace.visualstudio.com/items?itemName=mutantdino.resourcemonitor) extension is included in the container so you can keep an eye on CPU/Memory in the status bar.

3. Install [Visual Studio Code Stable](https://code.visualstudio.com/) or [Insiders](https://code.visualstudio.com/insiders/) and the [Remote - Containers](https://aka.ms/vscode-remote/download/containers) extension.

    ![Image of Remote - Containers extension](https://microsoft.github.io/vscode-remote-release/images/remote-containers-extn.png)

    > Note that the Remote - Containers extension requires the Visual Studio Code distribution of Code - OSS. See the [FAQ](https://aka.ms/vscode-remote/faq/license) for details.

4. Press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd> and select **Remote-Containers: Clone Repository in Container Volume...**.

    > **Tip:** While you can use your local source tree instead, operations like `yarn install` can be slow on macOS or using the Hyper-V engine on Windows. We recommend the "clone repository in container" approach instead since it uses "named volume" rather than the local filesystem.

5. Type `https://github.com/microsoft/vscode` (or a branch or PR URL) in the input box and press <kbd>Enter</kbd>.

6. After the container is running, open a web browser and go to [http://localhost:6080](http://localhost:6080) or use a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to `localhost:5901` and enter `vscode` as the password.

Anything you start in VS Code or the integrated terminal will appear here.

Next: **[Try it out!](#try-it)**

## Quick start - GitHub Codespaces

1. From the [microsoft/vscode GitHub repository](https://github.com/microsoft/vscode), click on the **Code** dropdown, select **Open with Codespaces**, and the **New codespace** button. If prompted, select the **Standard** machine size (which is the default).

    > **Note:** You will not see these options if you are not in the beta yet.

2. After the codespace is up and running in your browser, press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd> and select **Ports: Focus on Ports View**.

3. You should see **VNC web client (6080)** under in the list of ports. Select the line and click on the globe icon to open it in a browser tab.

    > **Tip:** If you do not see the port, <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd>, select **Forward a Port** and enter port `6080`.

4. In the new tab, you should see noVNC. Click **Connect** and enter `vscode` as the password.

Anything you start in VS Code or the integrated terminal will appear here.

Next: **[Try it out!](#try-it)**

### Using VS Code with GitHub Codespaces

You will may see better VNC performance when accessing a codespace from VS Code client instead of on the web since you can use a full [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/). Here's how to do it.

1.  Install [Visual Studio Code Stable](https://code.visualstudio.com/) or [Insiders](https://code.visualstudio.com/insiders/) and the the [GitHub Codespaces extension](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces).

	> **Note:** The GitHub Codespaces extension requires the Visual Studio Code distribution of Code - OSS.

2. After the VS Code is up and running, press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd>, choose **Codespaces: Create New Codespace**, and use the following settings:
    - `microsoft/vscode` for the repository.
	- Select any branch (e.g. **main**) - you select a different one later.
	- Choose **Standard** (4-core, 8GB) as the size.

4. After you've connected to the codespace, you can use a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to `localhost:5901` and enter `vscode` as the password.

    > **Tip:** You may also need change your VNC client's **Picture Quaility** setting to **High** to get a full color desktop.

5. Anything you start in VS Code or the integrated terminal will appear here.

Next: **[Try it out!](#try-it)**

## Try it!

This container uses the [Fluxbox](http://fluxbox.org/) window manager to keep things lean. **Right-click on the desktop** to see menu options. It works with GNOME and GTK applications, so other tools can be installed if needed.

Note you can also set the resolution from the command line by typing `set-resolution`.

To start working with Code - OSS, follow these steps:

1. In your local VS Code, open a terminal (<kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>\`</kbd>) and type the following commands:

    ```bash
    yarn install
    bash scripts/code.sh
    ```

    Note that a previous run of `yarn install`  will already be cached, so this step should simply pick up any recent differences.

2. After the build is complete, open a web browser or a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to the desktop environnement as described in the quick start and enter `vscode` as the password.

3. You should now see Code - OSS!

Next, let's try debugging.

1. Shut down Code - OSS by clicking the box in the upper right corner of the Code - OSS window through your browser or VNC viewer.

2. Go to your local VS Code client, and use Run / Debug view to launch the **VS Code** configuration. (Typically the default, so you can likely just press <kbd>F5</kbd>).

    > **Note:** If launching times out, you can increase the value of `timeout` in the "VS Code", "Attach Main Process", "Attach Extension Host", and "Attach to Shared Process" configurations in [launch.json](../.vscode/launch.json). However, running `scripts/code.sh` first will set up Electron which will usually solve timeout issues.

3. After a bit, Code - OSS will appear with the debugger attached!

Enjoy!
