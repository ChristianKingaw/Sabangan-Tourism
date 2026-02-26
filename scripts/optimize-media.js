const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");

let ffmpegPath = "";
try {
  ffmpegPath = require("ffmpeg-static") || "";
} catch {
  ffmpegPath = "";
}

const projectRoot = process.cwd();
const imageRoot = path.join(projectRoot, "public", "assets", "images");
const videoRoot = path.join(projectRoot, "public", "assets", "videos");
const manifestPath = path.join(projectRoot, ".media-optimize-cache.json");

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const minSavingsRatio = 0.97;
const maxImageWidth = 1920;

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function walkMediaFiles(rootDir, extensions) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const stack = [rootDir];
  const files = [];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function totalSize(paths) {
  return paths.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
}

function cleanupTemp(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  fs.unlinkSync(filePath);
}

function normalizeRelativePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function hashBuffer(inputBuffer) {
  return crypto.createHash("sha1").update(inputBuffer).digest("hex");
}

function hashFile(filePath) {
  return hashBuffer(fs.readFileSync(filePath));
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  const sortedEntries = Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b));
  const sortedManifest = Object.fromEntries(sortedEntries);
  fs.writeFileSync(manifestPath, `${JSON.stringify(sortedManifest, null, 2)}\n`);
}

async function compressImage(filePath, inputBuffer) {
  const before = inputBuffer.length;
  const ext = path.extname(filePath).toLowerCase();
  const metadata = await sharp(inputBuffer, { failOn: "none" }).metadata();

  let pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();
  if (metadata.width && metadata.width > maxImageWidth) {
    pipeline = pipeline.resize({ width: maxImageWidth, withoutEnlargement: true });
  }

  let buffer;
  if (ext === ".png") {
    buffer = await pipeline.png({ compressionLevel: 9, palette: true, quality: 70 }).toBuffer();
  } else if (ext === ".webp") {
    buffer = await pipeline.webp({ quality: 72 }).toBuffer();
  } else {
    buffer = await pipeline.jpeg({ quality: 72, mozjpeg: true, progressive: true }).toBuffer();
  }

  const after = buffer.length;
  if (after >= Math.floor(before * minSavingsRatio)) {
    return { changed: false, before, after: before };
  }

  fs.writeFileSync(filePath, buffer);
  return { changed: true, before, after };
}

function compressVideo(filePath) {
  const before = fs.statSync(filePath).size;
  const tempPath = `${filePath}.tmp-opt.mp4`;
  cleanupTemp(tempPath);

  const args = [
    "-y",
    "-i",
    filePath,
    "-vf",
    "scale=1280:-2:force_original_aspect_ratio=decrease",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "31",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    tempPath
  ];

  const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(tempPath)) {
    cleanupTemp(tempPath);
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(details || "ffmpeg failed.");
  }

  const after = fs.statSync(tempPath).size;
  if (after >= Math.floor(before * minSavingsRatio)) {
    cleanupTemp(tempPath);
    return { changed: false, before, after: before };
  }

  fs.renameSync(tempPath, filePath);
  return { changed: true, before, after };
}

async function main() {
  const imageFiles = walkMediaFiles(imageRoot, imageExtensions);
  const videoFiles = walkMediaFiles(videoRoot, videoExtensions);
  const existingFiles = new Set([...imageFiles, ...videoFiles].map((filePath) => normalizeRelativePath(filePath)));
  const previousManifest = loadManifest();
  const nextManifest = {};

  if (!imageFiles.length && !videoFiles.length) {
    console.log("No media files found in public/assets.");
    return;
  }

  const beforeBytes = totalSize([...imageFiles, ...videoFiles]);
  let changedFiles = 0;
  let totalSavings = 0;

  for (const filePath of imageFiles) {
    const relativePath = normalizeRelativePath(filePath);
    const currentBuffer = fs.readFileSync(filePath);
    const currentHash = hashBuffer(currentBuffer);
    if (previousManifest[relativePath] === currentHash) {
      nextManifest[relativePath] = currentHash;
      continue;
    }

    try {
      const result = await compressImage(filePath, currentBuffer);
      if (result.changed) {
        changedFiles += 1;
        totalSavings += result.before - result.after;
        console.log(`Image optimized: ${path.relative(projectRoot, filePath)} (${formatBytes(result.before)} -> ${formatBytes(result.after)})`);
      }
      nextManifest[relativePath] = hashFile(filePath);
    } catch (error) {
      console.warn(`Image skipped (${path.relative(projectRoot, filePath)}): ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (videoFiles.length && !ffmpegPath) {
    console.warn("Video compression skipped: install ffmpeg-static dependency.");
  }

  if (videoFiles.length && ffmpegPath) {
    for (const filePath of videoFiles) {
      const relativePath = normalizeRelativePath(filePath);
      const currentHash = hashFile(filePath);
      if (previousManifest[relativePath] === currentHash) {
        nextManifest[relativePath] = currentHash;
        continue;
      }

      try {
        const result = compressVideo(filePath);
        if (result.changed) {
          changedFiles += 1;
          totalSavings += result.before - result.after;
          console.log(`Video optimized: ${path.relative(projectRoot, filePath)} (${formatBytes(result.before)} -> ${formatBytes(result.after)})`);
        }
        nextManifest[relativePath] = hashFile(filePath);
      } catch (error) {
        console.warn(`Video skipped (${path.relative(projectRoot, filePath)}): ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  const afterBytes = totalSize([...imageFiles, ...videoFiles].filter((filePath) => fs.existsSync(filePath)));
  for (const [relativePath, hash] of Object.entries(previousManifest)) {
    if (!nextManifest[relativePath] && existingFiles.has(relativePath)) {
      nextManifest[relativePath] = hash;
    }
  }
  writeManifest(nextManifest);
  console.log(
    `Media optimization complete. Changed ${changedFiles} file(s), saved ${formatBytes(totalSavings)}. Total: ${formatBytes(beforeBytes)} -> ${formatBytes(afterBytes)}.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Media optimization failed.");
  process.exitCode = 1;
});
