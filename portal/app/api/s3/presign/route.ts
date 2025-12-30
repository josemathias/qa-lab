import { NextResponse } from "next/server";
import { z } from "zod";
import { presignGetObject } from "@/lib/s3";

export const runtime = "nodejs";

const BodySchema = z.object({
  key: z.string().min(1),
  expiresInSeconds: z.number().int().min(30).max(3600).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, expiresInSeconds } = parsed.data;
  const url = await presignGetObject(key, expiresInSeconds ?? 300);
  return NextResponse.json({ url });
}