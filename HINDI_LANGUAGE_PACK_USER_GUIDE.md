# Hindi Language Pack for VS Code - User Guide

Welcome! This guide helps you install and use the Hindi language pack to experience Visual Studio Code in हिंदी (Hindi).

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation Methods](#installation-methods)
3. [Switching to Hindi](#switching-to-hindi)
4. [Using VS Code in Hindi](#using-vs-code-in-hindi)
5. [Troubleshooting](#troubleshooting)
6. [Reverting to English](#reverting-to-english)

## System Requirements

### Minimum Requirements

- **VS Code Version**: 1.88 or later
- **OS**: Windows 7 SP1+, macOS 10.12+, or any Linux distribution with glibc 2.17+
- **RAM**: 512 MB minimum (1 GB recommended)
- **Disk Space**: 100 MB free space
- **Internet**: Required for initial download and extension installation

### Recommended Requirements

- **VS Code Version**: Latest stable version
- **OS**: Windows 10+, macOS 10.15+, or modern Linux distribution
- **RAM**: 2 GB or more
- **Font**: Noto Sans Devanagari or Segoe UI (for better script rendering)

### Font Installation (Optional but Recommended)

For optimal display of Hindi text:

#### Windows
1. Go to [Google Fonts - Noto Sans Devanagari](https://fonts.google.com/noto/specimen/Noto+Sans+Devanagari)
2. Click "Download family"
3. Extract the ZIP file
4. Double-click `.ttf` files and click "Install"

#### macOS
1. Download fonts from Google Fonts
2. Open Font Book application
3. Drag and drop font files
4. Click "Install"

#### Linux
```bash
# Ubuntu/Debian
sudo apt-get install fonts-noto-devanagari

# Fedora
sudo dnf install google-noto-devanagari-fonts

# Arch
sudo pacman -S noto-fonts-extra
```

## Installation Methods

### Method 1: Through VS Code Extensions UI (Recommended)

**Step 1**: Open VS Code

**Step 2**: Open Extensions
- Press `Ctrl+Shift+X` (Windows/Linux)
- Press `Cmd+Shift+X` (macOS)
- Or click the Extensions icon in the Activity Bar

**Step 3**: Search for Hindi Language Pack
- In the search box, type "Hindi Language Pack"
- Look for the official extension by "ms-ceintl"

**Step 4**: Install
- Click the "Install" button
- Wait for the installation to complete

**Step 5**: Confirm Language Change
- A notification will ask if you want to change the display language
- Click "Yes" to apply
- VS Code will automatically restart

**Step 6**: Verify
- After restart, the interface should be in Hindi
- Check menu items, buttons, and status bar for Hindi text

### Method 2: Command Palette

**Step 1**: Open Command Palette
- Press `Ctrl+Shift+P` (Windows/Linux)
- Press `Cmd+Shift+P` (macOS)

**Step 2**: Select Language
- Type "Configure Display Language"
- Press Enter
- Select "Hindi" from the list
- If not available, search for "language pack" first

**Step 3**: Install Pack
- Follow the extension installation prompts
- Restart VS Code when prompted

### Method 3: Settings File

**Step 1**: Open Settings
- Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (macOS)
- Or go to File → Preferences → Settings

**Step 2**: Search for "locale"
- In the search box, type "locale"
- Find "Configure Display Language"

**Step 3**: Edit Setting
- Click "Edit in settings.json"
- Add or modify the `locale` setting:
```json
{
  "locale": "hi"
}
```

**Step 4**: Save and Restart
- Save the file (Ctrl+S / Cmd+S)
- Restart VS Code
- The interface should now display in Hindi

### Method 4: Command Line

**Windows (PowerShell)**:
```powershell
code --install-extension ms-ceintl.vscode-language-pack-hi
```

**macOS/Linux (Terminal)**:
```bash
code --install-extension ms-ceintl.vscode-language-pack-hi
```

**After Installation**:
```bash
code --locale=hi
```

### Method 5: Portable VS Code

For portable installations:

**Step 1**: Create `locale.json`
In your portable data folder, create:
- Windows: `user_data_dir\locale.json`
- macOS/Linux: `user_data_dir/locale.json`

**Step 2**: Add Content
```json
{
  "locale": "hi"
}
```

**Step 3**: Restart VS Code
- Close and reopen VS Code
- Should display in Hindi

## Switching to Hindi

### Quick Switch Method

1. **Open Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. **Type**: "language"
3. **Select**: "Configure Display Language"
4. **Choose**: "हिंदी" from the list
5. **Restart**: Click "Restart" when prompted

### If Language Pack Not Installing

**Problem**: Hindi language pack not appearing in language selection

**Solution**:
1. Check internet connection
2. Restart VS Code
3. Clear extension cache:
   - Close VS Code
   - Delete folder:
     - Windows: `%USERPROFILE%\.vscode\extensions`
     - macOS/Linux: `~/.vscode/extensions`
   - Restart VS Code
   - Try installing again

## Using VS Code in Hindi

### Main Menu Items

| English | हिंदी |
|---------|-------|
| File | फ़ाइल |
| Edit | संपादित करें |
| View | दृश्य |
| Terminal | टर्मिनल |
| Help | मदद |

### Common Commands (Available in Hindi)

- **File → New File** = फ़ाइल → नई फ़ाइल
- **File → Open** = फ़ाइल → खोलें
- **File → Save** = फ़ाइल → सहेजें
- **Edit → Find** = संपादित करें → खोजें
- **Edit → Replace** = संपादित करें → बदलें
- **View → Terminal** = दृश्य → टर्मिनल

### Keyboard Shortcuts in Hindi

Most keyboard shortcuts remain the same (language-independent):
- `Ctrl+N`: नई फ़ाइल
- `Ctrl+O`: फ़ाइल खोलें
- `Ctrl+S`: सहेजें
- `Ctrl+Z`: पूर्ववत् करें
- `Ctrl+F`: खोजें
- `Ctrl+H`: बदलें

### Hindi Keyboard Input

To type Hindi text in VS Code:

#### Windows
1. Add Hindi (Devanagari) language:
   - Settings → Time & Language → Language
   - Add "Hindi"
   - Add "Hindi - INSCRIPT" keyboard layout

2. Switch keyboard:
   - Use `Windows+Space` to switch between English and Hindi
   - Or use system tray language selector

#### macOS
1. System Preferences → Keyboard → Input Sources
2. Click "+" and add "Hindi - INSCRIPT"
3. Switch with `Cmd+Space` or Ctrl+Option+Space

#### Linux
1. Settings → Region & Language → Input Sources
2. Add "Hindi - INSCRIPT"
3. Switch with Super+Space or Ctrl+Alt+K

### Writing Code in Hindi Comments

You can now add Hindi comments in your code:

```python
# यह एक हिंदी टिप्पणी है
# This is a Hindi comment
def नमस्ते():
    print("नमस्ते दुनिया!")

नमस्ते()
```

**Note**: Variable and function names should remain in English for compatibility.

## Troubleshooting

### Problem: Hindi Language Pack Not Found

**Symptom**: "Hindi Language Pack" doesn't appear in extensions search

**Solutions**:

1. **Check Internet Connection**
   - Ensure you're connected to internet
   - VS Code must download from marketplace

2. **Update VS Code**
   ```
   Help → Check for Updates
   ```

3. **Clear Cache**
   - Close VS Code
   - Delete `~/.vscode/extensions` folder
   - Restart VS Code
   - Search again

4. **Manual Installation**
   ```bash
   code --install-extension ms-ceintl.vscode-language-pack-hi
   ```

### Problem: UI Still Shows in English

**Symptom**: After installing language pack, interface still in English

**Likely Causes**:
- VS Code not restarted after installation
- Locale not set correctly
- Installation incomplete

**Solutions**:

1. **Restart VS Code Completely**
   - Close all VS Code windows
   - Reopen VS Code
   - Check Settings > Locale

2. **Verify Installation**
   ```
   Extensions → Installed → Search for "Hindi Language Pack"
   Should show as installed
   ```

3. **Manual Setting**
   - Press `Ctrl+,` (Settings)
   - Search for "locale"
   - Set to "hi"
   - Restart

4. **Reset Language Settings**
   - Delete `.vscode` folder
   - Reinstall language pack
   - Restart VS Code

### Problem: Characters Display Incorrectly

**Symptom**: Hindi text shows as boxes or wrong characters

**Causes**:
- Missing Devanagari font
- Font rendering issue

**Solutions**:

1. **Install Devanagari Font**
   - See Font Installation section above
   - Restart VS Code after installing font

2. **Set Font in VS Code**
   - Open Settings (`Ctrl+,`)
   - Search for "Font"
   - Find "Font Family"
   - Add `'Noto Sans Devanagari', 'Segoe UI'` at the beginning

3. **Update VS Code**
   - Check for VS Code updates
   - Update to latest version
   - Improvements in font rendering

### Problem: Language Pack is Slow

**Symptom**: VS Code runs slower after installing Hindi language pack

**Solutions**:

1. **Clear Cache**
   ```
   Delete %USERPROFILE%\AppData\Local\Programs\Microsoft VS Code\User\clp\
   ```

2. **Disable Unnecessary Extensions**
   - Check Extensions → Installed
   - Disable rarely used extensions
   - Restart VS Code

3. **Check Disk Space**
   - Ensure 1 GB+ free disk space
   - Check C: drive not full

4. **Upgrade RAM**
   - If system has < 2GB RAM, consider upgrade
   - May impact VS Code performance

### Problem: Some UI Elements Still in English

**Symptom**: Some buttons or menus still show in English

**Possible Reasons**:
- Third-party extensions don't support Hindi
- UI elements not yet translated
- Custom UI from plugins

**Solutions**:

1. **Report Issue**
   - File GitHub issue with screenshot
   - Specify which UI element is in English
   - Include VS Code and language pack versions

2. **Check Extension Support**
   - Open Extension
   - Check if it mentions localization support
   - Contact extension author

3. **Contribute Translation**
   - See Contributing Guide
   - Help complete the translation
   - Submit pull request

## Reverting to English

### Method 1: Through Settings

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "locale"
3. Set value to "en" or clear it
4. Restart VS Code

### Method 2: Through Command Palette

1. `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Type "Configure Display Language"
3. Select "English"
4. Restart when prompted

### Method 3: Settings JSON

1. Open Command Palette
2. Search for "preferences: Open Settings (JSON)"
3. Find and modify:
```json
{
  "locale": "en"
}
```
4. Restart VS Code

### Method 4: Uninstall Language Pack (Optional)

1. Open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for "Hindi Language Pack"
3. Click "Uninstall"
4. Restart VS Code
5. Locale will revert to system default

## Features in Hindi

### Available Features
- ✅ All menu items
- ✅ Command palette
- ✅ Status bar
- ✅ Settings UI
- ✅ Built-in extensions (Git, Python, TypeScript, etc.)
- ✅ Notifications and dialogs
- ✅ Error messages
- ✅ Welcome page

### Limited Support
- ⚠️ Some third-party extensions may not have Hindi translations
- ⚠️ Community extensions depend on author localization
- ⚠️ Documentation remains in English

## Tips and Tricks

### Use Hindi and English Together

Keep both English and Hindi keyboard layouts:
- Quick switch between layouts for coding and documentation
- Code in English, comment in Hindi
- Search for English terms if needed

### Customize UI Language Per User

For multiple users on same computer:
- Create separate user accounts
- Each user can set their preferred language
- Settings are stored per user

### Share Settings Across Devices

To sync Hindi language settings:
1. Enable Settings Sync
2. Settings → Turn on "Settings Sync"
3. Sign in with Microsoft/GitHub account
4. Language preference syncs across devices

### Create Hindi Learning Content

Use VS Code in Hindi for:
- Teaching Hindi-medium schools
- Creating Hindi programming tutorials
- Documenting in Hindi
- Building Hindi developer community

## Getting Help

### If You Need Assistance

1. **Check Documentation**
   - Read this guide thoroughly
   - Check troubleshooting section

2. **Search GitHub Issues**
   - Go to [GitHub Issues](https://github.com/microsoft/vscode-language-packs/issues)
   - Search for similar issues
   - Read existing solutions

3. **Report New Issue**
   - Click "New Issue"
   - Describe problem clearly
   - Include VS Code version and steps to reproduce
   - Attach screenshots if helpful

4. **Contact Support**
   - Email: localization@microsoft.com
   - Subject: "Hindi Language Pack Issue"
   - Include: Problem description, VS Code version, language pack version

### Community Resources

- **GitHub Discussions**: Ask questions in community
- **Stack Overflow**: Tag `visual-studio-code` and `hindi`
- **Reddit**: r/VSCode, r/programming_india
- **Hindi Tech Forums**: Search in Hindi tech communities

## Feedback and Contributions

### Share Your Feedback

We'd love to hear your thoughts:
- What works well?
- What needs improvement?
- Missing translations?
- Suggestions for features?

### Contribute to the Project

Want to help improve the Hindi language pack?
- Report translation errors
- Suggest better terms
- Contribute new translations
- Translate other languages

See [CONTRIBUTING.md](HINDI_LANGUAGE_PACK_CONTRIBUTING.md) for details.

## FAQ - Frequently Asked Questions

**Q: Is the Hindi language pack free?**
A: Yes! It's completely free and open-source.

**Q: Will it slow down VS Code?**
A: No, language packs have minimal performance impact.

**Q: Can I use Hindi language pack offline?**
A: Yes, after installation. Internet needed only for download.

**Q: Does it support both Hindi and English simultaneously?**
A: You can switch between them, but interface is one language at a time.

**Q: Can I contribute translations?**
A: Yes! See [CONTRIBUTING.md](HINDI_LANGUAGE_PACK_CONTRIBUTING.md).

**Q: Which programming languages are supported?**
A: All programming languages. Hindi is only for VS Code UI, not code.

**Q: Can I code in Hindi?**
A: Yes, for comments and strings. Variables/functions should be in English.

**Q: Is it available on Codespaces?**
A: Yes, install the language pack in your Codespace.

## Additional Resources

- [VS Code Official Documentation](https://code.visualstudio.com/docs)
- [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)
- [Keyboard Shortcuts](https://code.visualstudio.com/docs/getstarted/keybindings)
- [Hindi Unicode Guide](https://unicode.org/charts/PDF/U0900.pdf)
- [VS Code GitHub Repository](https://github.com/microsoft/vscode)

---

## Summary

You now have everything you need to use Visual Studio Code in Hindi! Enjoy coding in your native language. 🎉

**Happy coding!** - खुश कोडिंग! 💻

For questions or issues, refer to the Troubleshooting section or visit our GitHub repository.

---

**Last Updated**: May 17, 2026
**Language Pack Version**: 1.88.0
**VS Code Minimum Version**: 1.88.0
