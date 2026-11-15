type CertificatePdfData = {
  studentName: string;
  certificateTitle: string;
  description: string | null;
  issuerName: string | null;
  signatureDataUrl?: string | null;
  issuedAt: Date | string;
  code: string;
};

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function pdfSafe(value: string) {
  return value.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\xff]/g, "?").replace(/([\\()])/g, "\\$1");
}

function wrap(text: string, limit: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function createCertificatePdf(data: CertificatePdfData) {
  const commands: string[] = [];
  const text = (value: string, x: number, y: number, size: number, font = "F1", color = "0.08 0.13 0.20") => {
    commands.push(`${color} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfSafe(value)}) Tj ET`);
  };
  const centered = (value: string, y: number, size: number, font = "F1", color = "0.08 0.13 0.20") => {
    const estimate = Math.min(value.length * size * 0.25, 370);
    text(value, Math.max(40, 421 - estimate), y, size, font, color);
  };

  commands.push("0.97 0.98 0.99 rg 0 0 842 595 re f");
  commands.push("0.05 0.47 0.51 RG 3 w 9 9 824 577 re S");
  commands.push("0.78 0.84 0.87 RG 0.7 w 22 22 798 551 re S");
  text("ExamGuard", 64, 524, 22, "F2", "0.08 0.13 0.20");
  text("AI", 166, 524, 22, "F2", "0.05 0.47 0.51");
  commands.push("0.05 0.47 0.51 RG 1.5 w 64 505 m 778 505 l S");
  centered("CERTIFICATE OF ACADEMIC INTEGRITY", 463, 11, "F2", "0.32 0.39 0.47");
  const nameLines = wrap(data.studentName, 38).slice(0, 3);
  nameLines.forEach((line, index) => centered(line, 405 - index * 29, nameLines.length > 1 ? 24 : 30, "F2", "0.08 0.13 0.20"));
  centered("has successfully completed", 309, 14, "F1", "0.25 0.31 0.39");
  const titleLines = wrap(data.certificateTitle, 64).slice(0, 2);
  titleLines.forEach((line, index) => centered(line, 283 - index * 21, 17, "F2", "0.08 0.13 0.20"));

  const description = data.description || "in recognition of academic achievement and commitment to honest work.";
  const descriptionLines = wrap(description, 82);
  const descriptionStart = 260 - titleLines.length * 21;
  descriptionLines.forEach((line, index) => centered(line, descriptionStart - index * 16, 12, "F1", "0.25 0.31 0.39"));

  // Simple shield and check mark, drawn as vector paths so it stays crisp in the PDF.
  commands.push("0.05 0.47 0.51 RG 4 w 421 127 m 444 137 l 444 161 l 421 172 l 398 161 l 398 137 l h S");
  commands.push("0.05 0.47 0.51 RG 5 w 410 148 m 418 140 l 433 156 l S");

  commands.push("0.38 0.45 0.53 RG 0.8 w 64 86 m 250 86 l S");

  let signatureObject: { bytes: Buffer; width: number; height: number } | null = null;
  if (data.signatureDataUrl?.startsWith("data:image/jpeg;base64,")) {
    try {
      const bytes = Buffer.from(data.signatureDataUrl.slice("data:image/jpeg;base64,".length), "base64");
      const size = jpegSize(bytes);
      if (size && size.width > 0 && size.height > 0) signatureObject = { bytes, ...size };
    } catch { /* ignore malformed signature */ }
  }
  if (signatureObject) {
    const scale = 150 / signatureObject.width;
    const w = 150;
    const h = signatureObject.height * scale;
    commands.push(`q ${w} 0 0 ${h.toFixed(2)} 64 ${(86 + 4).toFixed(2)} cm /Im1 Do Q`);
  }

  text(data.issuerName || "Teacher", 64, 66, 11, "F1", "0.32 0.39 0.47");
  text("ISSUED BY", 64, 49, 8, "F2", "0.45 0.51 0.58");
  const issuedAt = data.issuedAt instanceof Date ? data.issuedAt : new Date(data.issuedAt);
  const date = issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  text(`Issued ${date}`, 332, 72, 10, "F1", "0.32 0.39 0.47");
  text(`Verification ID: ${data.code}`, 332, 53, 9, "F1", "0.32 0.39 0.47");
  commands.push("0.38 0.45 0.53 RG 0.8 w 746 55 48 48 re S");
  commands.push("0.05 0.47 0.51 RG 2 w 757 79 m 766 70 l 783 87 l S");

  const stream = commands.join("\n");
  const xobjectEntry = signatureObject ? " /XObject << /Im1 7 0 R >>" : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${xobjectEntry} >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  if (signatureObject) {
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${signatureObject.width} /Height ${signatureObject.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${signatureObject.bytes.length} >>\nstream\n${signatureObject.bytes.toString("latin1")}\nendstream`);
  }
  let pdf = "%PDF-1.4\n%ExamGuardCertificate\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
