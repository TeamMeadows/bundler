// what a mess
// fuck

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
    let { version, dir } = await metadata.load();

    const files = metadata.getFiles();
    let metadataDist = path.join(distDir, "atomic", "packages", `${this.name}@${version}`);
    let filesDist = metadataDist;

    if (dir)
      filesDist = path.join(metadataDist, dir);

    await fsp.mkdir(filesDist, { recursive: true });

    await this.handleFile(filesDist, "client", files.client);
    await this.handleFile(filesDist, "shared", files.shared);
    await this.handleFile(filesDist, "server", files.server);

    await this.saveMetadata(metadata, metadataDist, files);
  }

  private async handleFile(distDir: string, side: AddonSide, files?: string[]) {
    if (files)
      await this.bundleFile(distDir, side, files);
  }

  private async bundleFile(distDir: string, side: AddonSide, files: string[]) {
    if (files.length === 0)
      return;

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

    core.info(`merging completed`);

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
  private dir?: string;
  private metadataTree: Record<AddonSide, string[]> = { client: [], shared: [], server: [] };

  constructor(path: string) {
    this.path = path;
  }

  public async load(): Promise<{ version: string, dir?: string }> {
    const content = await fsp.readFile(this.path, 'utf-8');
    this.ast = parse(content, { comments: false, locations: false, scope: true });
    return this.buildTree();
  }

  private buildTree(): { version: string, dir?: string } {
    let version: string = "release";

    const traverse = (node: any) => {
      if (!node || node.type !== 'TableConstructorExpression') return;

      let filesNode: any;

      for (const field of node.fields) {
        if (field.type !== 'TableKeyString') continue;

        if (field.key.name === 'files' && field.value.type === 'TableConstructorExpression')
          filesNode = field.value;

        if (version === "release" && field.key.name === "version" && field.value.type === 'StringLiteral')
          version = field.value.raw.replace(/^"(.*)"$/, '$1');
      }

      if (!filesNode) return;

      for (const sectionField of filesNode.fields) {
        if (sectionField.type !== 'TableKeyString') continue;

        const name = sectionField.key.name as AddonSide | "dir";

        if (name === 'dir' && sectionField.value.type === 'StringLiteral') {
          this.dir = sectionField.value.raw.replace(/^"(.*)"$/, '$1');
          continue;
        }

        if (!['client', 'server', 'shared'].includes(name)) continue;

        const arr: string[] = [];

        if (sectionField.value.type === 'TableConstructorExpression') {
          for (const v of sectionField.value.fields) {
            if (v.type === 'TableValue' && v.value.type === 'StringLiteral') {
              arr.push(v.value.raw.replace(/^"(.*)"$/, '$1'));
            }
          }
        }

        this.metadataTree[name as AddonSide] = arr;
      }
    };

    for (const stat of this.ast!.body) {
      if (stat.type === 'ReturnStatement') {
        for (const arg of stat.arguments) {
          traverse(arg);
        }
      }
    }

    return { version, dir: this.dir }
  }

  public getFiles(): Record<AddonSide, string[]> {
    const result: Record<AddonSide, string[]> = {
      client: [],
      server: [],
      shared: []
    };

    const normalize = (file: string) => {
      let f = file;

      if (!f.endsWith('.lua')) {
        f += '.lua';
      }

      if (this.dir) {
        f = path.posix.join(this.dir, f);
      }

      return f;
    };

    for (const side of ['client', 'server', 'shared'] as AddonSide[]) {
      const files = this.metadataTree[side] || [];
      result[side] = files.map(normalize);
    }

    return result;
  }

  public setFiles(section: AddonSide, files: string[]) {
    this.metadataTree[section] = files;
  }

  public async saveToFile(outputFile: string) {
    const content = await fsp.readFile(this.path, 'utf-8');
    const ast = parse(content, { comments: true, scope: true, locations: false });

    const updateFilesTable = (node: any) => {
      if (!node || node.type !== 'TableConstructorExpression') return;

      for (const field of node.fields) {
        if (field.type !== 'TableKeyString') continue;

        if (field.key.name !== 'files') continue;
        if (field.value.type !== 'TableConstructorExpression') continue;

        for (const section of field.value.fields) {
          if (section.type !== 'TableKeyString') continue;

          const name = section.key.name as AddonSide;
          if (!['client', 'server', 'shared'].includes(name)) continue;

          const arr = this.metadataTree[name] || [];

          section.value = {
            type: 'TableConstructorExpression',
            fields: arr.map(v => ({
              type: 'TableValue',
              value: {
                type: 'StringLiteral',
                raw: `"${v}"`
              }
            }))
          };
        }
      }
    };

    for (const node of ast.body) {
      if (node.type === 'ReturnStatement') {
        for (const arg of node.arguments) {
          updateFilesTable(arg);
        }
      }
    }

    const generate = (node: any): string => {
      switch (node.type) {
        case 'Chunk':
          return node.body.map(generate).join('\n');

        case 'ReturnStatement':
          return `return ${node.arguments.map(generate).join(', ')}`;

        case 'TableConstructorExpression':
          return `{ ${node.fields.map(generate).join(', ')} }`;

        case 'TableKeyString':
          return `${node.key.name} = ${generate(node.value)}`;

        case 'TableValue':
          return generate(node.value);

        case 'StringLiteral':
          return node.raw;

        default:
          return '';
      }
    };

    const result = generate(ast);

    await fsp.writeFile(outputFile, result, 'utf-8');
  }
}