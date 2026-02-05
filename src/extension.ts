import * as vscode from 'vscode';
import { FileStat, WebDAVClient, WebDAVClientOptions, WebDAVClientError, AuthType, createClient } from 'webdav';
import { parse } from 'date-fns';
import * as axios from 'axios';
import * as fs from 'fs';
import * as https from 'https';

// Import sync components
import { AutoSyncManager } from './sync/AutoSyncManager';
import { FileOperations } from './sync/FileOperations';
import { Logger } from './utils/Logger';
import { SyncTreeDataProvider } from './ui/SyncTreeDataProvider';
import { SetupWizard } from './ui/SetupWizard';
import { WebDAVBrowser } from './ui/WebDAVBrowser';
import { SyncConfigItem, SyncDetailItem } from './ui/SyncTreeItems';

const log = (message: string): void => outputChannel.appendLine(message);
let outputChannel: vscode.OutputChannel;

// Sync manager and logger
let syncManager: AutoSyncManager;
let syncLogger: Logger;
let treeDataProvider: SyncTreeDataProvider;

export const IS_WINDOWS = process.platform === "win32";
let sspiClient: any = undefined;
let sspiAdapter: (config: axios.AxiosRequestConfig) => Promise<axios.AxiosResponse>;

if (IS_WINDOWS) {
    try {
        const sspi = require('node-expose-sspi');

        sspiAdapter = async (config: axios.AxiosRequestConfig): Promise<axios.AxiosResponse> => {
            if (sspiClient === undefined) {
                sspiClient = new sspi.sso.Client();
            }
            const url = new URL(config.url?.toString() || "", config.baseURL).toString();
            const response = await sspiClient.fetch(url, {
                agent: config.httpAgent,
                body: config.data,
                method: config.method,
                redirect: 'follow',
            });

            const headers: Record<string, string> = {};
            for (const entry of response.headers.entries()) {
                headers[entry[0]] = entry[1];
            }

            let data: any = undefined;
            if (config.responseType === "text") {
                data = response.text();
            } else {
                data = response.buffer();
            }

            return {
                config: config,
                status: response.status,
                statusText: response.statusText,
                data: data,
                headers: headers,
            };
        };
    } catch (e) {
        console.warn('node-expose-sspi not available (Windows only)');
    }
}

// Configure axios interceptor for WebDAV requests
// This modifies axios globally but only affects requests with withCredentials=true (SSPI auth)
// and ensures Accept header is set to prevent 406 errors from strict WebDAV servers
axios.default.interceptors.request.use(async (config) => {
    if (config.withCredentials) {
        config.adapter = sspiAdapter;
    }
    // Force Accept header to prevent 406 errors from WebDAV servers
    if (!config.headers) {
        config.headers = {};
    }
    config.headers['Accept'] = '*/*';
    return config;
}, (error) => {
    return Promise.reject(error);
});

/**
 * Validates a WebDAV URI string.
 * @param value - The URI string to validate
 * @returns An error message if invalid, undefined if valid
 */
export function validationErrorsForUri(value: string): string | undefined {
    if (!value) {
        return 'Enter a WebDAV address';
    } else {
        try {
            const uri = vscode.Uri.parse(value.trim());
            if (!["http", "https", "webdav", "webdavs"].some(s => s === uri.scheme.toLowerCase())) {
                return `Unsupported protocol: ${uri.scheme}`;
            }
        } catch {
            return 'Enter a valid URI';
        }
    }
}

/**
 * Resets authentication for WebDAV workspaces.
 * Prompts user to reconfigure authentication settings.
 */
export async function resetAuth() {
    const uris = (vscode.workspace.workspaceFolders || []).map(f => f.uri.toString()).filter(u => u.startsWith("webdav"));
    if (uris.length) {
        const uri = uris.length === 1 ? uris[0] : (await vscode.window.showQuickPick(uris, { placeHolder: "Which WebDAV to Authenticate to?" }));
        if (uri) {
            await configureAuthForUri(toBaseUri(vscode.Uri.parse(uri)));
        }
    } else {
        vscode.window.showInformationMessage("No WebDAVs folders can be found in the current Workspace");
    }
}

/**
 * Opens a new WebDAV workspace by prompting for address and authentication.
 * Adds the WebDAV folder to the current workspace.
 */
export async function openWebdav() {
    const uriValue = await vscode.window.showInputBox({
        placeHolder: 'Enter a WebDAV address here ...',
        prompt: "Open remote WebDAV",
        validateInput: validationErrorsForUri
    });

    if (!uriValue || validationErrorsForUri(uriValue)) {
        return;
    }

    const webdavUri = vscode.Uri.parse(uriValue.trim().replace(/^http/i, 'webdav'));

    const name = await vscode.window.showInputBox({
        placeHolder: 'Press ENTER to use default ...',
        value: webdavUri.authority,
        prompt: "Custom name for Remote WebDAV"
    });

    await configureAuthForUri(toBaseUri(webdavUri));

    vscode.workspace.updateWorkspaceFolders(
        0, 0,
        {
            uri: webdavUri,
            name: name?.trim() ?? webdavUri.authority,
        },
    );
}

/**
 * Activates the WebDAV extension.
 * Registers file system providers and commands.
 * @param context - The VS Code extension context
 */
export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        outputChannel = vscode.window.createOutputChannel('WebDAV Workspaces')
    );
    outputChannel.hide();
    log('Initializing WebDAV extension...');
    log('Register provider for webdav schemes... ');

    secrets = context.secrets;
    state = context.globalState;

    for (const scheme of ['webdav', 'webdavs']) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(scheme, new WebDAVFileSystemProvider(), { isCaseSensitive: true })
        );
    }

    log(`Register extension.remote.webdav.resetAuth command... `);
    context.subscriptions.push(vscode.commands.registerCommand('extension.remote.webdav.resetAuth', resetAuth));

    log(`Register extension.remote.webdav.open command... `);
    context.subscriptions.push(vscode.commands.registerCommand('extension.remote.webdav.open', openWebdav));

    // Initialize sync components
    log('Initializing WebDAV Sync...');
    syncLogger = new Logger('WebDAV Sync');
    context.subscriptions.push(syncLogger);

    const fileOps = new FileOperations(syncLogger);
    const webdavBrowser = new WebDAVBrowser(syncLogger);

    // Create sync manager with WebDAV client factory
    syncManager = new AutoSyncManager(
        context,
        syncLogger,
        fileOps,
        async (webdavUrl: string) => {
            // Extract base URI for authentication lookup (without path)
            const baseUri = vscode.Uri.parse(webdavUrl)
                .with({ path: "", fragment: "", query: "" })
                .toString();
            
            // Create client with full URL but use base URI for auth
            const fsProvider = new WebDAVFileSystemProvider();
            
            // Check if we have a connection for the base URI, if not create one
            if (!connections[baseUri]) {
                connections[baseUri] = fsProvider['createClient'](baseUri);
            }
            
            // Get the authenticated client for base URI
            const baseClient = await connections[baseUri];
            
            // If webdavUrl has a path component, create a new client with full URL
            // but copy the auth settings from the base client
            const urlObj = new URL(webdavUrl);
            if (urlObj.pathname && urlObj.pathname !== '/') {
                // Create client with full URL, reusing base client's auth
                return fsProvider['createClient'](webdavUrl);
            }
            
            return baseClient;
        }
    );
    context.subscriptions.push(syncManager);

    // Register tree view
    treeDataProvider = new SyncTreeDataProvider(syncManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('webdav-sync-list', treeDataProvider)
    );

    // Create setup wizard
    const setupWizard = new SetupWizard(
        syncManager,
        webdavBrowser,
        syncLogger,
        async (webdavUrl: string) => {
            // Extract base URI for authentication
            const baseUri = vscode.Uri.parse(webdavUrl)
                .with({ path: "", fragment: "", query: "" })
                .toString();
            
            const fsProvider = new WebDAVFileSystemProvider();
            
            // Ensure base connection exists
            if (!connections[baseUri]) {
                connections[baseUri] = fsProvider['createClient'](baseUri);
            }
            
            // Get authenticated client
            await connections[baseUri];
            
            // Create client with full URL
            return fsProvider['createClient'](webdavUrl);
        },
        configureAuthForUri
    );

    // Register sync commands
    log('Register sync commands...');
    
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.addSync', async () => {
            await setupWizard.run();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.syncNow', async (item?: SyncConfigItem) => {
            try {
                const configId = item?.config.id;
                if (configId) {
                    await syncManager.syncNow(configId, true);
                } else {
                    vscode.window.showWarningMessage('No sync configuration selected');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Sync failed: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.pauseSync', async (item?: SyncConfigItem) => {
            const configId = item?.config.id;
            if (configId) {
                await syncManager.updateConfiguration(configId, { enabled: false });
                vscode.window.showInformationMessage(`Paused sync: ${item.config.name}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.resumeSync', async (item?: SyncConfigItem) => {
            const configId = item?.config.id;
            if (configId) {
                await syncManager.updateConfiguration(configId, { enabled: true });
                vscode.window.showInformationMessage(`Resumed sync: ${item.config.name}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.editSync', async (item?: SyncConfigItem) => {
            if (item) {
                await setupWizard.edit(item.config.id);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.removeSync', async (item?: SyncConfigItem) => {
            const configId = item?.config.id;
            if (configId) {
                const confirm = await vscode.window.showWarningMessage(
                    `Remove sync configuration "${item.config.name}"?`,
                    { modal: true },
                    'Remove'
                );
                if (confirm === 'Remove') {
                    await syncManager.removeConfiguration(configId);
                    vscode.window.showInformationMessage(`Removed sync: ${item.config.name}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.showSyncLog', () => {
            syncLogger.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.changeCredentials', async (item?: SyncConfigItem) => {
            if (item) {
                const baseUri = item.config.getBaseUri();
                await configureAuthForUri(baseUri);
                vscode.window.showInformationMessage(`Credentials updated for ${item.config.name}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.copyConfig', async (item?: SyncConfigItem) => {
            if (item) {
                const configJson = JSON.stringify(item.config.toJSON(), null, 2);
                await vscode.env.clipboard.writeText(configJson);
                vscode.window.showInformationMessage(`Configuration copied to clipboard: ${item.config.name}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.refreshSyncView', () => {
            treeDataProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.remote.webdav.editPath', async (item?: SyncDetailItem) => {
            if (!item || !item.config || !item.type) {
                return;
            }

            const isLocal = item.type === 'local';
            const currentValue = isLocal ? item.config.localPath : item.config.remotePath;
            const prompt = isLocal ? 'Enter new local path' : 'Enter new remote path';

            const newValue = await vscode.window.showInputBox({
                prompt: prompt,
                value: currentValue,
                placeHolder: currentValue
            });

            if (newValue && newValue !== currentValue) {
                await syncManager.updateConfiguration(item.config.id, {
                    [isLocal ? 'localPath' : 'remotePath']: newValue
                });
                vscode.window.showInformationMessage(`Updated ${isLocal ? 'local' : 'remote'} path to: ${newValue}`);
            }
        })
    );

    outputChannel.appendLine('Extension has been initialized.');
    log('WebDAV Sync initialized.');
}

/**
 * Deactivates the WebDAV extension.
 * Cleanup is handled automatically by VS Code.
 */
export function deactivate() { }

/**
 * Converts a VS Code URI to a WebDAV path.
 * @param uri - The VS Code URI to convert
 * @returns The WebDAV path string
 */
export const toWebDAVPath = (uri: vscode.Uri): string =>
    uri.path?.trim() || "/";

/**
 * Converts a WebDAV URI to its base HTTP(S) URI.
 * @param uri - The WebDAV URI to convert
 * @returns The base HTTP(S) URI string
 */
export const toBaseUri = (uri: vscode.Uri): string =>
    vscode.Uri.parse(uri.toString().replace(/^webdav/i, "http")).with({ path: "", fragment: "", query: "" }).toString();

export type WebDAVAuthType = "None" | "Basic" | "Digest" | "Windows (SSPI)";
export interface AuthSettings {
    auth?: WebDAVAuthType,
    user?: string,
    useCertificate?: boolean,
    certPath?: string,
    keyPath?: string,
    caPath?: string,
}

export let secrets: vscode.SecretStorage;
export let state: vscode.Memento;

/**
 * Configures authentication settings for a specific WebDAV URI.
 * Prompts user for authentication type and credentials.
 * @param uriKey - The base URI key for storing authentication settings
 */
export async function configureAuthForUri(uriKey: string): Promise<void> {
    delete connections[uriKey]; // The conections are keyed on the baseUri
    const authOptions = ["None", "Basic", "Digest"];
    if (IS_WINDOWS) {
        authOptions.push("Windows (SSPI)");
    }

    const settings: AuthSettings = { 
        auth: await vscode.window.showQuickPick(authOptions, { placeHolder: `Choose authentication for ${uriKey}` }) as WebDAVAuthType 
    };
    if (settings.auth === "Basic" || settings.auth === "Digest") {
        settings.user = await vscode.window.showInputBox({ prompt: "Username", placeHolder: `Username for login to ${uriKey}` });
        const pass = await vscode.window.showInputBox({ prompt: "Password", password: true, placeHolder: `Password for ${settings.user}` }) || "";
        await secrets.store(uriKey, pass);
    }

    // Ask if user wants to use client certificate
    const useCert = await vscode.window.showQuickPick(["No", "Yes"], { 
        placeHolder: "Use client TLS certificate?" 
    });
    
    if (useCert === "Yes") {
        settings.useCertificate = true;
        
        // Get certificate file path
        const certFiles = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Certificate Files': ['pem', 'crt', 'cer', 'p12', 'pfx'] },
            title: 'Select Client Certificate'
        });
        
        if (certFiles && certFiles[0]) {
            settings.certPath = certFiles[0].fsPath;
            
            // Check if it's a PKCS#12 file (p12/pfx)
            const isPKCS12 = settings.certPath.match(/\.(p12|pfx)$/i);
            
            if (!isPKCS12) {
                // For PEM format, also get the private key file
                const keyFiles = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'Key Files': ['pem', 'key'] },
                    title: 'Select Private Key'
                });
                
                if (keyFiles && keyFiles[0]) {
                    settings.keyPath = keyFiles[0].fsPath;
                }
            }
            
            // Ask for certificate password
            const certPass = await vscode.window.showInputBox({ 
                prompt: "Certificate Password (leave empty if none)", 
                password: true, 
                placeHolder: "Enter certificate password" 
            });
            if (certPass) {
                await secrets.store(`${uriKey}:cert`, certPass);
            }
            
            // Optionally ask for CA certificate
            const addCA = await vscode.window.showQuickPick(["No", "Yes"], { 
                placeHolder: "Add custom CA certificate?" 
            });
            
            if (addCA === "Yes") {
                const caFiles = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'CA Certificate': ['pem', 'crt', 'cer'] },
                    title: 'Select CA Certificate'
                });
                
                if (caFiles && caFiles[0]) {
                    settings.caPath = caFiles[0].fsPath;
                }
            }
        }
    }

    await state.update(uriKey, settings);
}

export const connections: { [key: string]: Promise<WebDAVClient> } = {};

export class WebDAVFileSystemProvider implements vscode.FileSystemProvider {

    private readonly _eventEmitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;

    public constructor() {
        this._eventEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
        this.onDidChangeFile = this._eventEmitter.event;
    }

    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

    public async copy(source: vscode.Uri, destination: vscode.Uri, _options: { overwrite: boolean }): Promise<void> {
        return await this.forConnection("copy", source, async webdav => {
            return await webdav.copyFile(toWebDAVPath(source), toWebDAVPath(destination));
        });
    }

    public async createDirectory(uri: vscode.Uri): Promise<void> {
        return await this.forConnection("createDirectory", uri, async webdav => {
            return await webdav.createDirectory(toWebDAVPath(uri));
        });
    }

    public async delete(uri: vscode.Uri, _options: { recursive: boolean }): Promise<void> {
        return await this.forConnection("delete", uri, async webdav => {
            return await webdav.deleteFile(toWebDAVPath(uri));
        });
    }

    private async createClient(baseUri: string): Promise<WebDAVClient> {
        let options: WebDAVClientOptions = {
            // Add permissive headers to avoid 406 Not Acceptable errors
            headers: {
                'Accept': '*/*',
                'User-Agent': 'VSCode-WebDAV/1.0'
            },
            maxBodyLength: 500 * 1024 * 1024, // 500MB
            maxContentLength: 500 * 1024 * 1024 // 500MB
        };
        
        // Try to get settings from the full URI first, then fall back to base URI
        let settings = state.get<AuthSettings>(baseUri, {});
        let authKey = baseUri;
        
        // If no settings found and baseUri has a path, try the base URL without path
        if (!settings.auth && baseUri.includes('://')) {
            const parsedUri = vscode.Uri.parse(baseUri);
            if (parsedUri.path && parsedUri.path !== '/') {
                const baseUrlOnly = parsedUri.with({ path: '', query: '', fragment: '' }).toString();
                const baseSettings = state.get<AuthSettings>(baseUrlOnly, {});
                if (baseSettings.auth) {
                    settings = baseSettings;
                    authKey = baseUrlOnly;
                }
            }
        }
        
        if (settings.auth === "Basic" || settings.auth === "Digest") {
            const password = await secrets.get(authKey);
            options = {
                ...options,
                authType: settings.auth === "Basic" ? AuthType.Password : AuthType.Digest,
                username: settings.user,
                password: password
            };
        } else if (settings.auth === "Windows (SSPI)") {
            options = { 
                ...options,
                withCredentials: true // This is a signal to use SSPI
            };
        }
        
        // Configure client TLS certificate
        if (settings.useCertificate && settings.certPath) {
            try {
                const httpsAgent: any = {};
                const certPassword = await secrets.get(`${authKey}:cert`);
                
                // Check if it's a PKCS#12 file
                const isPKCS12 = settings.certPath.match(/\.(p12|pfx)$/i);
                
                if (isPKCS12) {
                    // Load PKCS#12 certificate (contains both cert and key)
                    const pfx = fs.readFileSync(settings.certPath);
                    httpsAgent.pfx = pfx;
                    if (certPassword) {
                        httpsAgent.passphrase = certPassword;
                    }
                    log(`Loaded PKCS#12 certificate from ${settings.certPath}`);
                } else {
                    // Load PEM format certificate and key separately
                    const cert = fs.readFileSync(settings.certPath);
                    httpsAgent.cert = cert;
                    
                    if (settings.keyPath) {
                        const key = fs.readFileSync(settings.keyPath);
                        httpsAgent.key = key;
                        if (certPassword) {
                            httpsAgent.passphrase = certPassword;
                        }
                        log(`Loaded PEM certificate from ${settings.certPath} and key from ${settings.keyPath}`);
                    } else {
                        log(`Warning: Certificate loaded but no key file specified`);
                    }
                }
                
                // Load CA certificate if specified
                if (settings.caPath) {
                    const ca = fs.readFileSync(settings.caPath);
                    httpsAgent.ca = ca;
                    log(`Loaded CA certificate from ${settings.caPath}`);
                }
                
                // Create the HTTPS agent with certificate configuration
                options.httpsAgent = new https.Agent(httpsAgent);
            } catch (error) {
                log(`Error loading client certificate: ${error}`);
                vscode.window.showErrorMessage(`Failed to load client certificate: ${error}`);
                throw error;
            }
        }
        
        return createClient(baseUri, options);
    }

    private async forConnection<T>(operation: string, uri: vscode.Uri, action: (webdav: WebDAVClient) => Promise<T>): Promise<T> {
        log(`${operation}: ${uri}`);
        const baseUri = toBaseUri(uri);
        try {
            if (!connections[baseUri]) {
                connections[baseUri] = this.createClient(baseUri);
            }
            return await action(await connections[baseUri]);
        } catch (e) {
            const status = (e as WebDAVClientError).status;
            log(`Error for ${uri}: ${e}, Status: ${status}, Response: ${(e as any).response?.status}`);
            switch (status) {
                case 401:
                    // Clear the failed connection
                    delete connections[baseUri];
                    const message = await vscode.window.showWarningMessage(`Authentication failed for ${uri.authority}.`, "Authenticate", "Cancel");
                    if (message === "Authenticate") {
                        await configureAuthForUri(baseUri);
                        // Retry the operation with new credentials
                        try {
                            connections[baseUri] = this.createClient(baseUri);
                            return await action(await connections[baseUri]);
                        } catch (retryError) {
                            log(`Retry failed: ${retryError} for ${uri}`);
                            throw vscode.FileSystemError.NoPermissions(uri);
                        }
                    }
                    throw vscode.FileSystemError.NoPermissions(uri);
                case 403:
                    throw vscode.FileSystemError.NoPermissions(uri);
                case 404:
                    throw vscode.FileSystemError.FileNotFound(uri);
                case 406:
                    // Not Acceptable - server cannot produce content in requested format
                    log(`Server returned 406 Not Acceptable for ${uri} - content negotiation failed`);
                    throw vscode.FileSystemError.Unavailable(uri);
            }
            throw e;
        }
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return await this.forConnection("readDirectory", uri, async webdav => {
            const results = await webdav.getDirectoryContents(toWebDAVPath(uri), { deep: false }) as FileStat[];
            // Some WebDAV providers ignore the deep: false parameter and enumerate the whole tree, hence the filtering
            const contents = results.filter(f => `${uri.path.toLowerCase()}/${f.basename.toLowerCase()}`.replace("//", "/") === f.filename.toLowerCase());
            return contents.map(r => [r.basename, r.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File]);
        });
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return await this.forConnection("readFile", uri, async webdav => {
            const body = await webdav.getFileContents(toWebDAVPath(uri));
            if (typeof body === "string") {
                return new Uint8Array(Buffer.from(body, 'binary'));
            } else if (Buffer.isBuffer(body)) {
                return new Uint8Array(body);
            } else {
                throw Error("Not Implemented");
            }
        });
    }

    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, _options: { overwrite: boolean }): Promise<void> {
        return await this.forConnection("rename", oldUri, async webdav => {
            await webdav.moveFile(toWebDAVPath(oldUri), toWebDAVPath(newUri));
        });
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return await this.forConnection("stat", uri, async webdav => {
            const props = await webdav.stat(toWebDAVPath(uri)) as FileStat;
            const lastmod = parse((props.lastmod ?? "").substring(5), "dd MM y HH:mm:ss", new Date()).getTime(); // Sun, 06 Nov 1994 08:49:37 GMT
            return {
                ctime: lastmod,
                mtime: lastmod,
                size: props.size,
                type: props.type === 'file' ? vscode.FileType.File : vscode.FileType.Directory,
            };
        });
    }

    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return { dispose: () => { } };
    }

    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
        return await this.forConnection("writeFile", uri, async webdav => {
            await this.throwIfWriteFileIsNotAllowed(uri, options);
            await webdav.putFileContents(toWebDAVPath(uri), content, { overwrite: options.overwrite });
        });
    }

    protected async throwIfWriteFileIsNotAllowed(uri: vscode.Uri, options: { create: boolean, overwrite: boolean }) {
        try {
            const stat = await this.stat(uri);
            if (stat.type === vscode.FileType.Directory) {
                throw vscode.FileSystemError.FileIsADirectory(uri);
            }

            if (!options.overwrite) {
                throw vscode.FileSystemError.FileExists(uri);
            }
        } catch {
            if (!options.create) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
        }
    }
}