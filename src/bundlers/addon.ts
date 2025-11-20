import * as core from "@actions/core";
import * as fsSync from "fs";
import * as fs from "fs/promises";
import path from "path";
import { BlockWriter, Minifier, type Bundler } from ".";
import { distDir, type AddonSide } from "..";

const smallSideName: Record<Exclude<AddonSide, "shared">, string> = {
  "client": "cl",
  "server": "sv"
};

export class AddonBundler implements Bundler {
  baseDir: string;
  name: string;

  constructor(baseDir: string, name: string) {
    this.baseDir = path.join(baseDir, "lua", "autorun");
    this.name = name;
  }

  public async bundle() {
    await this.handleFolder("client");
    await this.handleFolder("server");
    await this.handleFolder();
  }

  private async handleFolder(side?: AddonSide) {
    const cwd = side ? path.join(this.baseDir, side) : this.baseDir;

    try {
      const stat = await fs.stat(cwd);

      if (stat.isDirectory())
        await this.bundleFolder(cwd, side || "shared");
    } catch (_) {
      return;
    }
  }

  private async bundleFolder(cwd: string, side: AddonSide) {
    const items = await fs.readdir(cwd, { withFileTypes: true });
    const files = items.filter(i => i.isFile()).map(i => i.name);

    if (files.length === 0)
      return;

    const dist = path.join(distDir, "autorun");
    await fs.mkdir(dist, { recursive: true });

    const outputFileName = side == "shared" ? `autorun_${this.name}.lua` : `${side}/autorun_${smallSideName[side]}_${this.name}.lua`;
    const outputFile = path.join(dist, outputFileName);
    const stream = fsSync.createWriteStream(outputFile, { encoding: "utf8" });
    const writer = new BlockWriter();

    // merging all files together
    for (const file of files) {
      const filePath = path.join(cwd, file);

      await writer.writeBlock(filePath, stream);

      core.info(`merged '${filePath}' into '${outputFileName}'`);
    }

    // minifiying result
    const minifier = new Minifier(outputFile);
    await minifier.minify();
  }
}