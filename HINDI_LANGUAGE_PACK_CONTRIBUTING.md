# Contributing to the Hindi Language Pack for VS Code

Thank you for your interest in contributing to the Hindi language pack! Your contributions help make VS Code more accessible to Hindi-speaking developers and users.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### 1. Reporting Issues

If you find errors or missing translations:

1. **Check Existing Issues**: Search if the issue is already reported
2. **Create New Issue**: Go to [GitHub Issues](https://github.com/microsoft/vscode-language-packs/issues)
3. **Provide Details**:
   - VS Code version
   - Language pack version
   - Description of the issue
   - Screenshots if applicable
   - Steps to reproduce

#### Issue Template

```markdown
**Description**
Brief description of the issue

**VS Code Version**
[your version]

**Language Pack Version**
[version]

**Steps to Reproduce**
1. ...
2. ...

**Expected vs Actual**
- Expected: ...
- Actual: ...

**Screenshots**
[if applicable]
```

### 2. Translation Contributions

#### Getting Started

1. **Fork the Repository**:
```bash
git clone https://github.com/your-username/vscode-language-packs.git
cd vscode-language-pack-hi
```

2. **Create a Feature Branch**:
```bash
git checkout -b feature/improve-translations
```

3. **Make Changes**:
   - Edit translation files in `translations/` directory
   - Follow the Terminology Glossary
   - Maintain proper JSON formatting

4. **Validate Changes**:
```bash
npm run validate
npm run test
```

5. **Commit Changes**:
```bash
git commit -m "Improve Hindi translations for [component]"
```

6. **Push and Create Pull Request**:
```bash
git push origin feature/improve-translations
```

#### Translation Workflow

##### Step 1: Select What to Translate
- New features in latest VS Code
- Improve existing translations
- Translate missing modules
- Fix inconsistencies

##### Step 2: Research and Preparation
- Understand English term in context
- Check terminology glossary
- Research Hindi technical terms
- Consult with native speakers

##### Step 3: Translate
- Edit the appropriate `.i18n.json` file
- Maintain JSON structure
- Preserve placeholders (`{0}`, `{1}`, etc.)
- Keep translations concise but clear

##### Step 4: Validate
```bash
npm run validate     # Check JSON syntax
npm run test         # Run tests
```

##### Step 5: Review
- Check for consistency with other translations
- Verify natural Hindi phrasing
- Test in VS Code

##### Step 6: Submit Pull Request
- Clear description of changes
- Reference any related issues
- List modules/components changed

### 3. Code Contributions

#### Setting Up Development Environment

```bash
# Clone repository
git clone https://github.com/microsoft/vscode-language-packs.git
cd vscode-language-pack-hi

# Install dependencies
npm install

# Install dev dependencies
npm install --save-dev

# Build
npm run build

# Run tests
npm run test
```

#### Coding Standards

1. **JavaScript/TypeScript**:
   - Use 2-space indentation
   - Follow ESLint rules
   - Add JSDoc comments
   - Use const/let (not var)

2. **JSON**:
   - 2-space indentation
   - No trailing commas
   - Use double quotes
   - Organize keys alphabetically

3. **Scripts**:
   - Make scripts portable (work on Windows/Mac/Linux)
   - Use Node.js APIs when possible
   - Add error handling
   - Include helpful error messages

#### Example: Adding Build Script

```javascript
#!/usr/bin/env node

/**
 * Build script for Hindi Language Pack
 * Validates and prepares translations for packaging
 */

const fs = require('fs');
const path = require('path');

async function build() {
  try {
    console.log('🔨 Building Hindi Language Pack...');

    // Validate translations
    console.log('✓ Validating translations...');

    // Build output
    console.log('✓ Build complete');
  } catch (error) {
    console.error('✗ Build failed:', error);
    process.exit(1);
  }
}

build();
```

### 4. Documentation Contributions

#### Types of Documentation

1. **README**: Getting started guide
2. **CONTRIBUTING**: This file
3. **Translation Guide**: Technical translation guidelines
4. **Glossary**: Technical term translations
5. **API Docs**: Code documentation

#### Writing Documentation

1. **Use Clear Language**:
   - Write for audience of different levels
   - Explain technical terms
   - Use examples

2. **Structure**:
   - Use headings and subheadings
   - Add table of contents for long documents
   - Break into logical sections

3. **Examples**:
   - Include code samples
   - Show expected output
   - Provide real-world usage

4. **Links**:
   - Link to related documentation
   - Use descriptive link text
   - Keep links up-to-date

## Pull Request Process

### Before Submitting

1. **Update from main**:
```bash
git fetch origin
git rebase origin/main
```

2. **Test thoroughly**:
```bash
npm run validate
npm run test
npm run build
```

3. **Check for conflicts**:
   - Resolve any merge conflicts
   - Ensure changes don't break builds

4. **Review your own changes**:
   - Check diff carefully
   - Verify all files should be included
   - Remove debug code

### Creating Pull Request

1. **Title**: Clear, concise title
   - ✓ "Add Hindi translations for Git extension"
   - ✗ "Fixed stuff"

2. **Description**:
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] Translation improvement
- [ ] New translations
- [ ] Documentation
- [ ] Code refactoring

## Related Issues
Closes #[issue number]

## Changes Made
- Change 1
- Change 2

## Testing Done
- [ ] Validated translations
- [ ] Ran tests
- [ ] Tested in VS Code
- [ ] Checked consistency

## Screenshots (if applicable)
[Add screenshots]

## Checklist
- [ ] Followed style guidelines
- [ ] Tested changes
- [ ] Updated documentation
- [ ] No breaking changes
```

3. **Link Issues**: Reference any related issues

### Review Process

1. **Automated Checks**:
   - Builds must pass
   - Tests must pass
   - No conflicts

2. **Human Review**:
   - Translation accuracy
   - Consistency with glossary
   - Code quality
   - Documentation clarity

3. **Feedback**:
   - Constructive suggestions
   - Respectful communication
   - Approval or request for changes

4. **Merging**:
   - Squash commits if needed
   - Merge only after approval
   - Delete branch after merge

## Contribution Areas

### High Priority

- [ ] Complete core UI translations
- [ ] Translate Git extension fully
- [ ] Translate TypeScript extension
- [ ] Translate Python extension

### Medium Priority

- [ ] Translate other language extensions
- [ ] Improve existing translations
- [ ] Fix consistency issues
- [ ] Add missing extensions

### Low Priority

- [ ] Update documentation
- [ ] Optimize build scripts
- [ ] Add nice-to-have features
- [ ] Performance improvements

## Translation Quality Standards

### Accuracy (100%)
- Correct meaning preserved
- No mistranslations
- Technical terms correct

### Consistency (100%)
- Same term always translated same way
- Formatting rules followed
- Style guidelines adhered to

### Completeness (95%+)
- All strings translated
- No placeholders left empty
- All modules included

### Naturalness (90%+)
- Reads naturally in Hindi
- Grammar correct
- Phrasing sounds native

## Terminology Guidelines

### Creating New Translations

1. **Research**:
   - Check existing glossary
   - Research Hindi technical terms
   - Consult native speakers

2. **Decide Translation**:
   - Literal vs. functional equivalence
   - Short enough for UI
   - Understandable to average user

3. **Document**:
   - Add to glossary
   - Note any special context
   - Explain reasoning if unique

### Handling Untranslatable Terms

Some terms might be better left untranslated:
- Proper nouns (Git, GitHub, Python)
- Brand names (VS Code, GitHub)
- File extensions (.js, .py)
- Acronyms (JSON, XML, API)

## Resources for Contributors

### Learning Resources

- [VS Code Localization Guide](https://github.com/microsoft/vscode-loc)
- [Hindi Language Support](https://unicode.org/charts/PDF/U0900.pdf)
- [Git Workflow Guide](https://guides.github.com/introduction/flow/)
- [Translation Best Practices](https://www.transifex.com/guide/)

### Tools

- [JSON Validator](https://jsonlint.com/)
- [Diff Checker](https://www.diffchecker.com/)
- [VS Code DevTools](https://code.visualstudio.com/docs/editor/debugging)
- [Language Pack Tester](https://github.com/microsoft/vscode-language-pack-tester)

### Community

- **GitHub Discussions**: Ask questions
- **Crowdin** (if available): Collaborative translation
- **Slack/Discord**: Real-time chat with team
- **Emails**: Direct contact for questions

## Frequently Asked Questions

**Q: I found a translation error, what should I do?**
A: File an issue on GitHub with details. Or if you can fix it, submit a PR.

**Q: How can I get help with a translation?**
A: Ask in GitHub Issues or reach out to the community.

**Q: What if I disagree with an existing translation?**
A: Open a discussion issue to debate alternatives.

**Q: Can I add new languages?**
A: For now, focus on Hindi. Other languages can be added later.

**Q: How often are updates released?**
A: Typically with each VS Code release (monthly).

**Q: How do I test my translations?**
A: Install the built language pack in VS Code and verify all UI elements.

## Recognition

We recognize and appreciate all contributions! Contributors are:
- Thanked in release notes
- Listed in CONTRIBUTORS.md
- Recognized in GitHub commit history
- May be featured in announcements

## Questions or Need Help?

- 📧 Email: localization@microsoft.com
- 💬 GitHub Issues: Ask questions
- 💡 Discussions: Share ideas
- 📚 Documentation: Check guides

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

**Thank you for contributing to making VS Code more accessible in Hindi!** 🙏

**Happy translating!** 🚀

---

Last Updated: May 17, 2026
