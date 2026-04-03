/** Base.dev URL verification — must match the app id shown in Base.dev → Verify & Add URL */
export const BASE_DEV_APP_ID =
  (process.env.NEXT_PUBLIC_BASE_APP_ID || "").trim() ||
  "69cefcb207b4e4ada87f78da";

export const baseDevUrlVerificationMetadata = {
  other: {
    "base:app_id": BASE_DEV_APP_ID,
  },
};
