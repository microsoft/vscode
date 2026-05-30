# Hindi Language Pack for Visual Studio Code

## Overview

This guide provides comprehensive information about adding Hindi localization support to Visual Studio Code. The Hindi language pack will enable Hindi-speaking developers, students, and users to interact with VS Code in their native language.

### Why Hindi Localization?

- **Accessibility**: Hindi is the most widely spoken language in India and among the top 5 globally
- **User Comfort**: Native language interfaces improve productivity and reduce learning curve
- **Education**: Helps students and beginners learning to code
- **Inclusivity**: Promotes accessibility for non-English speakers

## Technical Architecture

### Language Pack System

VS Code uses a modular language pack system built on the NLS (Native Language Services) platform:

1. **Language Pack Extensions**: Distributed as independent extensions from the VS Code Marketplace
2. **Locale Resolution**: The system automatically detects and applies the appropriate language pack based on system/user settings
3. **Translation Format**: Uses JSON-based translation files with key-value mappings
4. **Lazy Loading**: Language packs are downloaded on-demand when users select them

### Key Files and Components

#### 1. Language Pack Detection
- **File**: `src/vs/platform/languagePacks/common/languagePacks.ts`
- **Function**: `getLocale()` - Extracts locale code from extension tags
- **Tag Format**: Extensions must have tags like `lp-hi` for Hindi language packs

#### 2. NLS Configuration
- **File**: `src/vs/base/node/nls.ts`
- **Purpose**: Resolves language pack configuration and loads translations
- **Cache**: Stores language pack translations in user data directory under `clp/{hash}.{language}/`

#### 3. Language Pack Registry
- **File**: `languagepacks.json` (in user data directory)
- **Content**: Maps installed language extensions to their translation files
- **Updated**: When language packs are installed/removed

## Hindi Language Pack Implementation

### 1. Extension Metadata Structure

The Hindi language pack is implemented as a VS Code extension with the following structure:

```
vscode-language-pack-hi/
├── package.json
├── extension.ts
├── translations/
│   ├── main.i18n.json      # Core VS Code translations
│   └── extensions/         # Built-in extension translations
│       ├── git.i18n.json
│       ├── typescript.i18n.json
│       └── ...other extensions
├── README.md
└── LICENSE
```

### 2. Package.json Configuration

```json
{
  "name": "vscode-language-pack-hi",
  "displayName": "Hindi Language Pack",
  "description": "हिंदी भाषा में Visual Studio Code का उपयोग करें",
  "version": "1.0.0",
  "publisher": "ms-ceintl",
  "license": "SEE LICENSE IN LICENSE.md",
  "engines": {
    "vscode": "^1.88.0"
  },
  "categories": [
    "Language Packs"
  ],
  "keywords": [
    "hi",
    "Hindi",
    "हिंदी",
    "Language Pack",
    "भाषा पैकेज",
    "Localization",
    "स्थानीयकरण"
  ],
  "tags": [
    "lp-hi"
  ],
  "properties": {
    "localizedLanguages": [
      "हिंदी"
    ]
  },
  "contributes": {
    "localizations": [
      {
        "languageId": "hi",
        "languageName": "हिंदी",
        "localizedLanguageName": "Hindi",
        "translations": [
          {
            "id": "vscode",
            "path": "./translations/main.i18n.json"
          }
        ]
      }
    ]
  }
}
```

### 3. Locale Code

- **Locale ID**: `hi` (ISO 639-1 standard)
- **Extended Locales**:
  - `hi-IN` for India-specific Hindi
  - Regional variations can be supported with fallback to `hi`

### 4. Translation File Format

#### main.i18n.json Structure

The translation file uses a nested JSON structure mapping module IDs to translated strings:

```json
{
  "vs/base/browser/ui/button/button": {
    "ok": "ठीक है",
    "cancel": "रद्द करें"
  },
  "vs/base/browser/ui/menu/menu": {
    "mnemonic": "{0} ({1})",
    "mnemonicHint": "Mnemonic"
  },
  "vs/workbench/browser/parts/editor/editorPart": {
    "close": "बंद करें",
    "closeAll": "सभी को बंद करें",
    "closeOthers": "अन्य को बंद करें"
  },
  "vs/workbench/contrib/git/browser/scmViewlet": {
    "git": "Git",
    "scm": "स्रोत नियंत्रण"
  }
}
```

## Installation and Usage

### For End Users

#### Method 1: Through VS Code UI
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Hindi Language Pack"
4. Click "Install" on the official Hindi language pack
5. VS Code will prompt to change the display language
6. Click "Yes" to apply the language change
7. VS Code restarts with Hindi interface

#### Method 2: Command Line
```bash
code --install-extension ms-ceintl.vscode-language-pack-hi
```

#### Method 3: Via Settings
1. Press Ctrl+Comma (Cmd+Comma on macOS) to open Settings
2. Search for "Configure Display Language"
3. Click "Edit in settings.json"
4. Modify the `"locale"` setting:
```json
{
  "locale": "hi"
}
```
5. Restart VS Code

### Switching Languages

Users can easily switch between languages:
1. Press Ctrl+K Ctrl+O (Cmd+K Cmd+O on macOS)
2. Select "Configure Display Language"
3. Choose Hindi from the available languages
4. VS Code will update and restart

## Development and Maintenance

### For Maintainers

#### Setting Up the Development Environment

1. **Clone the repository**:
```bash
git clone https://github.com/microsoft/vscode-language-packs.git
cd vscode-language-pack-hi
```

2. **Install dependencies**:
```bash
npm install
```

3. **Build the language pack**:
```bash
npm run build
```

#### Translation Workflow

1. **Extract English strings** from VS Code source:
   - English strings are automatically extracted during the build process
   - Located in `translations/main.i18n.json`

2. **Create Hindi translations**:
   - Use professional translation tools or native speakers
   - Ensure terminology consistency across the UI
   - Test translations in the running application

3. **Validate translations**:
   - Check for proper pluralization handling
   - Verify parameter replacements ({0}, {1}, etc.)
   - Test right-to-left (RTL) layout support

4. **Test the language pack**:
```bash
npm run test
```

#### Building and Packaging

1. **Build the extension**:
```bash
npm run build
```

2. **Package for distribution**:
```bash
vsce package
```

This creates `vscode-language-pack-hi-{version}.vsix`

3. **Publish to Marketplace**:
```bash
vsce publish
```

### Translation Guidelines

#### Hindi Localization Conventions

1. **Terminology**:
   - Use modern, standardized Hindi terms for technical concepts
   - Maintain consistency across all files
   - Create a terminology glossary for team coordination

2. **Formatting**:
   - Preserve all punctuation and special characters
   - Maintain parameter placeholders: `{0}`, `{1}`, etc.
   - Keep formatting tags like `<b>`, `<i>` intact

3. **Right-to-Left (RTL) Considerations**:
   - Hindi typically renders left-to-right but uses Devanagari script
   - Test with different font renderers
   - Verify UI layout with longer translations

4. **Common Translations**:
   - File → फ़ाइल
   - Edit → संपादित करें
   - View → दृश्य
   - Git → Git (technical term, often kept in English)
   - Terminal → टर्मिनल
   - Debug → डीबग करें
   - Extensions → एक्सटेंशन

#### Quality Assurance

1. **Linguistic Review**:
   - Have native Hindi speakers review translations
   - Verify accuracy and natural phrasing
   - Check for cultural appropriateness

2. **Functional Testing**:
   - Install language pack in VS Code
   - Navigate all UI elements
   - Check menus, dialogs, and status bar
   - Test keyboard shortcuts and mnemonics

3. **Performance Testing**:
   - Measure startup time with Hindi language pack
   - Monitor memory usage
   - Check translation caching efficiency

## Integration with VS Code

### NLS System Integration

The Hindi language pack integrates with VS Code's NLS system through:

1. **Discovery**: Language pack extensions tagged with `lp-hi` are discovered via the extension gallery
2. **Installation**: Downloaded and cached in user data directory
3. **Resolution**: When user sets locale to `hi`, the system loads Hindi translations
4. **Fallback**: If Hindi translation unavailable, falls back to English

### Supported Components

The Hindi language pack provides translations for:

- **Core Editor**:
  - Menu items and commands
  - UI controls and buttons
  - Status bar and notifications
  - Settings and preferences

- **Built-in Extensions**:
  - Git integration
  - TypeScript language features
  - Python language features
  - Markdown preview
  - Debugging
  - Terminal

- **Marketplace Extensions**: Supported if extensions use standard NLS localization

## Testing and Validation

### Manual Testing Checklist

- [ ] Extension installs without errors
- [ ] Language pack loads on startup when `locale: "hi"` is set
- [ ] All menu items display in Hindi
- [ ] Keyboard shortcuts work correctly
- [ ] Status bar shows correct Hindi text
- [ ] Dialogs and notifications appear in Hindi
- [ ] Settings UI displays in Hindi
- [ ] Search and command palette work in Hindi
- [ ] Help and documentation links work
- [ ] Performance is acceptable

### Automated Testing

```bash
npm run test
```

Tests verify:
- Translation file validity
- No missing translation keys
- Proper JSON structure
- Parameter count matches

## Performance Considerations

### Language Pack Size

- Typical language pack: 2-5 MB
- Compressed size: 0.5-1.5 MB
- Cache location: `~/.config/Code/User/clp/` (Linux), `%APPDATA%\Code\User\clp\` (Windows)

### Optimization Strategies

1. **Lazy Loading**: Translations loaded on-demand per module
2. **Caching**: Translations cached locally to avoid re-download
3. **Compression**: Language packs compressed for distribution
4. **Incremental Updates**: Only changed translations in new versions

## Future Enhancements

### Planned Features

1. **Regional Variants**:
   - Support for Hindi (India) - `hi-IN`
   - Potential support for other Indic scripts

2. **Community Contributions**:
   - Crowdsourced translation improvements
   - Community review system for translations

3. **Extended Language Support**:
   - Integration with other Indian language packs
   - Marathi (mr), Telugu (te), Kannada (kn), Tamil (ta), etc.

4. **Enhanced Terminology**:
   - Domain-specific terminology for specialized tools
   - Customizable glossaries for organizations

## Troubleshooting

### Common Issues

#### Language Pack Not Appearing

**Problem**: Hindi language pack doesn't show in language selection

**Solution**:
- Verify internet connection (marketplace query requires connectivity)
- Clear extension cache: Delete `.vscode/extensions` folder
- Restart VS Code
- Re-check available languages

#### Partial Translations

**Problem**: Some UI elements still show in English

**Likely Causes**:
- Translation not yet completed for all modules
- Built-in extension translations missing
- Custom UI from third-party extensions not translated

**Solution**:
- Contribute missing translations
- File issue on GitHub for gaps
- Set fallback language in settings if needed

#### Performance Degradation

**Problem**: VS Code slow after installing Hindi language pack

**Solution**:
- Check disk space in cache directory
- Clear language pack cache and reinstall
- Check for antivirus interfering with file access
- Report performance issue if persists

#### Wrong Characters Displayed

**Problem**: Devanagari script doesn't render correctly

**Solution**:
- Update system fonts (Noto Sans Devanagari recommended)
- Check font settings in VS Code
- Verify encoding is UTF-8
- Update VS Code to latest version

## Resources and References

### Relevant VS Code Documentation

- [VS Code Localization](https://github.com/microsoft/vscode-loc)
- [Extension API - Language Packs](https://code.visualstudio.com/docs/editor/locales)
- [Language Pack Extension Development](https://github.com/microsoft/vscode-language-packs)

### Hindi Language Resources

- [Unicode Devanagari](https://unicode.org/charts/PDF/U0900.pdf)
- [Hindi Technical Glossary](https://tech.hindisamiti.org/) (reference)
- [Noto Sans Devanagari Font](https://www.google.com/get/noto/)

### Community

- **GitHub Issues**: Report bugs and request features
- **Translations Community**: Contribute translations on Crowdin (if available)
- **Discussion Forums**: Community-led discussion on VS Code GitHub

## Contributing

### How to Contribute

1. **Report Issues**:
   - Incorrect translations
   - Missing translations
   - UI rendering problems

2. **Contribute Translations**:
   - Submit pull requests with improved translations
   - Provide context for translation choices
   - Include native speaker review

3. **Improve Documentation**:
   - Enhance this guide
   - Provide usage examples
   - Create video tutorials

## License

The Hindi Language Pack for VS Code is licensed under the [MIT License](LICENSE).

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

For questions, issues, or suggestions:
- **GitHub Issues**: [Report Issues](https://github.com/microsoft/vscode-language-packs/issues)
- **VS Code Discussions**: [Community Discussions](https://github.com/microsoft/vscode/discussions)
- **Email**: localization@microsoft.com

---

**Last Updated**: May 17, 2026

**Current Status**: Ready for Implementation

**Next Steps**: Create marketplace extension entry and begin translation work
