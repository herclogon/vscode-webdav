# Security Policy

## Supported Versions

We currently support the following versions of the WebDAV Workspace extension with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of the WebDAV Workspace extension seriously. If you discover a security vulnerability, please follow these steps:

### Where to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by:
- Emailing the maintainer directly (if contact information is available in the repository)
- Using GitHub's private security advisory feature at: https://github.com/kowd/vscode-webdav/security/advisories/new

### What to Include

Please include the following information in your report:
- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Updates**: We will provide regular updates on our progress
- **Timeline**: We aim to address critical vulnerabilities within 30 days
- **Credit**: We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Considerations

### Credential Storage

The extension stores WebDAV credentials using VS Code's SecretStorage API, which provides encrypted storage:
- Credentials are never logged or written to disk in plain text
- Credentials are stored per-workspace
- You can reset credentials using the "Reset WebDAV Authentication" command

### Network Security

- The extension supports both `webdav://` (HTTP) and `webdavs://` (HTTPS) protocols
- **We strongly recommend using HTTPS (webdavs://)** for production environments
- The extension validates SSL certificates by default

### Authentication Methods

The extension supports multiple authentication methods:
- **Basic Auth**: Base64 encoded (use only with HTTPS)
- **Digest Auth**: More secure than Basic, but still use with HTTPS

### Best Practices

When using this extension, we recommend:
1. Always use HTTPS (webdavs://) connections
2. Use strong passwords
3. Regularly update the extension to the latest version
4. Review sync configurations to ensure sensitive files are not being synced
5. Use proper file permissions on synced folders
6. Enable 2FA on your WebDAV server if available

## Known Security Limitations

- The extension requires network access to WebDAV servers
- Credentials are stored locally and tied to the VS Code installation
- Auto-sync features may transmit files automatically when changes are detected

## Updates

This security policy may be updated from time to time. Please check back regularly for updates.

Last updated: February 5, 2026
