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

try {
  moveToStaging(path.join(projectRoot, "app", "admin"), "app-admin");
  moveToStaging(path.join(projectRoot, "app", "api", "admin"), "app-api-admin");
  execSync("firebase deploy --only hosting --force", { stdio: "inherit" });
} finally {
  restoreMoves();
  cleanupStagingRoot();
}
