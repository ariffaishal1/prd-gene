import { describe, expect, it, vi } from "vitest";
import { processUploadedFile } from "../src/file-processor.js";

function file(
  originalname: string,
  mimetype: string,
  buffer: Buffer
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: buffer.length,
    destination: "",
    filename: originalname,
    path: "",
    buffer,
    stream: undefined as never
  };
}

describe("processUploadedFile", () => {
  it("membaca PDF yang valid melalui parser", async () => {
    const parser = vi.fn().mockResolvedValue({ text: "Kebutuhan dari PDF" });
    const result = await processUploadedFile(
      file("brief.pdf", "application/pdf", Buffer.from("%PDF-1.4 valid")),
      parser
    );

    expect(result).toMatchObject({ kind: "text", content: "Kebutuhan dari PDF" });
    expect(parser).toHaveBeenCalledOnce();
  });

  it("membaca TXT dan Markdown sebagai UTF-8", async () => {
    const text = await processUploadedFile(
      file("brief.txt", "text/plain", Buffer.from("Target pengguna: PM"))
    );
    const markdown = await processUploadedFile(
      file("brief.md", "text/markdown", Buffer.from("# Catatan"))
    );

    expect(text).toMatchObject({ kind: "text", content: "Target pengguna: PM" });
    expect(markdown).toMatchObject({ kind: "text", content: "# Catatan" });
  });

  it("mengubah gambar valid menjadi data URL", async () => {
    const result = await processUploadedFile(
      file("sketsa.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00]))
    );

    expect(result.kind).toBe("image");
    if (result.kind === "image") expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("menolak extension atau signature palsu", async () => {
    await expect(
      processUploadedFile(file("dokumen.exe", "application/octet-stream", Buffer.from("x")))
    ).rejects.toMatchObject({ code: "INVALID_UPLOAD" });
    await expect(
      processUploadedFile(file("gambar.png", "image/png", Buffer.from("not-png")))
    ).rejects.toMatchObject({ code: "INVALID_UPLOAD" });
  });
});
