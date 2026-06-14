# Contributing to Solo

Welcome, and thank you for your interest in contributing to Solo!

Solo is a customizable IDE framework, and we appreciate contributions in many forms—whether that's code, documentation, bug reports, or feature ideas.

## Asking Questions

Have a question about Solo? Please open a discussion or issue on the [GitHub repository](https://github.com/getnodus/solo). 

We'll do our best to help you get started and answer any questions about the codebase.

## Reporting Issues

Found a bug or have a feature request? We'd love to hear about it!

### Before Creating an Issue

1. **Search existing issues** to see if the problem or feature has already been reported
2. **Check the README** and documentation—your question might be answered there
3. **Test in isolation** – if it's an extension-related issue, try disabling extensions first

### Writing a Good Issue

Include as much detail as possible:

* **Solo version** (check via menu or `npm list`)
* **Operating system and version**
* **Steps to reproduce** (1, 2, 3...)
* **Expected behavior** vs. **actual behavior**
* **Screenshots or videos** if helpful
* **Error messages** from the developer console
* **Relevant code snippets** or a link to a repo you can share

## Contributing Code

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/solo.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/my-feature`
5. Make your changes
6. Run tests: `npm run test-node` (and `npm run test-browser` if UI changes)
7. Push to your fork and open a pull request

### Code Style

- Follow the existing code style and conventions
- Use TypeScript for new code
- Write clear, descriptive commit messages
- Keep commits focused and atomic

### Testing

Please include tests for your changes:

- **Unit tests**: Add tests in the `test/unit/` directory
- **Extension tests**: Use `npm run test-extension` for extension-related changes
- **Manual testing**: Test your changes in the running application

### Pull Request Process

1. Fill out the PR template with a clear description of what you're changing and why
2. Link to any related issues
3. Ensure all tests pass
4. Be responsive to feedback and reviews

## Development Workflow

- `npm run compile` – Build the project
- `npm run watch` – Rebuild on file changes
- `npm start` – Run Solo
- `npm run test-node` – Run Node tests
- `npm run test-browser` – Run browser tests

## Code of Conduct

Be respectful and inclusive. We're building Solo for everyone, and we want this to be a welcoming community.

## Questions?

Open an issue or discussion on GitHub, and we'll help you get started!

## Thank You

Your contributions—whether code, documentation, or feedback—help make Solo better. Thank you for being part of this project!
