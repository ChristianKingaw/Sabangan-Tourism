export async function withTimeout(task, timeoutMs, label = "Operation") {
  const parsedTimeout = Number(timeoutMs);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return task();
  }

  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${parsedTimeout}ms.`));
    }, parsedTimeout);
  });

  try {
    return await Promise.race([Promise.resolve().then(task), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
