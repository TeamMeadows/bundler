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
exports.distDir = void 0;
const core = __importStar(require("@actions/core"));
const bundlers_1 = require("./bundlers");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cwd = process.cwd();
const name = core.getInput("name") || 'test';
const type = core.getInput("type") || 'addon';
exports.distDir = path_1.default.join(process.cwd(), "dist", name, "lua");
fs_1.default.mkdirSync(exports.distDir, { recursive: true });
async function main() {
    let bundler;
    switch (type) {
        case "addon":
            bundler = new bundlers_1.AddonBundler(cwd, name);
            break;
        case "package":
            bundler = new bundlers_1.PackageBuilder(path_1.default.join(cwd, "examples", "banking"), name);
            break;
        default:
            throw new Error(`invalid project type '${type}'`);
    }
    core.info(`bundling ${type} "${name}"`);
    const startTime = performance.now();
    await bundler.bundle();
    core.info(`bundling took ${(performance.now() - startTime).toFixed(2)}ms`);
}
main().catch(err => core.setFailed(err.message));
