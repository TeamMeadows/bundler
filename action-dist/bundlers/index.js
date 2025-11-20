"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncludeDirectiveHandler = exports.BlockWriter = exports.Minifier = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const fsp = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const luamin_1 = require("luamin");
__exportStar(require("./addon"), exports);
__exportStar(require("./package"), exports);
const cwd = process.cwd();
;
class Minifier {
    constructor(path) {
        this.path = path;
    }
    async minify() {
        core.info(`minifying file "${this.path}"`);
        const iconv = require("iconv-lite");
        const buffer = await fsp.readFile(this.path);
        let content = iconv.decode(buffer, "utf8"); // безопасно декодирует даже битые символы
        console.log("Content length:", content.length);
        content = Minifier.escapeOperators(content);
        let minified = (await (0, luamin_1.minify)(content)) || "";
        minified = Minifier.restoreOperators(minified);
        const originalSize = Buffer.byteLength(content, "utf8");
        const minifiedSize = Buffer.byteLength(minified, "utf8");
        const compression = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
        const formatSize = (bytes) => bytes > 1024 * 1024
            ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
            : `${(bytes / 1024).toFixed(0)} KB`;
        core.info(`minification completed: compressed ${compression}% (${formatSize(originalSize)} → ${formatSize(minifiedSize)})`);
        await fsp.writeFile(this.path, minified, "utf8");
        core.info(`minified code written back to "${this.path}"`);
    }
    static escapeOperators(code) {
        const strings = [];
        code = code.replace(/\[\[[\s\S]*?\]\]|(["'])(?:\\.|(?!\1).)*\1/g, m => {
            const idx = strings.push(m) - 1;
            return `__STR${idx}__`;
        });
        code = code
            .replace(/\bcontinue\b/g, 'return "__internal__continue__"')
            .replace(/\|\|/g, "or")
            .replace(/&&/g, "and")
            .replace(/!=/g, "~=")
            .replace(/!\s*(\(?[^\s)]+)/g, "not $1");
        return code.replace(/__STR(\d+)__/g, (_, i) => strings[Number(i)]);
    }
    static restoreOperators(code) {
        return code.replace(/return\s*"__internal__continue__"/g, "continue "); // space in the end is REQUIRED after minification
    }
}
exports.Minifier = Minifier;
class BlockWriter {
    constructor(includeHandler) {
        this.includeHandler = includeHandler || new IncludeDirectiveHandler();
    }
    async writeBlock(filePath, output) {
        await this.includeHandler.processLines(filePath, fs.createReadStream(filePath, { encoding: "utf8" }), output, () => output.write("do\n"), () => output.write("end\n"));
    }
}
exports.BlockWriter = BlockWriter;
class IncludeDirectiveHandler {
    constructor() {
        this.blockWriter = new BlockWriter(this);
    }
    async processFile(inputPath, outputPath) {
        const input = fs.createReadStream(inputPath, { encoding: "utf8" });
        const output = fs.createWriteStream(outputPath, { encoding: "utf8" });
        await this.processLines(inputPath, input, output);
        output.end();
    }
    async processLines(inputPath, input, output, beforeWrite, afterWrite) {
        if (beforeWrite)
            beforeWrite();
        const rl = readline.createInterface({ input, crlfDelay: Infinity });
        let includeMode = false;
        for await (const line of rl) {
            const trimmed = line.trim();
            if (trimmed.startsWith("---@include")) {
                includeMode = true;
                continue;
            }
            if (includeMode) {
                if (trimmed === "") {
                    includeMode = false;
                    continue;
                }
                const match = trimmed.match(/\w+\("([^"]+)"\)/);
                if (match) {
                    const parentDir = path.basename(path.dirname(inputPath));
                    const includeFile = path.resolve(path.dirname(inputPath), parentDir == "autorun" ? ".." : "", match[1]);
                    core.info(`merged ${path.relative(cwd, includeFile)}`);
                    await this.insertInclude(includeFile, output);
                }
                continue;
            }
            output.write(line + "\n");
        }
        if (afterWrite)
            afterWrite();
    }
    async insertInclude(includeFile, output) {
        await this.blockWriter.writeBlock(includeFile, output);
    }
}
exports.IncludeDirectiveHandler = IncludeDirectiveHandler;
