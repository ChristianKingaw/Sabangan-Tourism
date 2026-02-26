const MB = 1024 * 1024;

export const PAYMENT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

export const PAYMENT_MAX_FILE_BYTES = 6 * MB;
const PAYMENT_IMAGE_TARGET_BYTES = Math.round(1.25 * MB);
const PAYMENT_IMAGE_MAX_DIMENSION = 1920;

function inferMimeTypeFromFilename(filename) {
  const value = String(filename || "").toLowerCase();
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (value.endsWith(".png")) {
    return "image/png";
  }
  if (value.endsWith(".webp")) {
    return "image/webp";
  }
  if (value.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "";
}

function replaceFileExtension(filename, extension) {
  const index = filename.lastIndexOf(".");
  if (index <= 0) {
    return `${filename}${extension}`;
  }
  return `${filename.slice(0, index)}${extension}`;
}

function toDisplaySize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < MB) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / MB).toFixed(2)} MB`;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Unable to compress image."));
      },
      "image/jpeg",
      quality
    );
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Invalid image file."));
    };
    image.src = objectUrl;
  });
}

async function compressImage(file) {
  const image = await loadImage(file);
  const width = Number(image.width) || 0;
  const height = Number(image.height) || 0;
  if (!width || !height) {
    throw new Error("Invalid image dimensions.");
  }

  const ratio = Math.min(1, PAYMENT_IMAGE_MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to process selected image.");
  }

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  // Lower quality step-by-step until the image reaches target upload size.
  const qualitySteps = [0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46];
  let compressedBlob = null;

  for (const quality of qualitySteps) {
    const candidate = await canvasToBlob(canvas, quality);
    compressedBlob = candidate;
    if (candidate.size <= PAYMENT_IMAGE_TARGET_BYTES) {
      break;
    }
  }

  if (!compressedBlob) {
    throw new Error("Unable to compress selected image.");
  }

  if (compressedBlob.size >= file.size) {
    return file;
  }

  return new File([compressedBlob], replaceFileExtension(file.name || "payment-proof", ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

export async function compressPaymentFile(file) {
  if (!file) {
    throw new Error("Upload proof_of_payment file.");
  }

  let type = String(file.type || "").toLowerCase();
  if (!type) {
    type = inferMimeTypeFromFilename(file.name);
  }
  if (!PAYMENT_ALLOWED_MIME_TYPES.has(type)) {
    throw new Error("Only JPG, PNG, WEBP, or PDF files are allowed.");
  }

  const originalSize = file.size || 0;
  let nextFile = file;

  if (type.startsWith("image/")) {
    nextFile = await compressImage(file);
  }

  if (!nextFile.size) {
    throw new Error("Upload proof_of_payment file.");
  }

  if (nextFile.size > PAYMENT_MAX_FILE_BYTES) {
    throw new Error(
      `File is too large after compression (${toDisplaySize(nextFile.size)}). Max allowed is ${toDisplaySize(PAYMENT_MAX_FILE_BYTES)}.`
    );
  }

  return {
    file: nextFile,
    originalSize,
    finalSize: nextFile.size,
    wasCompressed: nextFile !== file
  };
}

export function formatBytes(bytes) {
  return toDisplaySize(bytes);
}
