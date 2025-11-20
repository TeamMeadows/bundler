import * as core from "@actions/core";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { minify } from "luamin";

export * from "./addon";
export * from "./package";

const cwd = process.cwd();

// basic "trait"
export interface Bundler {
  baseDir: string,
  name: string,
  bundle: () => Promise<void>;
};

export class Minifier {
  constructor(private path: string) { }

  public async minify() {
    core.info(`minifying file "${this.path}"`);

    // we use iconv-lite because of nodejs IS =FUCKING SHIT=
    const iconv = require("iconv-lite");
    const buffer = await fsp.readFile(this.path);
    // why would i fucking decode my file through some fucking library
    // when i can just read file without FUCKING TROUBLES like in bunjs???? because node js is fucking old piece of shit
    // creators of nodejs, this message for you: please Keep Yourself Safe
    let content = iconv.decode(buffer, "utf8");
    content = Minifier.escapeOperators(content);

    let minified = (await minify(content)) || "";
    minified = Minifier.restoreOperators(minified);

    const originalSize = Buffer.byteLength(content, "utf8");
    const minifiedSize = Buffer.byteLength(minified, "utf8");
    const compression = ((1 - minifiedSize / originalSize) * 100).toFixed(2);

    const formatSize = (bytes: number) =>
      bytes > 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(bytes / 1024).toFixed(0)} KB`;

    core.info(
      `minification completed: compressed ${compression}% (${formatSize(
        originalSize
      )} → ${formatSize(minifiedSize)})`
    );

    await fsp.writeFile(this.path, minified, "utf8");
    core.info(`minified code written back to "${this.path}"`);
  }

  private static escapeOperators(code: string): string {
    const strings: string[] = [];

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

  private static restoreOperators(code: string): string {
    return code.replace(/return\s*"__internal__continue__"/g, "continue "); // space in the end is REQUIRED after minification
  }
}

export class BlockWriter {
  private includeHandler: IncludeDirectiveHandler;

  constructor(includeHandler?: IncludeDirectiveHandler) {
    this.includeHandler = includeHandler || new IncludeDirectiveHandler();
  }

  async writeBlock(filePath: string, output: fs.WriteStream) {
    await this.includeHandler.processLines(
      filePath,
      fs.createReadStream(filePath, { encoding: "utf8" }),
      output,
      () => output.write("do\n"),
      () => output.write("end\n")
    );
  }
}

export class IncludeDirectiveHandler {
  private blockWriter: BlockWriter;

  constructor() {
    this.blockWriter = new BlockWriter(this);
  }

  async processFile(inputPath: string, outputPath: string) {
    const input = fs.createReadStream(inputPath, { encoding: "utf8" });
    const output = fs.createWriteStream(outputPath, { encoding: "utf8" });

    await this.processLines(inputPath, input, output);
    output.end();
  }

  async processLines(
    inputPath: string,
    input: fs.ReadStream,
    output: fs.WriteStream,
    beforeWrite?: () => void,
    afterWrite?: () => void
  ) {
    if (beforeWrite) beforeWrite();

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
          const parentDir: "autorun" | string = path.basename(path.dirname(inputPath));
          const includeFile = path.resolve(path.dirname(inputPath), parentDir == "autorun" ? ".." : "", match[1]);
          core.info(`merged ${path.relative(cwd, includeFile)}`);

          await this.insertInclude(includeFile, output);
        }
        continue;
      }

      output.write(line + "\n");
    }

    if (afterWrite) afterWrite();
  }

  async insertInclude(includeFile: string, output: fs.WriteStream) {
    await this.blockWriter.writeBlock(includeFile, output);
  }
}