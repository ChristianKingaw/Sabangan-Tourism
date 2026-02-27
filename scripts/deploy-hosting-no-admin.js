const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const projectRoot = process.cwd();
const stagingRoot = path.join(projectRoot, ".tmp_no_admin_deploy");
const moved = [];

function moveToStaging(sourcePath, stagingName) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  fs.mkdirSync(stagingRoot, { recursive: true });
  const destinationPath = path.join(stagingRoot, stagingName);
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Cannot move '${sourcePath}' because '${destinationPath}' already exists.`);
  }

  fs.renameSync(sourcePath, destinationPath);
  moved.push({ sourcePath, destinationPath });
  return true;
}

function restoreMoves() {
  for (let index = moved.length - 1; index >= 0; index -= 1) {
    const { sourcePath, destinationPath } = moved[index];
    if (fs.existsSync(destinationPath) && !fs.existsSync(sourcePath)) {
      fs.renameSync(destinationPath, sourcePath);
    }
  }
}

function cleanupStagingRoot() {
  if (!fs.existsSync(stagingRoot)) {
    return;
  }

  if (fs.readdirSync(stagingRoot).length === 0) {
    fs.rmdirSync(stagingRoot);
  }
}

function hasDynamicExtensions(builds) {
  return Object.values(builds || {}).some((build) => {
    const extensions = build && build.extensions;
    if (!extensions) {
      return false;
    }
    if (Array.isArray(extensions)) {
      return extensions.length > 0;
    }
    if (typeof extensions === "object") {
      return Object.keys(extensions).length > 0;
    }
    return true;
  });
}

function resolveGlobalFirebaseToolsRoot() {
  const globalNodeModules = execSync("npm root -g", { encoding: "utf8" }).trim();
  const firebaseToolsRoot = path.join(globalNodeModules, "firebase-tools");
  if (!fs.existsSync(firebaseToolsRoot)) {
    throw new Error(
      `Could not find firebase-tools at '${firebaseToolsRoot}'. Install firebase-tools globally and try again.`,
    );
  }
  return firebaseToolsRoot;
}

async function deployHostingWithPatchedDynamicExtensionCheck() {
  const firebaseToolsRoot = resolveGlobalFirebaseToolsRoot();
  const firebaseTools = require(firebaseToolsRoot);
  const extensionsPrepare = require(path.join(
    firebaseToolsRoot,
    "lib",
    "deploy",
    "extensions",
    "prepare.js",
  ));

  const originalPrepareDynamicExtensions = extensionsPrepare.prepareDynamicExtensions;
  extensionsPrepare.prepareDynamicExtensions = async (context, options, payload, builds) => {
    if (!hasDynamicExtensions(builds)) {
      console.log("i  extensions: skipping dynamic extension checks (none detected)");
      return;
    }
    return originalPrepareDynamicExtensions(context, options, payload, builds);
  };

  const deployOptions = {
    only: "hosting",
    force: true,
    nonInteractive: true,
  };

  if (process.env.FIREBASE_DEPLOY_DRY_RUN === "1") {
    deployOptions.dryRun = true;
  }

  try {
    await firebaseTools.deploy(deployOptions);
  } finally {
    extensionsPrepare.prepareDynamicExtensions = originalPrepareDynamicExtensions;
  }
}

async function main() {
  try {
    moveToStaging(path.join(projectRoot, "app", "admin"), "app-admin");
    moveToStaging(path.join(projectRoot, "app", "api", "admin"), "app-api-admin");
    await deployHostingWithPatchedDynamicExtensionCheck();
  } finally {
    restoreMoves();
    cleanupStagingRoot();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
