# WebDAV Workspace

[![Build and Test](https://github.com/herlogon/vscode-webdav/actions/workflows/build.yml/badge.svg)](https://github.com/herlogon/vscode-webdav/actions/workflows/build.yml)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kowd.vscode-webdav)](https://marketplace.visualstudio.com/items?itemName=kowd.vscode-webdav)

A VS Code extension that provides WebDAV file system integration and one-way sync capabilities, allowing you to work with remote WebDAV servers seamlessly.

## Features

### 🔌 WebDAV FileSystemProvider
- Mount WebDAV folders as VS Code workspaces
- Direct file editing on remote WebDAV servers
- Full read/write support with native VS Code file operations

### 🔄 Auto-Sync
- **One-way sync** from local to remote WebDAV folders
- **Auto-sync on change** - automatically uploads when local files are modified
- **Manual sync** - trigger full upload on demand
- **Multiple sync configurations** - manage multiple sync pairs simultaneously
- **Sync status tracking** - visual indicators for sync status
- **File filtering** - exclude patterns and hidden file handling

### 🔐 Authentication Support
- **Basic Authentication**
- **Digest Authentication**
- Secure credential storage using VS Code SecretStorage

### 📁 Sync Management UI
- Dedicated sync view in the activity bar
- Easy configuration through setup wizard
- Visual sync status indicators
- Quick actions: pause, resume, sync now
- Sync logs for troubleshooting

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "WebDAV Workspace"
4. Click Install

### From VSIX
1. Download the latest `.vsix` file from [Releases](https://github.com/kowd/vscode-webdav/releases)
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Usage

### Opening a WebDAV Workspace

1. Press `Ctrl+Shift+P` to open the command palette
2. Type "Remote WebDAV: Open WebDAV Workspace..."
3. Enter your WebDAV server URL (e.g., `webdav://server.com/path` or `webdavs://server.com/path`)
4. Provide credentials if required
5. Select authentication type (Basic or Digest)

### Setting Up Sync

1. Click on the WebDAV Sync icon in the activity bar
2. Click the "+" button to add a new sync configuration
3. Follow the setup wizard:
   - Select local folder
   - Enter WebDAV server URL
   - Configure authentication
   - Set sync options (auto-sync, exclude patterns, hidden files, etc.)
4. Save the configuration

### Managing Syncs

- **Sync Now**: Click the sync icon next to a configuration
- **Pause/Resume**: Control auto-sync behavior
- **Edit Configuration**: Opens settings JSON to update sync settings
- **View Logs**: Check sync history and troubleshoot issues
- **Remove Sync**: Delete a sync configuration

## Configuration

Configure the extension through VS Code settings:

```json
{
  "webdav.autoSync.enabled": true,
  "webdav.autoSync.configurations": []
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Remote WebDAV: Open WebDAV Workspace...` | Open a WebDAV folder as a workspace |
| `Remote WebDAV: Reset WebDAV Authentication...` | Clear stored credentials |
| `WebDAV Sync: Add Sync Configuration` | Add a new sync configuration |
| `WebDAV Sync: Sync Now` | Manually trigger sync |
| `WebDAV Sync: Pause Sync` | Pause auto-sync |
| `WebDAV Sync: Resume Sync` | Resume auto-sync |
| `WebDAV Sync: Edit Configuration` | Opens settings JSON to edit sync settings |
| `WebDAV Sync: Remove Sync` | Delete sync configuration |
| `WebDAV Sync: Show Sync Log` | View sync logs |

## Requirements

- Visual Studio Code ^1.85.0
- Node.js (for development)
- WebDAV server with appropriate access

## Platform Support

- ✅ Windows
- ✅ Linux
- ✅ macOS

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/kowd/vscode-webdav.git
cd vscode-webdav

# Install dependencies
npm install

# Build the extension
npm run build

# Watch mode for development
npm run watch
```

### Running Tests

```bash
npm test
```

### Packaging

```bash
npm run package
```

## Troubleshooting

### Authentication Issues
- Use `Remote WebDAV: Reset WebDAV Authentication` to clear cached credentials
- Verify your WebDAV server URL and credentials
- Check that your WebDAV server supports the selected authentication method

### Sync Issues
- Check sync logs via `WebDAV Sync: Show Sync Log`
- Verify network connectivity to the WebDAV server
- Ensure proper write permissions on the remote WebDAV folder
- Check for locked files on the WebDAV server

## Known Issues

Please check the [GitHub Issues](https://github.com/kowd/vscode-webdav/issues) page for known issues and feature requests.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [webdav](https://github.com/perry-mitchell/webdav-client) client library

## Author

**Miro Paskov**

## Links

- [GitHub Repository](https://github.com/kowd/vscode-webdav)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kowd.vscode-webdav)
- [Report Issues](https://github.com/kowd/vscode-webdav/issues)
- [Changelog](CHANGELOG.md)

---

Made with ❤️ for the VS Code community
