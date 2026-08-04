# Hindi Language Pack - Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing and maintaining the Hindi language pack for Visual Studio Code.

## Directory Structure

```
vscode-language-pack-hi/
├── README.md                           # Main documentation
├── LICENSE.md                          # License file
├── CONTRIBUTING.md                     # Contribution guidelines
├── icon.png                            # Extension icon (256x256)
├── package.json                        # Extension metadata
├── package-lock.json                   # Locked dependencies
├── build.js                            # Build script
├── test.js                             # Test script
├── validate.js                         # Validation script
├── translations/
│   ├── main.i18n.json                 # Core VS Code translations
│   └── extensions/
│       ├── git.i18n.json              # Git extension
│       ├── git-base.i18n.json         # Git base
│       ├── typescript-language-features.i18n.json
│       ├── python.i18n.json           # Python extension
│       ├── html-language-features.i18n.json
│       ├── json-language-features.i18n.json
│       ├── markdown-language-features.i18n.json
│       ├── debug-auto-launch.i18n.json
│       ├── emmet.i18n.json
│       ├── npm.i18n.json
│       ├── shellscript.i18n.json
│       └── ...other extensions
└── scripts/
    ├── extract-strings.js             # Extract English strings
    ├── validate-translations.js       # Validate translation files
    └── build-vsix.js                  # Build VSIX package
```

## Setup Instructions

### 1. Initial Setup

```bash
# Clone the VS Code language packs repository
git clone https://github.com/microsoft/vscode-language-packs.git
cd vscode-language-packs

# Create Hindi language pack directory
mkdir -p i18n/vscode-language-pack-hi
cd i18n/vscode-language-pack-hi

# Initialize npm
npm init -y

# Copy provided package.json
cp package.json .

# Create directories
mkdir -p translations/extensions
mkdir scripts
```

### 2. Installation

```bash
# Install dependencies
npm install

# Install build tools
npm install --save-dev vsce typescript @types/node
```

### 3. Build Process

#### Creating Translation Files

1. **Extract English Strings**:
```bash
npm run build -- --extract-strings
```

This creates JSON templates with English strings and empty Hindi translation values.

2. **Translate Strings**:
- Use JSON editor or specialized translation tools
- Translate each English string to Hindi
- Maintain JSON structure and formatting
- Ensure all required keys are translated

3. **Validate Translations**:
```bash
npm run validate
```

Checks for:
- Valid JSON syntax
- All required translation keys present
- Correct parameter count ({0}, {1}, etc.)
- No broken placeholder syntax

4. **Build Language Pack**:
```bash
npm run build
```

5. **Test Language Pack**:
```bash
npm run test
```

### 4. Build Scripts

#### build.js
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const translationsDir = path.join(__dirname, 'translations');
const extensionsDir = path.join(translationsDir, 'extensions');

// Build process
console.log('Building Hindi Language Pack...');

if (!fs.existsSync(translationsDir)) {
  console.error('translations/ directory not found');
  process.exit(1);
}

// Validate all translation files
const validateTranslationFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    return true;
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}: ${e.message}`);
    return false;
  }
};

let mainValid = validateTranslationFile(path.join(translationsDir, 'main.i18n.json'));
let extensionsValid = true;

if (fs.existsSync(extensionsDir)) {
  const files = fs.readdirSync(extensionsDir);
  for (const file of files) {
    if (file.endsWith('.i18n.json')) {
      if (!validateTranslationFile(path.join(extensionsDir, file))) {
        extensionsValid = false;
      }
    }
  }
}

if (mainValid && extensionsValid) {
  console.log('✓ Build successful');
  process.exit(0);
} else {
  console.error('✗ Build failed');
  process.exit(1);
}
```

#### validate.js
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const translationsDir = path.join(__dirname, 'translations');
const mainFile = path.join(translationsDir, 'main.i18n.json');

let hasErrors = false;

if (!fs.existsSync(mainFile)) {
  console.error('main.i18n.json not found');
  process.exit(1);
}

try {
  const content = JSON.parse(fs.readFileSync(mainFile, 'utf-8'));

  // Validate structure
  for (const [moduleId, translations] of Object.entries(content)) {
    if (typeof translations !== 'object') {
      console.error(`Invalid structure in module ${moduleId}`);
      hasErrors = true;
    }

    for (const [key, value] of Object.entries(translations)) {
      if (typeof value !== 'string') {
        console.error(`Non-string value in ${moduleId}.${key}`);
        hasErrors = true;
      }
    }
  }

  if (!hasErrors) {
    console.log('✓ Validation successful');
    process.exit(0);
  } else {
    process.exit(1);
  }
} catch (e) {
  console.error(`Validation error: ${e.message}`);
  process.exit(1);
}
```

## Translation Guidelines

### Terminology Glossary

Here are the recommended Hindi translations for common technical terms:

#### User Interface Elements
| English | Hindi | Context |
|---------|-------|---------|
| File | फ़ाइल | Menu item, file operations |
| Edit | संपादित करें | Menu item, editing operations |
| View | दृश्य | Menu item, display options |
| Terminal | टर्मिनल | Built-in terminal |
| Explorer | एक्सप्लोरर | File explorer sidebar |
| Search | खोजें | Search functionality |
| Debug | डीबग करें | Debugging operations |
| Extensions | एक्सटेंशन | Extensions marketplace |
| Settings | सेटिंग | User settings |
| Help | मदद | Help menu |

#### Git Operations
| English | Hindi | Context |
|---------|-------|---------|
| Clone | क्लोन करें | Clone repository |
| Commit | प्रतिबद्ध करें | Commit changes |
| Push | धकेलें | Push to remote |
| Pull | खींचें | Pull from remote |
| Branch | शाखा | Git branch |
| Merge | मिलाएं | Merge branches |
| Stash | स्टैश | Stash changes |
| Tag | टैग | Git tag |
| Remote | दूरवर्ती | Remote repository |
| Fetch | लाएं | Fetch from remote |

#### Programming Concepts
| English | Hindi | Context |
|---------|-------|---------|
| Variable | चर | Programming construct |
| Function | फ़ंक्शन | Programming construct |
| Class | वर्ग | Programming construct |
| Module | मॉड्यूल | Code organization |
| Import | आयात करें | Import statement |
| Export | निर्यात करें | Export statement |
| Error | त्रुटि | Error messages |
| Warning | चेतावनी | Warning messages |
| Debug | डीबग करें | Debugging |
| Break | ब्रेक करें | Breakpoint |

#### File Operations
| English | Hindi | Context |
|---------|-------|---------|
| New | नई | Create new |
| Open | खोलें | Open file |
| Save | सहेजें | Save file |
| Delete | हटाएं | Delete file |
| Rename | नाम बदलें | Rename file |
| Copy | कॉपी करें | Copy file |
| Cut | काटें | Cut file |
| Paste | पेस्ट करें | Paste file |
| Undo | पूर्ववत् करें | Undo operation |
| Redo | फिर से करें | Redo operation |

### Translation Best Practices

1. **Consistency**: Use the same translation for the same English term throughout
2. **Context**: Consider the context when translating (some terms may have multiple valid translations)
3. **Natural Flow**: Ensure translations read naturally in Hindi, not just literal translations
4. **Length**: Keep translations reasonably short to fit in UI elements
5. **Grammar**: Follow proper Hindi grammar and syntax rules
6. **Punctuation**: Maintain punctuation style (e.g., colons, commas)

### Common Translation Patterns

#### Imperative Verbs
```json
"खोलें" - Open
"बंद करें" - Close
"सहेजें" - Save
"हटाएं" - Delete
"रीफ्रेश करें" - Refresh
```

#### Noun Phrases
```json
"स्रोत नियंत्रण" - Source Control
"स्थानीयकरण" - Localization
"भाषा पैकेज" - Language Pack
"एक्सटेंशन बाजार" - Extension Marketplace
```

#### Descriptive Terms
```json
"कोई फ़ाइल खुली नहीं है" - No File Open
"सभी परिवर्तन सहेजे गए हैं" - All Changes Saved
"कनेक्शन विफल" - Connection Failed
```

## Testing

### Manual Testing Checklist

- [ ] Extension installs without errors
- [ ] No missing translation keys
- [ ] All UI elements display in Hindi
- [ ] Dialog boxes appear in Hindi
- [ ] Menu items show correct text
- [ ] Status bar displays in Hindi
- [ ] Keyboard shortcuts work
- [ ] Performance is acceptable
- [ ] No encoding issues with Devanagari script
- [ ] RTL issues don't occur

### Automated Testing

```bash
# Run all tests
npm run test

# Test specific file
npm run test -- main.i18n.json

# Validate translations
npm run validate
```

## Building and Publishing

### Building VSIX Package

```bash
# Build the extension package
vsce package

# Output: vscode-language-pack-hi-{version}.vsix
```

### Publishing to Marketplace

#### Prerequisites:
- Microsoft account
- VS Code Marketplace publisher account
- Personal Access Token (PAT)

#### Steps:

1. **Create Publisher Account**:
   - Go to https://marketplace.visualstudio.com/manage
   - Create publisher profile
   - Get Personal Access Token

2. **Configure VSCE**:
```bash
vsce login ms-ceintl
```

3. **Publish Extension**:
```bash
vsce publish
```

### Version Management

Follow semantic versioning:
- **Major**: Large UI changes, incompatible changes
- **Minor**: New features, new translations
- **Patch**: Bug fixes, translation corrections

Example: `1.88.0` matches VS Code version 1.88

## Maintenance

### Regular Updates

1. **Track VS Code Releases**: Monitor new features that need translation
2. **Update Translation Files**: Add new keys as VS Code evolves
3. **Review Translations**: Periodic review for accuracy and consistency
4. **Update package.json**: Match VS Code version in `engines.vscode`

### Community Contributions

1. **Accept Pull Requests**: Review and merge contributions
2. **Verify Translations**: Ensure quality and consistency
3. **Test Changes**: Validate before merging
4. **Acknowledge Contributors**: Credit contributors in release notes

## Troubleshooting

### Common Issues

#### Build Fails with JSON Error
```
Solution: Check JSON syntax in translation files
npm run validate
```

#### Extension Won't Install
```
Solution: Verify package.json and manifest structure
npm run build
```

#### Translations Not Appearing
```
Solution: Check that translations/ directory structure matches package.json
Ensure main.i18n.json exists
```

## Resources

- [VS Code Language Packs Repository](https://github.com/microsoft/vscode-language-packs)
- [VS Code Localization Documentation](https://github.com/microsoft/vscode-loc)
- [VSCE - VS Code Extension CLI](https://github.com/microsoft/vsce)
- [Hindi Language Resources](https://tech.hindisamiti.org/)

## Timeline

### Phase 1: Foundation (Week 1-2)
- Create extension structure
- Set up build process
- Prepare main.i18n.json template

### Phase 2: Core Translations (Week 3-8)
- Translate main UI elements
- Translate Git extension
- Translate common extensions

### Phase 3: Quality Assurance (Week 9-10)
- Test all translations
- Review for consistency
- Fix issues

### Phase 4: Publishing (Week 11)
- Build VSIX package
- Publish to marketplace
- Monitor feedback

### Phase 5: Maintenance (Ongoing)
- Update for VS Code releases
- Handle bug reports
- Improve translations

## Contact & Support

- **GitHub Issues**: Report issues on GitHub
- **Email**: localization@microsoft.com
- **Discussion**: Community forums for translations

---

**Last Updated**: May 17, 2026
**Maintained By**: VS Code Localization Team
