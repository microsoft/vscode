# Solo – Bring Your Own IDE

Solo is a customizable, extensible IDE framework that lets you build a code editor tailored to your workflow. Built on a foundation of VS Code OSS, Solo removes the Microsoft customizations and provides a foundation for creating personalized development environments.

## What is Solo?

Solo is like [Conductor.build](https://conductor.build) but for IDEs. It's a "bring your own IDE" framework—a flexible platform where you can:

- Start with a solid, proven editor foundation (VS Code OSS)
- Customize the UI, theme, and default behavior to match your workflow
- Add, remove, or modify extensions and language support
- Build IDE experiences tailored to specific teams, organizations, or use cases
- Extend core functionality without being locked into Microsoft's product direction

## Getting Started

### Prerequisites

- **Node.js**: v20 or later
- **npm**: 10.x or later
- **Build tools**: C++ compiler (for native modules)
  - **Linux**: `sudo apt-get install build-essential python3`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio Build Tools or Visual Studio Community

### Build and Run

```bash
# Install dependencies
npm install

# Build the project
npm run compile

# Run Solo
npm start
```

For development with hot reload:

```bash
npm run watch
```

## Project Structure

- **`src/`**: Core editor source code
- **`extensions/`**: Built-in extensions (language support, themes, etc.)
- **`build/`**: Build scripts and configuration
- **`test/`**: Unit and integration tests

## Customization

Solo's extensibility is designed around:

- **Themes & UI**: Customize colors, fonts, and layout
- **Extensions**: Add language support, tools, and features via the extension marketplace
- **Configuration**: Deep customization through settings and keybindings
- **Core Behavior**: Modify default editor behavior and workflows

## Testing

```bash
# Run unit tests (Node.js)
npm run test-node

# Run unit tests (Browser)
npm run test-browser

# Run extension tests
npm run test-extension
```

## Contributing

We welcome contributions! To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests to ensure nothing is broken
5. Submit a pull request

Please include a clear description of what you're adding or fixing.

## Development

### Key Commands

- `npm run compile`: Build the project
- `npm run watch`: Watch for file changes and rebuild
- `npm run test-*`: Run tests (see Testing section)
- `npm run check-cyclic-dependencies`: Verify dependency health

### Architecture

Solo is built on TypeScript with a modular architecture. Key layers:

- **Workbench**: UI and window management
- **Editor**: Core text editing
- **Extensions**: Extensibility system
- **Services**: Language, debug, terminal, etc.

For more details, see the source code documentation.

## License

Licensed under the [MIT](LICENSE.txt) license.

---

**Solo is built on VS Code OSS** – a proven, stable foundation for creating modern IDEs. We maintain compatibility with VS Code's extension API while providing the flexibility to build customized experiences.
