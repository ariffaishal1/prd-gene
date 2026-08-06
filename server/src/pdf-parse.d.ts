declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfResult {
    text: string;
  }

  export default function parsePdf(buffer: Buffer): Promise<PdfResult>;
}
