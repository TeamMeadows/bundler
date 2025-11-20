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
exports.PackageBuilder = void 0;
const core = __importStar(require("@actions/core"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const luaparse_1 = require("luaparse");
const _1 = require(".");
const __1 = require("..");
class PackageBuilder {
    constructor(baseDir, name) {
        this.baseDir = baseDir;
        this.name = name;
    }
    async bundle() {
        const metadata = new PackageMetadata(path_1.default.join(this.baseDir, "package.lua"));
        await metadata.load();
        const files = metadata.getFiles();
        await this.handleFile(__1.distDir, "client", files.client);
        await this.handleFile(__1.distDir, "shared", files.shared);
        await this.handleFile(__1.distDir, "server", files.server);
        await this.saveMetadata(metadata, __1.distDir, files);
    }
    async handleFile(distDir, side, files) {
        if (files)
            await this.bundleFile(distDir, side, files);
    }
    async bundleFile(distDir, side, files) {
        const outputFileName = `${side}.lua`;
        const outputFile = path_1.default.join(distDir, outputFileName);
        const stream = fs_1.default.createWriteStream(outputFile, { encoding: "utf8" });
        // write files to stream
        const writer = new _1.BlockWriter();
        for (const file of files) {
            const filePath = path_1.default.join(this.baseDir, file);
            await writer.writeBlock(filePath, stream);
            core.info(`merged '${filePath}' into '${outputFileName}'`);
        }
        // minifiying result
        const minifier = new _1.Minifier(outputFile);
        await minifier.minify();
    }
    ;
    async saveMetadata(metadata, distDir, files) {
        Object.keys(files)
            .forEach(side => metadata.setFiles(side, [`${side}.lua`]));
        await metadata.saveToFile(path_1.default.join(distDir, "package.lua"));
    }
}
exports.PackageBuilder = PackageBuilder;
// todo refactor
class PackageMetadata {
    constructor(path) {
        //@ts-ignore shut up
        this.metadataTree = {};
        this.path = path;
    }
    async load() {
        const content = await promises_1.default.readFile(this.path, 'utf-8');
        this.ast = (0, luaparse_1.parse)(content, { comments: false, locations: false, scope: true });
        this.buildTree();
    }
    buildTree() {
        const unquote = (str) => str.replace(/^"(.*)"$/, '$1');
        const extractSection = (node) => {
            if (node.type !== 'TableConstructorExpression')
                return [];
            const arr = [];
            for (const v of node.fields) {
                if (v.type === 'TableValue' && v.value.type === 'StringLiteral') {
                    arr.push(unquote(v.value.raw));
                }
            }
            return arr;
        };
        const traverse = (node) => {
            if (!node || node.type !== 'TableConstructorExpression')
                return;
            for (const field of node.fields) {
                if (field.type === 'TableKeyString' && field.key.name === 'files') {
                    const filesNode = field.value;
                    if (filesNode.type === 'TableConstructorExpression') {
                        for (const sectionField of filesNode.fields) {
                            if (sectionField.type === 'TableKeyString') {
                                const sectionName = field.key.name;
                                const name = sectionField.key.name;
                                if (['client', 'server', 'shared'].includes(name)) {
                                    this.metadataTree[name] = extractSection(sectionField.value);
                                }
                            }
                        }
                    }
                }
                else if (field.value.type === 'TableConstructorExpression') {
                    traverse(field.value);
                }
            }
        };
        for (const stat of this.ast.body) {
            if (stat.type === 'ReturnStatement') {
                for (const arg of stat.arguments) {
                    traverse(arg);
                }
            }
        }
    }
    getFiles() {
        return this.metadataTree;
    }
    setFiles(section, files) {
        this.metadataTree[section] = files;
    }
    async saveToFile(outputFile) {
        const content = await promises_1.default.readFile(this.path, 'utf-8');
        let newContent = content.replace(/(\b(client|server|shared)\s*=\s*\{)([\s\S]*?)(\})/g, (_, start, section) => {
            const arr = this.metadataTree[section] || [];
            return `${start} ${arr.map(s => `"${s}"`).join(', ')} }`;
        });
        await promises_1.default.writeFile(outputFile, newContent, 'utf-8');
    }
}
