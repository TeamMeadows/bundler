import * as core from "@actions/core";
import { AddonBundler, PackageBuilder, type Bundler } from "./bundlers";
import path from "path";
import fs from "fs";

export type ProjectType = "package" | "addon";
export type AddonSide = "client" | "shared" | "server";

const cwd = process.cwd();
const name = core.getInput("name");
const type = core.getInput("type") as ProjectType;
export const distDir = path.join(process.cwd(), "dist", name, "lua");

fs.mkdirSync(distDir, { recursive: true });

async function main() {
  let bundler: Bundler;

  switch (type) {
    case "addon":
      bundler = new AddonBundler(cwd, name);
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
  core.info(`bundling took ${(performance.now() - startTime).toFixed(2)}ms`);
}

main().catch(err => core.setFailed(err.message));