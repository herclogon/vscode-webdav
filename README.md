[![GitHub](https://img.shields.io/github/license/kowd/vscode-webdav?style=flat-square)](https://github.com/kowd/vscode-webdav/blob/main/LICENSE)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kowd.vscode-webdav?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kowd.vscode-webdav)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/kowd.vscode-webdav?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kowd.vscode-webdav)
[![Coverage](https://img.shields.io/coverallsCoverage/github/kowd/vscode-webdav?style=flat-square)](https://coveralls.io/github/kowd/vscode-webdav)

# WebDAV Workspaces for Visual Studio Code

The `vscode-webdav` Visual Studio Code extension allows adding WebDAV endpoints as remote workspaces.

## How to use

Install the extension in VS Code.

### Adding a new WebDAV Workspace

There are three ways to open a WebDAV Workspace

* When no folder is open in VS Code, activate the explorer and click on the "Open WebDAV"

* Run the "Open WebDAV Workspace..." command and follow the prompts to enter an address, name and choose authentication.

* Open a `.code-workspace` file which contains a uri with a `webdav` or `webdavs` scheme (corresponding to `http` and `https` WebDAV endpoints respectively). 
```js
{
  "folders": [{
    "name": "live.sysinternals.com",
    "uri": "webdavs://live.sysinternals.com"
  }]
}
```

### Authentication Support

The authentication schemes supported by the extension are:
* `None` - no authentication.
* `Basic` - for Basic authentication consider using TLS too. The password for the account is stored securely in the VS Code SecretStorage.
* `Digest` - The password for the account is stored securely in the VS Code SecretStorage. This means that the OS-specific credential storage will be used.
* `Windows (SSPI)` - This authentication uses the [Windows Security Support Provider Interface](https://learn.microsoft.com/en-us/windows/win32/rpc/security-support-provider-interface-sspi-). In practice this means that the authentication is Kerberos (via [SPNEGO](https://en.wikipedia.org/wiki/SPNEGO)). This should work the same way as in browsers like Edge or Chrome. It is only available on Windows.

### Client TLS Certificate Support

The extension supports client TLS certificates for mutual TLS authentication (mTLS). During the authentication setup, you'll be prompted to optionally configure a client certificate.

**Supported certificate formats:**
* **PKCS#12 / PFX** (`.p12`, `.pfx`) - Single file containing both certificate and private key
* **PEM** (`.pem`, `.crt`, `.cer`) - Separate certificate and private key files

**Features:**
* Password/passphrase protected certificates
* Optional custom CA certificate support
* Secure storage of certificate passwords using VS Code SecretStorage

**To configure client certificates:**
1. Run the `Reset WebDAV Authentication ...` command
2. Select your WebDAV workspace
3. Choose your authentication method (None, Basic, Digest, or Windows SSPI)
4. When prompted "Use client TLS certificate?", select "Yes"
5. Select your certificate file(s)
6. Enter the certificate password if required
7. Optionally add a custom CA certificate

### Changing Passwords or Authentication

If `Basic` or `Digest` authentication is used, or if you need to update client certificate settings, you may need to update the password, account, or certificate configuration.

If at any time authentication fails with a "Forbidden" error a notification pops up suggesting the authentication settings should be reset.

Additionally you can reset the authentication at any time by using the `Reset WebDAV Authentication ...` command.

### Operating System Support

The `Windows (SSPI)` authentication scheme is only supported on Windows.

## Contributions

Contributions are welcome.
