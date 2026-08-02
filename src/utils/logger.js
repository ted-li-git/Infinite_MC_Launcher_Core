import { createWriteStream, mkdirSync } from 'fs';
import { dirname } from 'path';

export const LogLevel = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

const COLORS = {
    RESET: '\x1b[0m', RED: '\x1b[31m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m', MAGENTA: '\x1b[35m', CYAN: '\x1b[36m', WHITE: '\x1b[37m', GRAY: '\x1b[90m'
};

const LEVEL_COLORS = { ERROR: COLORS.RED, WARN: COLORS.YELLOW, INFO: COLORS.GREEN, DEBUG: COLORS.GRAY };

export class Logger {
    constructor(enableDebug = false) {
        this.enableDebug = enableDebug;
        this.logLevels = LogLevel;
        this.currentLevel = enableDebug ? LogLevel.DEBUG : LogLevel.INFO;
        this.supportsColor = process.stdout?.isTTY ?? false;
        this.colors = { ...COLORS };
        this.listeners = [];
        this.fileStream = null;
    }

    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').replace('Z', '');
    }

    format(level, message, data) {
        let out = `[${this.getTimestamp()}] [${level}] ${message}`;
        // null 和 undefined 都不追加
        if (data != null) {
            try {
                out += `\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
            } catch {
                out += '\n[Non-serializable data]';
            }
        }
        return out;
    }

    colorize(level, message) {
        if (!this.supportsColor) return message;
        const color = LEVEL_COLORS[level] || COLORS.WHITE;
        return `${color}${message}${COLORS.RESET}`;
    }

    _output(level, message, data, consoleFn) {
        if (this.currentLevel < this.logLevels[level]) return;
        const logMessage = this.format(level, message, data);
        consoleFn(this.colorize(level, logMessage));

        const entry = {
            timestamp: new Date().toISOString(),
            level, message,
            data: data ?? undefined,
            pid: process.pid
        };
        for (const listener of this.listeners) {
            try { listener(entry); } catch {}
        }
        if (this.fileStream) this.fileStream.write(logMessage + '\n');
    }

    error(message, error = null) { this._output('ERROR', message, error, console.error); }
    warn(message, data = null) { this._output('WARN', message, data, console.warn); }
    info(message, data = null) { this._output('INFO', message, data, console.log); }
    debug(message, data = null) { this._output('DEBUG', message, data, console.debug); }

    setLevel(level) {
        const upper = level.toUpperCase();
        this.currentLevel = this.logLevels[upper] !== undefined ? this.logLevels[upper] : this.logLevels.INFO;
    }

    enableDebugMode() { this.enableDebug = true; this.currentLevel = this.logLevels.DEBUG; }
    disableDebugMode() { this.enableDebug = false; this.currentLevel = this.logLevels.INFO; }

    onLog(callback) {
        this.listeners.push(callback);
        return () => {
            const i = this.listeners.indexOf(callback);
            if (i > -1) this.listeners.splice(i, 1);
        };
    }

    enableFileLogging(filePath, options = {}) {
        try {
            mkdirSync(dirname(filePath), { recursive: true });
            this.fileStream = createWriteStream(filePath, {
                flags: options.append === false ? 'w' : 'a',
                encoding: 'utf8'
            });
            this.fileStream.on('error', (err) => {
                console.error(`[Logger] File logging error: ${err.message}`);
                this.fileStream = null;
            });
            this.info(`File logging enabled: ${filePath}`);
        } catch (error) {
            this.error('Failed to enable file logging', error);
        }
    }

    disableFileLogging() {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
            this.info('File logging disabled');
        }
    }

    createChild(prefix) {
        const child = new Logger(this.enableDebug);
        child.currentLevel = this.currentLevel;
        child.supportsColor = this.supportsColor;
        child.fileStream = this.fileStream;
        child.listeners = this.listeners;
        for (const method of ['error', 'warn', 'info', 'debug']) {
            const orig = child[method].bind(child);
            child[method] = (message, ...args) => orig(`[${prefix}] ${message}`, ...args);
        }
        return child;
    }

    perf(operation, startTime, metadata = {}) {
        const duration = Date.now() - startTime;
        const message = `${operation} took ${duration}ms`;
        if (duration > 1000) this.warn(message, metadata);
        else if (duration > 100) this.info(message, metadata);
        else this.debug(message, metadata);
    }

    http(method, url, statusCode, duration, metadata = {}) {
        const message = `${method} ${url} ${statusCode} ${duration}ms`;
        if (statusCode >= 500) this.error(message, metadata);
        else if (statusCode >= 400 || duration > 1000) this.warn(message, metadata);
        else this.info(message, metadata);
    }

    auth(username, method, success, metadata = {}) {
        const message = `${method} authentication ${success ? 'success' : 'failure'} for ${username}`;
        success ? this.info(message, metadata) : this.error(message, metadata);
    }

    launch(version, username, success, metadata = {}) {
        const message = `Game launch ${success ? 'started' : 'failed'}: ${version} (${username})`;
        success ? this.info(message, metadata) : this.error(message, metadata);
    }

    captureException(error, context = '') {
        const message = context ? `${context}: ${error.message}` : error.message;
        this.error(message, { name: error.name, stack: error.stack, code: error.code });
        return error;
    }

    getLevelName() {
        const [name] = Object.entries(this.logLevels).find(([, v]) => v === this.currentLevel) || ['INFO'];
        return name;
    }

    getStatus() {
        return {
            level: this.getLevelName(),
            enableDebug: this.enableDebug,
            supportsColor: this.supportsColor,
            fileLogging: !!this.fileStream,
            listeners: this.listeners.length,
            timestamp: this.getTimestamp()
        };
    }
}

let globalLogger = null;

export function getLogger(enableDebug = false) {
    if (!globalLogger) globalLogger = new Logger(enableDebug);
    return globalLogger;
}

export function setLogger(logger) {
    globalLogger = logger;
}

export const log = {
    error: (message, error) => getLogger().error(message, error),
    warn: (message, data) => getLogger().warn(message, data),
    info: (message, data) => getLogger().info(message, data),
    debug: (message, data) => getLogger().debug(message, data)
};

export default Logger;
