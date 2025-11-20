import * as core from "@actions/core";
import path from "path";
import fs from 'fs';
import fsp from 'fs/promises';
import { parse, type Chunk } from 'luaparse';
import { BlockWriter, Minifier, type Bundler } from ".";
import { distDir, type AddonSide } from "..";

export class PackageBuilder implements Bundler {
  baseDir: string;
  name: string;

  constructor(baseDir: string, name: string) {
    this.baseDir = path.join(baseDir, "lua", "atomic", "packages", name);
    this.name = name;
  }

  public async bundle() {
    const metadata = new PackageMetadata(path.join(this.baseDir, "package.lua"));
    await metadata.load();

    const files = metadata.getFiles();

    const dist = path.join(distDir, "atomic", "packages", this.name);

    await fsp.mkdir(dist, { recursive: true });

    await this.handleFile(dist, "client", files.client);
    await this.handleFile(dist, "shared", files.shared);
    await this.handleFile(dist, "server", files.server);

    await this.saveMetadata(metadata, dist, files);
  }

  private async handleFile(distDir: string, side: AddonSide, files?: string[]) {
    if (files)
      await this.bundleFile(distDir, side, files);
  }

  private async bundleFile(distDir: string, side: AddonSide, files: string[]) {
    const outputFileName = `${side}.lua`;
    const outputFile = path.join(distDir, outputFileName);
    const stream = fs.createWriteStream(outputFile, { encoding: "utf8" });

    // write files to stream
    const writer = new BlockWriter();
    for (const file of files) {
      const filePath = path.join(this.baseDir, file);

      await writer.writeBlock(filePath, stream);

      core.info(`merged '${filePath}' into '${outputFileName}'`);
    }

    // minifiying result
    const minifier = new Minifier(outputFile);
    await minifier.minify();
  };

  private async saveMetadata(metadata: PackageMetadata, distDir: string, files: Record<AddonSide, string[]>) {
    Object.keys(files)
      .forEach(side => metadata.setFiles(side as AddonSide, [`${side}.lua`]));

    await metadata.saveToFile(path.join(distDir, "package.lua"));
  }
}

// todo refactor
class PackageMetadata {
  private path: string;
  private ast?: Chunk;
  //@ts-ignore shut up
  private metadataTree: Record<AddonSide, string[]> = {};

  constructor(path: string) {
    this.path = path;
  }

  public async load() {
    const content = await fsp.readFile(this.path, 'utf-8');
    this.ast = parse(content, { comments: false, locations: false, scope: true });
    this.buildTree();
  }

  private buildTree() {
    const unquote = (str: string) => str.replace(/^"(.*)"$/, '$1');

    const extractSection = (node: any) => {
      if (node.type !== 'TableConstructorExpression') return [];
      const arr: string[] = [];
      for (const v of node.fields) {
        if (v.type === 'TableValue' && v.value.type === 'StringLiteral') {
          arr.push(unquote(v.value.raw));
        }
      }
      return arr;
    };

    const traverse = (node: any) => {
      if (!node || node.type !== 'TableConstructorExpression') return;
      for (const field of node.fields) {
        if (field.type === 'TableKeyString' && field.key.name === 'files') {
          const filesNode = field.value;
          if (filesNode.type === 'TableConstructorExpression') {
            for (const sectionField of filesNode.fields) {
              if (sectionField.type === 'TableKeyString') {
                const sectionName = field.key.name as AddonSide;
                const name = sectionField.key.name as AddonSide;
                if (['client', 'server', 'shared'].includes(name)) {
                  this.metadataTree[name] = extractSection(sectionField.value);
                }
              }
            }
          }
        } else if (field.value.type === 'TableConstructorExpression') {
          traverse(field.value);
        }
      }
    };

    for (const stat of this.ast!.body) {
      if (stat.type === 'ReturnStatement') {
        for (const arg of stat.arguments) {
          traverse(arg);
        }
      }
    }
  }

  public getFiles(): Record<AddonSide, string[]> {
    return this.metadataTree;
  }

  public setFiles(section: AddonSide, files: string[]) {
    this.metadataTree[section] = files;
  }

  public async saveToFile(outputFile: string) {
    const content = await fsp.readFile(this.path, 'utf-8');

    let newContent = content.replace(
      /(\b(client|server|shared)\s*=\s*\{)([\s\S]*?)(\})/g,
      (_, start, section) => {
        const arr = this.metadataTree[section as AddonSide] || [];
        return `${start} ${arr.map(s => `"${s}"`).join(', ')} }`;
      }
    );

    await fsp.writeFile(outputFile, newContent, 'utf-8');
  }
}