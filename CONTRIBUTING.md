# Contributing to WebDAV Workspace

Thank you for your interest in contributing to the WebDAV Workspace extension! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/kowd/vscode-webdav/issues) to avoid duplicates.

When you create a bug report, please include:
- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs. **actual behavior**
- **Screenshots** if applicable
- **Environment details**: OS, VS Code version, extension version
- **Logs** from the WebDAV Sync output channel

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:
- **Clear and descriptive title**
- **Detailed description** of the proposed functionality
- **Use cases** - explain why this would be useful
- **Possible implementation** if you have ideas

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes**:
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation as needed
3. **Test your changes**:
   - Run `npm test` to ensure tests pass
   - Test the extension manually in VS Code
4. **Commit your changes**:
   - Use clear and descriptive commit messages
   - Reference issues and pull requests when relevant
5. **Push to your fork** and submit a pull request

## Development Setup

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Visual Studio Code
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vscode-webdav.git
cd vscode-webdav

# Add upstream remote
git remote add upstream https://github.com/kowd/vscode-webdav.git

# Install dependencies
npm install

# Build the extension
npm run build
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to start debugging
3. A new VS Code window will open with the extension loaded
4. Test your changes in this Extension Development Host window

### Watch Mode

For active development, use watch mode:

```bash
npm run watch
```

This will automatically recompile when you make changes.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
vscode-webdav/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── sync/                 # Sync functionality
│   │   ├── AutoSyncManager.ts
│   │   ├── FileOperations.ts
│   │   └── SyncConfiguration.ts
│   ├── ui/                   # User interface components
│   │   ├── SetupWizard.ts
│   │   ├── SyncTreeDataProvider.ts
│   │   ├── SyncTreeItems.ts
│   │   └── WebDAVBrowser.ts
│   └── utils/                # Utility functions
│       ├── Logger.ts
│       └── PathUtils.ts
├── out/                      # Compiled output
├── .github/
│   └── workflows/           # CI/CD workflows
├── package.json             # Extension manifest
└── tsconfig.json           # TypeScript configuration
```

## Code Style

- **TypeScript** is used throughout the project
- Follow existing code formatting and conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and small

### Naming Conventions

- **Classes**: PascalCase (e.g., `AutoSyncManager`)
- **Functions/Methods**: camelCase (e.g., `syncNow`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `IS_WINDOWS`)
- **Interfaces**: PascalCase with 'I' prefix optional (e.g., `SyncConfiguration`)

## Testing

- Write tests for new functionality
- Update existing tests when modifying functionality
- Ensure all tests pass before submitting a PR
- Aim for good code coverage

## Documentation

- Update README.md if you add new features
- Add JSDoc comments for public APIs
- Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/) format

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Reach out to the maintainers

Thank you for contributing! 🎉
