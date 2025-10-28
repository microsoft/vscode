import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export async function POST(req: NextRequest) {
  const data = await req.formData();
  const email = String(data.get("email") || "").trim().toLowerCase();
  
  if (!email) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  
  const dir = ".data";
  if (!existsSync(dir)) {
    await mkdir(dir);
  }
  
  const line = `${new Date().toISOString()},${email}\n`;
  await writeFile(`${dir}/subscribers.csv`, line, { flag: "a" });
  
  return NextResponse.redirect(new URL("/", req.url));
}
