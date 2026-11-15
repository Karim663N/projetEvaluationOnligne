const uploadedImagePath = /^\/api\/uploads\/images\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/i;

export function isUploadedImagePath(value: unknown): value is string {
  return typeof value === "string" && uploadedImagePath.test(value);
}
