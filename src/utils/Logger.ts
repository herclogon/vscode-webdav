import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor(channelName: string = 'WebDAV Sync') {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
    }

    private formatMessage(level: string, syncName: string | undefined, message: string): string {
        const timestamp = new Date().toLocaleTimeString();
        if (syncName) {
            return `[${timestamp}] [${syncName}] ${level}: ${message}`;
        }
        return `[${timestamp}] ${level}: ${message}`;
    }

    public info(message: string, syncName?: string): void {
        this.outputChannel.appendLine(this.formatMessage('INFO', syncName, message));
    }

    public warn(message: string, syncName?: string): void {
        this.outputChannel.appendLine(this.formatMessage('WARN', syncName, message));
    }

    public error(message: string, syncName?: string): void {
        this.outputChannel.appendLine(this.formatMessage('ERROR', syncName, message));
    }

    public success(message: string, syncName?: string): void {
        this.outputChannel.appendLine(this.formatMessage('✓', syncName, message));
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}
