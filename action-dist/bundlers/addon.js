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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddonBundler = void 0;
const core = __importStar(require("@actions/core"));
const fsSync = __importStar(require("fs"));
const fs = __importStar(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const _1 = require(".");
const __1 = require("..");
const smallSideName = {
    "client": "cl",
    "server": "sv"
};
class AddonBundler {
    constructor(baseDir, name) {
        this.baseDir = path_1.default.join(baseDir, "lua", "autorun");
        this.name = name;
    }
    async bundle() {
        await this.handleFolder("client");
        await this.handleFolder("server");
        await this.handleFolder();
    }
    async handleFolder(side) {
        const cwd = side ? path_1.default.join(this.baseDir, side) : this.baseDir;
        try {
            const stat = await fs.stat(cwd);
            if (stat.isDirectory())
                await this.bundleFolder(cwd, side || "shared");
        }
        catch (_) {
            return;
        }
    }
    async bundleFolder(cwd, side) {
        const items = await fs.readdir(cwd, { withFileTypes: true });
        const files = items.filter(i => i.isFile()).map(i => i.name);
        if (files.length === 0)
            return;
        const dist = path_1.default.join(__1.distDir, "autorun");
        await fs.mkdir(dist, { recursive: true });
        const outputFileName = side == "shared" ? `autorun_${this.name}.lua` : `${side}/autorun_${smallSideName[side]}_${this.name}.lua`;
        const outputFile = path_1.default.join(dist, outputFileName);
        const stream = fsSync.createWriteStream(outputFile, { encoding: "utf8" });
        const writer = new _1.BlockWriter();
        // merging all files together
        for (const file of files) {
            const filePath = path_1.default.join(cwd, file);
            await writer.writeBlock(filePath, stream);
            core.info(`merged '${filePath}' into '${outputFileName}'`);
        }
        // minifiying result
        const minifier = new _1.Minifier(outputFile);
        await minifier.minify();
    }
}
exports.AddonBundler = AddonBundler;
