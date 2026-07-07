// what a shit code

import * as core from "@actions/core";
import * as github from "@actions/github";
import { AddonBundler, Minifier, PackageBuilder, type Bundler } from "./bundlers";
import path from "path";
import fs from "fs";
import fsp from 'fs/promises';

export type ProjectType = "package" | "addon";
export type AddonSide = "client" | "shared" | "server";

const cwd = process.cwd();
const name = core.getInput("name");
const type = core.getInput("type") as ProjectType;
export const distBaseDir = path.join(process.cwd(), "dist", name);
const inputBaseDir = core.getMultilineInput("basedir");
export const baseDir = inputBaseDir.length == 0 ? ["lua", "autorun"] : inputBaseDir;
export const distDir = path.join(distBaseDir, ...baseDir);

fs.mkdirSync(distDir, { recursive: true });

const filesToCopy = ["LICENSE", "LICENSE.md", "README", "README.md"]

export async function fileExists(path: string) {
	try {
		await fsp.stat(path)
		return true
	} catch {
		return false
	}
}

async function main() {
  let bundler: Bundler;

  switch (type) {
    case "addon":
      // let version = github.context.ref.startsWith("/refs/tags/") ? github.context.ref.replace("/refs/tags/", "") : "release";
      // bundler = new AddonBundler(cwd, name, version); -- todo uncomment
      bundler = new AddonBundler(cwd, name, "1.0.0-rc.4+build-menu");
      break;
    case "package":
      bundler = new PackageBuilder(cwd, name);
      break;
    default:
      throw new Error(`invalid project type '${type}'`);
  }

  core.info(`bundling ${type} "${name}"`);

  const startTime = performance.now();
  await bundler.bundle();

  for (const file of filesToCopy) {
		try {
			await fsp.access(file)
			await fsp.copyFile(file, path.join(distBaseDir, file))
		} catch {}
	}

  core.info(`bundling took ${(performance.now() - startTime - Minifier.getTimeoutMs()).toFixed(2)}ms`);
}

main().catch(err => core.setFailed(err.message));