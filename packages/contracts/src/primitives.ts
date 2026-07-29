import { z } from "zod";

/** URL fields that can cross retrieval or seller-link boundaries are HTTP(S)-only. */
export const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "URL must use HTTP or HTTPS" },
  );
