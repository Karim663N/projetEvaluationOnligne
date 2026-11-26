// Convertit les documents Markdown du module en Word (.docx, A4) : page de garde, sommaire, tableaux, figures.
// Prerequis : Node 18+ et le paquet npm `docx` (npm install docx@9.5.1).
//   node scripts/md_to_docx.js [documentation|rapport|all] [chemin/vers/node_modules]
// documentation : docs/DOCUMENTATION_TECHNIQUE.md -> docs/DOCUMENTATION_TECHNIQUE.docx
//                 (le diagramme Mermaid est remplace par docs/architecture.png, cf. make_architecture_png.py)
// rapport       : reports/RAPPORT_ML.md -> reports/RAPPORT_ML.docx (a regenerer apres le pipeline)
// A l'ouverture, Word propose de mettre a jour les champs : accepter pour remplir le sommaire.
"use strict";
const fs = require("fs");
const path = require("path");
const which = process.argv[2] || "documentation";
const extra = process.argv[3];
const req = name => require(extra ? path.join(extra, name) : name);
const docx = req("docx");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, ImageRun, ExternalHyperlink, TableOfContents, Footer, PageNumber, LevelFormat, BorderStyle,
  PageBreak, TableLayoutType, VerticalAlign,
} = docx;

const ML = path.resolve(__dirname, "..");
const FIG = path.join(ML, "reports", "figures");
const FONT = "Calibri", MONO = "Consolas";
const CONTENT_W = 11906 - 2 * 1134; // A4, marges 2 cm (DXA)
const PX_FULL = 620;
const ACCENT = "1F4E79", ACCENT2 = "2A6F97";
const TODAY = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// Légendes lisibles des figures du rapport (par nom de fichier)
const FIG_CAPTIONS = {
  "browser_pr_test.png": "branche B, courbes précision-rappel des 4 modèles (test)",
  "browser_confusion_test.png": "branche B, matrice de confusion du modèle retenu (test)",
  "browser_calibration_test.png": "branche B, courbe de calibration (test)",
  "webcam_pr_test.png": "branche A, courbes précision-rappel des 4 modèles (test)",
  "webcam_confusion_test.png": "branche A, matrice de confusion du modèle retenu (test)",
  "webcam_calibration_test.png": "branche A, courbe de calibration (test)",
  "webcam_parity_cost.png": "branche A, coût de la parité (variables reproductibles vs toutes les colonnes)",
  "shap_browser_bar.png": "importance SHAP globale, branche B",
  "shap_webcam_bar.png": "importance SHAP globale, branche A",
  "fusion_pr_partiel.png": "fusion, scénario partiel (SIMULATION)",
  "fusion_pr_concordant.png": "fusion, scénario concordant (SIMULATION)",
};

const DOCS = {
  documentation: {
    src: path.join(ML, "docs", "DOCUMENTATION_TECHNIQUE.md"),
    out: path.join(ML, "docs", "DOCUMENTATION_TECHNIQUE.docx"),
    description: "Détection de comportements suspects en examen en ligne : branche webcam, branche session "
      + "d'examen, fusion pondérée et explications SHAP.",
    source: "ml/docs/DOCUMENTATION_TECHNIQUE.md (même contenu)",
    // figures ajoutées à la fin de certaines sections (titre de section -> figures)
    figuresAfter: {
      "5.4 Résultats": [
        { files: ["browser_pr_test.png", "browser_confusion_test.png"],
          caption: "Branche B — courbes précision-rappel des 4 modèles (test) et matrice de confusion du modèle retenu" },
        { files: ["webcam_pr_test.png", "webcam_parity_cost.png"],
          caption: "Branche A — courbes précision-rappel (test) et coût de la parité (variables reproductibles vs toutes les colonnes)" },
      ],
      "6.2 Branche A — webcam (une image)": [
        { files: ["shap_browser_bar.png", "shap_webcam_bar.png"],
          caption: "Importance SHAP globale — branche B (gauche) et branche A (droite)" },
      ],
      "7. Fusion des deux branches": [
        { files: ["fusion_pr_partiel.png"], caption: "Fusion — courbes précision-rappel, scénario partiel (SIMULATION)" },
      ],
    },
  },
  rapport: {
    src: path.join(ML, "reports", "RAPPORT_ML.md"),
    out: path.join(ML, "reports", "RAPPORT_ML.docx"),
    description: "Résultats, métriques, enquêtes de fuite, fusion simulée, explicabilité, limites et "
      + "récapitulatif du module ML, générés à partir des résultats réels.",
    source: "ml/reports/RAPPORT_ML.md, généré par python -m examguard_ml.report",
    figuresAfter: {},
  },
};

// ---------------------------------------------------------------- utilitaires
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function image(file, widthPx) {
  const { w, h, data } = pngSize(file);
  return new ImageRun({ type: "png", data, transformation: { width: widthPx, height: Math.round(widthPx * h / w) } });
}

function build(cfg) {
  let figNo = 1;
  const caption = text => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240 },
    children: [new TextRun({ text: `Figure ${figNo++} — ${text}`, italics: true, size: 18, color: "555555", font: FONT })],
  });
  const NOBORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

  // une ou deux images côte à côte + légende
  function figureRow(files, text, singleWidth = 440) {
    files = files.filter(f => fs.existsSync(f));
    if (!files.length) return [];
    if (files.length === 1) {
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
                              children: [image(files[0], singleWidth)] }), caption(text)];
    }
    const colW = Math.floor(CONTENT_W / files.length);
    const cells = files.map(f => new TableCell({
      width: { size: colW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      borders: { top: NOBORDER, bottom: NOBORDER, left: NOBORDER, right: NOBORDER },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true,
                                 children: [image(f, Math.round(PX_FULL / files.length) - 12)] })],
    }));
    return [
      new Table({ width: { size: colW * files.length, type: WidthType.DXA }, columnWidths: files.map(() => colW),
                  layout: TableLayoutType.FIXED, rows: [new TableRow({ children: cells })] }),
      caption(text),
    ];
  }

  // Formatage en ligne : **gras**, `code`, *italique*, [texte](lien)
  function inline(text, base = {}) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*)/g;
    let last = 0, m;
    const push = (t, o = {}) => { if (t) out.push(new TextRun({ text: t, font: FONT, ...base, ...o })); };
    const codeStyle = () => ({ font: MONO, size: (base.size || 21) - 2, color: "8B2E1D" });
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) {
        out.push(...inline(tok.slice(2, -2), { ...base, bold: true }));
      } else if (tok.startsWith("`")) {
        push(tok.slice(1, -1), codeStyle());
      } else if (tok.startsWith("[")) {
        const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        const label = mm[1].replace(/`/g, "");
        const isCode = mm[1].startsWith("`");
        if (/^https?:\/\//.test(mm[2])) {
          out.push(new ExternalHyperlink({ link: mm[2], children: [new TextRun({
            text: label, font: isCode ? MONO : FONT, color: "1155CC", underline: {}, size: base.size })] }));
        } else {
          push(label, isCode ? codeStyle() : {});  // lien relatif ou interne : texte seul
        }
      } else {
        out.push(...inline(tok.slice(1, -1), { ...base, italics: true }));
      }
      last = m.index + tok.length;
    }
    push(text.slice(last));
    return out;
  }

  // ---------------------------------------------------------------- tableaux
  const splitRow = line => line.trim().replace(/^\|/, "").replace(/\|$/, "")
    .split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
  function table(lines) {
    const header = splitRow(lines[0]);
    const rows = lines.slice(2).map(splitRow);
    const n = header.length;
    const size = n > 8 ? 15 : n > 6 ? 16 : 18;     // police réduite pour les tableaux larges
    const cw = size * 5.1;                          // largeur moyenne d'un caractère (DXA)
    const plain = s => s.replace(/\*\*|`|\[|\]\([^)]*\)/g, "");
    const all = [header, ...rows];
    // largeur minimale = mot le plus long (jamais coupé), reste réparti selon la longueur du contenu
    const longestWord = j => Math.max(4, ...all.map(r => Math.max(0, ...plain(r[j] || "").split(/\s+/).map(w => w.length))));
    const maxLen = j => Math.min(60, Math.max(6, ...all.map(r => plain(r[j] || "").length)));
    const mins = Array.from({ length: n }, (_, j) => longestWord(j) * cw + 200);
    const minSum = mins.reduce((a, b) => a + b, 0);
    let widths;
    if (minSum >= CONTENT_W) {
      widths = mins.map(m => Math.floor(CONTENT_W * m / minSum));
    } else {
      const extraW = Array.from({ length: n }, (_, j) => Math.max(0, maxLen(j) * cw + 200 - mins[j]));
      const extraSum = extraW.reduce((a, b) => a + b, 0) || 1;
      const room = CONTENT_W - minSum;
      widths = mins.map((m, j) => Math.floor(m + room * extraW[j] / extraSum));
    }
    widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
    const border = { style: BorderStyle.SINGLE, size: 4, color: "BFC9D4" };
    const borders = { top: border, bottom: border, left: border, right: border };
    // keepNext sur l'en-tête et la 1re ligne : l'en-tête ne reste jamais seul en bas de page
    const cell = (txt, j, head, keep) => new TableCell({
      width: { size: widths[j], type: WidthType.DXA }, borders,
      shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "DCE6F0" } : undefined,
      margins: { top: 50, bottom: 50, left: 70, right: 70 },
      children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0, line: 252 }, keepNext: keep,
                                 children: inline(txt || "", { size, bold: head || undefined }) })],
    });
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
      rows: [new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, j) => cell(h, j, true, true)) }),
             ...rows.map((r, k) => new TableRow({ cantSplit: true,
               children: header.map((_, j) => cell(r[j], j, false, k === 0 && rows.length > 1)) }))],
    });
  }

  // ---------------------------------------------------------------- code
  function codeBlock(lines) {
    const shade = { type: ShadingType.CLEAR, color: "auto", fill: "F3F5F7" };
    // police réduite si une ligne dépasse ~100 caractères, pour éviter les retours à la ligne
    const longest = Math.max(...lines.map(l => l.length));
    const size = longest > 112 ? 13 : longest > 100 ? 14 : 16;
    return lines.map((l, i) => new Paragraph({
      alignment: AlignmentType.LEFT, shading: shade,
      spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
      indent: { left: 120, right: 120 }, keepLines: true, keepNext: i < lines.length - 1,
      children: [new TextRun({ text: l.length ? l : " ", font: MONO, size })],
    }));
  }

  // ---------------------------------------------------------------- conversion
  const mdDir = path.dirname(cfg.src);
  const md = fs.readFileSync(cfg.src, "utf8").replace(/\r\n/g, "\n").split("\n");
  const body = [], intro = [];
  let docTitle = "", i = 0, numInstance = 0, currentH = null;
  const emit = p => (currentH ? body : intro).push(p);   // avant le 1er titre : page de garde

  function flushFigures(heading) {
    for (const fig of cfg.figuresAfter[heading] || []) body.push(...figureRow(fig.files.map(f => path.join(FIG, f)), fig.caption));
  }
  function heading(text, level) {
    if (currentH) flushFigures(currentH);
    currentH = text;
    text = text.replace(/`|\*\*/g, "");  // pas de balisage Markdown dans les titres ni le sommaire
    body.push(new Paragraph({ heading: level, children: [new TextRun({ text, font: FONT })] }));
  }
  const IMG_LINE = /^\s*(!\[[^\]]*\]\([^)]+\)\s*)+$/;

  while (i < md.length) {
    const line = md[i];
    if (/^# /.test(line)) { docTitle = line.slice(2).trim(); i++; continue; }
    if (/^## Sommaire/.test(line)) {           // remplacé par un sommaire Word
      i++;
      while (i < md.length && !/^---\s*$/.test(md[i]) && !/^## /.test(md[i])) i++;
      continue;
    }
    if (/^---\s*$/.test(line) || line.trim() === "" || /^<\/?details|^<summary/.test(line.trim())) { i++; continue; }
    if (/^## /.test(line)) { heading(line.slice(3).trim(), HeadingLevel.HEADING_1); i++; continue; }
    if (/^### /.test(line)) { heading(line.slice(4).trim(), HeadingLevel.HEADING_2); i++; continue; }
    if (IMG_LINE.test(line)) {                // images Markdown : 2 par ligne au maximum
      const files = [...line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => path.resolve(mdDir, m[1]));
      for (let k = 0; k < files.length; k += 2) {
        const pair = files.slice(k, k + 2);
        const text = pair.map(f => FIG_CAPTIONS[path.basename(f)] || path.basename(f)).join(" ; ");
        // image restée seule sur une ligne qui en contenait plusieurs : même taille que ses voisines
        body.push(...figureRow(pair, text.charAt(0).toUpperCase() + text.slice(1), files.length > 1 ? 300 : 440));
      }
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const block = [];
      i++;
      while (i < md.length && !/^```/.test(md[i])) block.push(md[i++]);
      i++;
      if (lang === "mermaid") {
        body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
                                  children: [image(path.join(ML, "docs", "architecture.png"), PX_FULL)] }));
        body.push(caption("Architecture du module ML et flux des données"));
      } else {
        body.push(...codeBlock(block));
      }
      continue;
    }
    if (/^\|/.test(line)) {
      const block = [];
      while (i < md.length && /^\|/.test(md[i])) block.push(md[i++]);
      body.push(table(block));
      body.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }));
      continue;
    }
    if (/^> /.test(line) || line === ">") {
      const block = [];
      while (i < md.length && /^>/.test(md[i])) block.push(md[i++].replace(/^> ?/, ""));
      emit(new Paragraph({
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT2, space: 8 } },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF4F9" },
        spacing: { before: 120, after: 200 }, indent: { left: 160 },
        children: inline(block.join(" ")),
      }));
      continue;
    }
    const bullet = /^(\s*)- (.*)$/.exec(line);
    const numbered = /^(\d+)\. (.*)$/.exec(line);
    if (bullet || numbered) {
      const isNum = !!numbered;
      if (isNum) numInstance++;
      while (i < md.length) {
        const b = /^(\s*)- (.*)$/.exec(md[i]);
        const n = /^(\d+)\. (.*)$/.exec(md[i]);
        if (isNum ? !n : !b) break;
        let text = (isNum ? n[2] : b[2]);
        i++;
        while (i < md.length && /^\s{2,}\S/.test(md[i]) && !/^\s*- /.test(md[i])) text += " " + md[i++].trim();
        emit(new Paragraph({
          numbering: isNum ? { reference: "num", level: 0, instance: numInstance } : { reference: "bullets", level: 0 },
          spacing: { before: 0, after: 60 }, children: inline(text),
        }));
      }
      emit(new Paragraph({ spacing: { before: 0, after: 60 }, children: [] }));
      continue;
    }
    // paragraphe : lignes consécutives
    const para = [line.trim()];
    i++;
    while (i < md.length && md[i].trim() !== "" && !/^(#|\||```|>|- |\d+\. |---|!\[)/.test(md[i])) para.push(md[i++].trim());
    const text = para.join(" ");
    // intitulé qui introduit un tableau / une liste : ne jamais le laisser seul en bas de page
    const leadsIn = /:\s*$/.test(text) || (text.startsWith("**") && text.length < 160);
    emit(new Paragraph({ spacing: { before: 0, after: 140 }, keepNext: leadsIn, children: inline(text) }));
  }
  if (currentH) flushFigures(currentH);

  // ---------------------------------------------------------------- page de garde + sommaire
  const [mainTitle, subTitle] = docTitle.split(" — ");
  const cover = [
    new Paragraph({ spacing: { before: 2600, after: 120 },
                    children: [new TextRun({ text: mainTitle || docTitle, font: FONT, size: 64, bold: true, color: ACCENT })] }),
    new Paragraph({ spacing: { after: 360 },
                    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT2, space: 6 } },
                    children: [new TextRun({ text: subTitle || "", font: FONT, size: 36, color: ACCENT2 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: cfg.description, font: FONT, size: 24 })] }),
    new Paragraph({ spacing: { before: 1800, after: 60 }, children: [new TextRun({ text: "Équipe ExamGuard AI", font: FONT, size: 22, bold: true })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({
      text: `${TODAY} — module ML v0.1.0, modèles entraînés le 15 novembre 2026`, font: FONT, size: 20, color: "555555" })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `Source : ${cfg.source}`, font: FONT, size: 18, color: "777777" })] }),
    ...intro,
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { before: 0, after: 240 },
                    children: [new TextRun({ text: "Sommaire", font: FONT, size: 32, bold: true, color: ACCENT })] }),
    new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
    new TextRun({ text: `${docTitle}    `, font: FONT, size: 16, color: "777777" }),
    new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "777777" }),
  ] })] });

  const doc = new Document({
    creator: "Équipe ExamGuard AI", title: docTitle, description: cfg.description,
    features: { updateFields: true },  // Word propose de mettre à jour le sommaire à l'ouverture
    styles: {
      default: {
        document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 276 } } },
        title: { run: { font: FONT, size: 56, bold: true, color: ACCENT }, paragraph: { spacing: { before: 0, after: 200 } } },
        // outlineLevel indispensable pour que Word 2007 remplisse le sommaire
        heading1: { run: { font: FONT, size: 32, bold: true, color: ACCENT },
                    paragraph: { spacing: { before: 360, after: 140 }, keepNext: true, keepLines: true, outlineLevel: 0 } },
        heading2: { run: { font: FONT, size: 26, bold: true, color: ACCENT2 },
                    paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
      },
      // style Normal explicite (aligné à gauche) : sinon Word applique le Normal du modèle local (ici justifié)
      paragraphStyles: [
        { id: "Normal", name: "Normal", quickFormat: true,
          run: { font: FONT, size: 21 }, paragraph: { alignment: AlignmentType.LEFT, spacing: { line: 276 } } },
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
    ] },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, titlePage: true },
      footers: { default: footer, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
      children: [...cover, ...body],
    }],
  });
  return { doc, figures: () => figNo - 1 };
}

// Réécrit le ZIP sans entrées « dossier » (certains services de co-édition refusent ces fichiers)
async function stripFolderEntries(buf) {
  const JSZip = req("jszip");
  const src = await JSZip.loadAsync(buf);
  const out = new JSZip();
  for (const [name, entry] of Object.entries(src.files)) {
    if (!entry.dir) out.file(name, await entry.async("uint8array"), { date: new Date(), createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

(async () => {
  const names = which === "all" ? Object.keys(DOCS) : [which];
  for (const name of names) {
    const cfg = DOCS[name];
    if (!cfg) throw new Error(`document inconnu : ${name} (documentation | rapport | all)`);
    const { doc, figures } = build(cfg);
    const buf = await stripFolderEntries(await Packer.toBuffer(doc));
    fs.writeFileSync(cfg.out, buf);
    console.log(`${cfg.out} (${(buf.length / 1024).toFixed(0)} Ko, ${figures()} figures)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
