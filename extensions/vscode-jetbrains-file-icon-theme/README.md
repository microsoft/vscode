# JetBrains New UI File Icon Theme Extended for VS Code

The goal of the JetBrains New UI File Icon Theme Extended is to reduce visual clutter and give you more space for your code and thoughts.

<p align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-file-icon-theme"><img src="https://img.shields.io/visual-studio-marketplace/v/fogio.jetbrains-file-icon-theme?style=for-the-badge&colorA=555555&colorB=007ec6&label=VERSION" alt="Version"></a>&nbsp;
    <a href="https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-file-icon-theme"><img src="https://img.shields.io/visual-studio-marketplace/r/fogio.jetbrains-file-icon-theme?style=for-the-badge&colorA=555555&colorB=007ec6&label=RATING" alt="Rating"></a>&nbsp;
    <a href="https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-file-icon-theme"><img src="https://img.shields.io/visual-studio-marketplace/i/fogio.jetbrains-file-icon-theme?style=for-the-badge&colorA=555555&colorB=007ec6&label=Installs" alt="INSTALLS"></a>&nbsp;
    <a href="https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-file-icon-theme"><img src="https://img.shields.io/visual-studio-marketplace/d/fogio.jetbrains-file-icon-theme?style=for-the-badge&colorA=555555&colorB=007ec6&label=Downloads" alt="DOWNLOADS"></a>
</p>

I hope this theme will be the one you enjoy working with day and night.

---

Check out our compatible extensions

| <img src="https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/icon.png" width="75"> | <img src="https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-product-icon-theme/refs/heads/master/assets/img/icon.png" width="75"> | <img src="https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-color-theme/refs/heads/master/assets/img/icon.png" width="75"> |
| :---: | :---: | :---: |
| JetBrains New UI<br>**File Icon Theme** | JetBrains New UI<br>**Product Icon Theme** | JetBrains New UI<br>**Color Theme** |
| You are here | [Install](https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-product-icon-theme) | [Install](https://marketplace.visualstudio.com/items?itemName=fogio.jetbrains-color-theme) |

---

## Preview

### Folders icons

![Preview folders icons](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/preview_folders.png)

### File extensions icons

![Preview file extensions icons](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/preview_file_extensions.png)

### File names icons

Icons for reserved file names

![Preview file names icons](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/preview_file_names.png)

### Icons for go test files (experimental)

![Preview go test files](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/preview_go_test_files.png)

Activation guide is located below.

## Install

### File icon theme

![Select theme](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/guide_select_theme.png)

You can choose icons pack for dark or light theme. An "Auto" theme is also available that adapts to the color theme.

### Enable Icons for go test files (experimental)

VS Code does not allow defining an icon for a file using a regular expression. However, we have implemented a workaround for this.

This feature is experimental, in case of any problems we are waiting for an issue to solve the problem as quickly as possible

By default, this functionality is disabled. You can enable it through the Settings UI:

![guide_enable_go_test_icons](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/guide_enable_go_test_icons.png)

or settings.json file:

```json
"jetbrains-file-icon-theme.enableGoTestIcons": true,
```

After enabling this setting, the theme begins to automatically add *_test.go files with a special icon. However, due to vscode limitations, the icons are cached and to see the special icon you need to restart ide. We decided not to add automatic restart in order not to cause inconvenience to users.

So if you added a new file _test.go, you will see a special icon for it only after you reload the window. Of course you can do it via interface or command `> Developer: Reload Window`

### Font

You can use [JetBrains Mono](https://www.jetbrains.com/lp/mono/) font with the JetBrains New UI File Icon Theme Extended.

VS Code doesn't provide clear functionality for adding a custom font to color theme... But I managed to add the font to the File icon theme!

> **Important! To use the JetBrains Mono font, the File Icon Theme must be set!**

Then there are 2 ways to enable the new font:

#### Settings UI

![Change font in settings UI](https://raw.githubusercontent.com/fogio-org/vscode-jetbrains-file-icon-theme/refs/heads/master/assets/img/guide_change_font_settings_ui.jpg)

> **It is very important to specify the font family exactly `JetBrainsMono`, without spaces!**

#### settings.json file

Add the following line to your settings.json file:

```json
"editor.fontFamily": "JetBrainsMono, Consolas, 'Courier New', monospace",
```

#### Extras

Also, there are some additional settings that you can apply both in the Settings UI and in settings.json file:

```json
"editor.fontSize": 13,
"editor.fontLigatures": true, // ">=" to "≥" etc
"terminal.integrated.fontFamily": "JetBrainsMono",
"terminal.integrated.fontSize": 13,
```

## Credits

I express my deep gratitude to the JetBrains team for their work. Here are links to open resources used to create this theme:

- JetBrains icons: [https://jetbrains.design/intellij/resources/icons_list/](https://jetbrains.design/intellij/resources/icons_list/)
- JetBrains Mono font: [https://www.jetbrains.com/lp/mono/](https://www.jetbrains.com/lp/mono/)
